import { supabase } from "./supabase";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

const BUCKET_NAME = "mylearning-assets";

// ============================================
// Types
// ============================================
export interface AssetMetadata {
    id: string;
    name: string;
    file_path: string;
    public_url: string;
    file_type: "image" | "video" | "audio";
    mime_type: string;
    file_size: number;
    description: string | null;
    ai_generated: boolean;
    uploaded_by: string;
    created_at: string;
}

export interface UploadProgress {
    stage: "compressing" | "uploading" | "saving";
    progress: number; // 0-100
    message: string;
}

// ============================================
// Video Compression (FFmpeg.wasm)
// ============================================
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

    ffmpegInstance = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

    await ffmpegInstance.load({
        coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript"
        ),
        wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
        ),
    });

    ffmpegLoaded = true;
    return ffmpegInstance;
}

/**
 * Compress a video file client-side using FFmpeg.wasm.
 * Maintains original resolution while reducing file size ~40-70%.
 */
export async function compressVideo(
    file: File,
    onProgress?: (progress: UploadProgress) => void
): Promise<File> {
    onProgress?.({
        stage: "compressing",
        progress: 5,
        message: "Loading video compressor...",
    });

    const ffmpeg = await getFFmpeg();

    // Listen for progress
    ffmpeg.on("progress", ({ progress }) => {
        const pct = Math.round(progress * 100);
        onProgress?.({
            stage: "compressing",
            progress: Math.min(pct, 95),
            message: `Compressing video... ${Math.min(pct, 95)}%`,
        });
    });

    const inputName = "input" + getExtension(file.name);
    const outputName = "output.mp4";

    await ffmpeg.writeFile(inputName, await fetchFile(file));

    // H.264 encoding with CRF 23 (visually lossless), preserves resolution
    await ffmpeg.exec([
        "-i", inputName,
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "medium",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart", // Enables progressive loading
        "-y", outputName,
    ]);

    const data = await ffmpeg.readFile(outputName);

    // Cleanup
    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    // Convert FFmpeg output to ArrayBuffer to avoid Uint8Array/BlobPart type issues
    const rawData = data as Uint8Array;
    const arrayBuffer = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength) as ArrayBuffer;
    const compressedBlob = new Blob([arrayBuffer], { type: "video/mp4" });
    const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^.]+$/, ".mp4"),
        { type: "video/mp4" }
    );

    onProgress?.({
        stage: "compressing",
        progress: 100,
        message: `Compressed: ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)}`,
    });

    return compressedFile;
}

// ============================================
// Upload Functions
// ============================================

/**
 * Upload a file to Supabase Storage + create metadata record.
 * For videos, automatically compresses first if > 10MB.
 */
export async function uploadAsset(
    file: File,
    options: {
        description?: string;
        aiGenerated?: boolean;
        skipCompression?: boolean;
        onProgress?: (progress: UploadProgress) => void;
    } = {}
): Promise<AssetMetadata> {
    const { description, aiGenerated = false, skipCompression = false, onProgress } = options;

    const fileType = getFileType(file.type);
    let uploadFile = file;

    // Auto-compress videos > 10MB unless skipped
    if (fileType === "video" && file.size > 10 * 1024 * 1024 && !skipCompression) {
        uploadFile = await compressVideo(file, onProgress);
    }

    onProgress?.({
        stage: "uploading",
        progress: 0,
        message: "Uploading to storage...",
    });

    // Generate unique path: type/timestamp_filename
    const timestamp = Date.now();
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${fileType}s/${timestamp}_${safeName}`;

    // Use XHR for real progress tracking (Supabase SDK doesn't report upload progress)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const { data: { session } } = await supabase.auth.getSession();
    const authToken = session?.access_token || supabaseKey;

    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const url = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                onProgress?.({
                    stage: "uploading",
                    progress: pct,
                    message: `Uploading... ${formatBytes(e.loaded)} / ${formatBytes(e.total)}`,
                });
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                let errorMsg = `Upload failed (${xhr.status})`;
                try {
                    const body = JSON.parse(xhr.responseText);
                    errorMsg = body.message || body.error || body.statusCode || errorMsg;
                    // Surface file-size specific errors clearly
                    if (typeof errorMsg === "string" && (errorMsg.toLowerCase().includes("size") || errorMsg.toLowerCase().includes("exceed") || errorMsg.toLowerCase().includes("limit"))) {
                        errorMsg = `File too large (${formatBytes(uploadFile.size)}). ${errorMsg}. Update the global file size limit in Supabase Dashboard → Storage → Settings.`;
                    }
                } catch { /* ignore */ }
                reject(new Error(errorMsg));
            }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

        xhr.open("POST", url, true);
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        xhr.setRequestHeader("apikey", supabaseKey);
        xhr.setRequestHeader("Content-Type", uploadFile.type || "application/octet-stream");
        xhr.setRequestHeader("x-upsert", "false");
        xhr.setRequestHeader("cache-control", "3600");
        xhr.send(uploadFile);
    });

    onProgress?.({
        stage: "uploading",
        progress: 100,
        message: "Upload complete!",
    });

    // Get public URL
    const { data: urlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    onProgress?.({
        stage: "saving",
        progress: 50,
        message: "Saving metadata...",
    });

    // Insert metadata record
    const { data: assetData, error: insertError } = await supabase
        .from("mylearning_assets")
        .insert({
            name: file.name, // Original name, not sanitized
            file_path: filePath,
            public_url: publicUrl,
            file_type: fileType,
            mime_type: uploadFile.type,
            file_size: uploadFile.size,
            description: description || null,
            ai_generated: aiGenerated,
            uploaded_by: user.id,
        })
        .select()
        .single();

    if (insertError) throw new Error(`Failed to save metadata: ${insertError.message}`);

    onProgress?.({
        stage: "saving",
        progress: 100,
        message: "Done!",
    });

    return assetData as AssetMetadata;
}

/**
 * Upload a base64-encoded file (for AI-generated images).
 */
export async function uploadBase64Asset(
    base64Data: string,
    mimeType: string,
    fileName: string,
    options: {
        description?: string;
    } = {}
): Promise<AssetMetadata> {
    // Convert base64 to File
    const byteString = atob(base64Data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    return uploadAsset(file, {
        description: options.description,
        aiGenerated: true,
    });
}

/**
 * Delete an asset from storage and database.
 */
export async function deleteAsset(assetId: string): Promise<void> {
    // Get the file path first
    const { data: asset, error: fetchError } = await supabase
        .from("mylearning_assets")
        .select("file_path")
        .eq("id", assetId)
        .single();

    if (fetchError) throw new Error(`Asset not found: ${fetchError.message}`);

    // Delete from storage
    const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([asset.file_path]);

    if (storageError) {
        console.warn("Storage delete failed (may already be removed):", storageError);
    }

    // Delete metadata
    const { error: deleteError } = await supabase
        .from("mylearning_assets")
        .delete()
        .eq("id", assetId);

    if (deleteError) throw new Error(`Failed to delete asset record: ${deleteError.message}`);
}

/**
 * List assets with optional filtering.
 */
export async function listAssets(
    filter?: {
        type?: "image" | "video" | "audio";
        search?: string;
        limit?: number;
        offset?: number;
    }
): Promise<{ assets: AssetMetadata[]; count: number }> {
    let query = supabase
        .from("mylearning_assets")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

    if (filter?.type) {
        query = query.eq("file_type", filter.type);
    }

    if (filter?.search) {
        query = query.or(
            `name.ilike.%${filter.search}%,description.ilike.%${filter.search}%`
        );
    }

    if (filter?.limit) {
        const offset = filter.offset || 0;
        query = query.range(offset, offset + filter.limit - 1);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`Failed to list assets: ${error.message}`);

    return {
        assets: (data || []) as AssetMetadata[],
        count: count || 0,
    };
}

/**
 * Get public URL for a file path.
 */
export function getAssetUrl(filePath: string): string {
    const { data } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);
    return data.publicUrl;
}

// ============================================
// Asset Library: Browse & Duplicate Detection
// ============================================

/**
 * Check if a file with the same name already exists in the asset library.
 * Returns the existing asset metadata if found, null otherwise.
 */
export async function checkDuplicate(filename: string): Promise<AssetMetadata | null> {
    const { data, error } = await supabase
        .from("mylearning_assets")
        .select("*")
        .eq("name", filename)
        .limit(1)
        .maybeSingle();

    if (error) {
        console.warn("Duplicate check failed:", error.message);
        return null; // Fail open — allow upload if check fails
    }

    return data as AssetMetadata | null;
}

/**
 * Fetch assets from the library, optionally filtered by type and search query.
 */
export async function fetchAssets(options: {
    filterType?: "image" | "video";
    search?: string;
    limit?: number;
} = {}): Promise<AssetMetadata[]> {
    let query = supabase
        .from("mylearning_assets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(options.limit || 50);

    if (options.filterType) {
        query = query.eq("file_type", options.filterType);
    }

    if (options.search && options.search.trim()) {
        // Search by name or description (case-insensitive partial match)
        query = query.or(
            `name.ilike.%${options.search.trim()}%,description.ilike.%${options.search.trim()}%`
        );
    }

    const { data, error } = await query;

    if (error) {
        console.error("Failed to fetch assets:", error.message);
        return [];
    }

    return (data || []) as AssetMetadata[];
}

// ============================================
// Helpers
// ============================================

function getFileType(mimeType: string): "image" | "video" | "audio" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    throw new Error(`Unsupported file type: ${mimeType}`);
}

function getExtension(filename: string): string {
    const match = filename.match(/\.[^.]+$/);
    return match ? match[0] : ".mp4";
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
