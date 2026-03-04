import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Upload,
    Trash2,
    Sparkles,
    Image as ImageIcon,
    Video,
    Music,
    Search,
    Loader2,
    X,
    Download,
    ArrowLeft,
    Copy,
    Check,
    Play,
    Eye,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
    uploadAsset,
    deleteAsset,
    listAssets,
    formatBytes,
    type AssetMetadata,
    type UploadProgress,
    uploadBase64Asset,
} from "@/lib/storage";
import { generateImage } from "@/lib/gemini";

type FileTypeFilter = "all" | "image" | "video" | "audio";

export default function AssetLibrary() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State
    const [assets, setAssets] = useState<AssetMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FileTypeFilter>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AssetMetadata | null>(null);
    const [deleting, setDeleting] = useState(false);

    // AI Generation Dialog
    const [aiDialogOpen, setAiDialogOpen] = useState(false);
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiGenerating, setAiGenerating] = useState(false);

    // Clipboard
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Fetch assets
    const fetchAssets = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listAssets({
                type: filter === "all" ? undefined : filter,
            });
            setAssets(result.assets);
        } catch (err) {
            console.error("Failed to fetch assets:", err);
            toast.error("Failed to load assets");
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    // Filter assets by search query
    const filteredAssets = assets.filter((asset) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            asset.name.toLowerCase().includes(q) ||
            asset.description?.toLowerCase().includes(q)
        );
    });

    // Upload handler
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;

        setUploading(true);
        setUploadProgress(null);

        let successCount = 0;
        let errorCount = 0;

        for (const file of Array.from(files)) {
            try {
                await uploadAsset(file, {
                    onProgress: (progress) => setUploadProgress(progress),
                });
                successCount++;
            } catch (err) {
                console.error(`Failed to upload ${file.name}:`, err);
                errorCount++;
            }
        }

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = "";
        setUploading(false);
        setUploadProgress(null);

        if (successCount > 0) {
            toast.success(`Uploaded ${successCount} file${successCount > 1 ? "s" : ""}`);
        }
        if (errorCount > 0) {
            toast.error(`Failed to upload ${errorCount} file${errorCount > 1 ? "s" : ""}`);
        }

        fetchAssets();
    };

    // Delete handler
    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteAsset(deleteTarget.id);
            toast.success("Asset deleted");
            setDeleteTarget(null);
            fetchAssets();
        } catch (err) {
            console.error("Delete failed:", err);
            toast.error("Failed to delete asset");
        } finally {
            setDeleting(false);
        }
    };

    // AI Image Generation
    const handleAiGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setAiGenerating(true);

        try {
            toast.info("Generating image with AI...", { duration: 10000 });
            const { base64, mimeType } = await generateImage(aiPrompt);

            // Upload to Supabase Storage
            const ext = mimeType.split("/")[1] || "png";
            const fileName = `ai_generated_${Date.now()}.${ext}`;
            await uploadBase64Asset(base64, mimeType, fileName, {
                description: `AI Generated: ${aiPrompt}`,
            });

            toast.success("AI image generated and saved!");
            setAiDialogOpen(false);
            setAiPrompt("");
            fetchAssets();
        } catch (err) {
            console.error("AI generation failed:", err);
            toast.error(
                `AI generation failed: ${err instanceof Error ? err.message : "Unknown error"}`
            );
        } finally {
            setAiGenerating(false);
        }
    };

    // Copy URL to clipboard
    const handleCopyUrl = async (asset: AssetMetadata) => {
        try {
            await navigator.clipboard.writeText(asset.public_url);
            setCopiedId(asset.id);
            toast.success("URL copied to clipboard");
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            toast.error("Failed to copy URL");
        }
    };

    // Icon for file type
    const getFileIcon = (type: string) => {
        switch (type) {
            case "image":
                return <ImageIcon className="h-4 w-4" />;
            case "video":
                return <Video className="h-4 w-4" />;
            case "audio":
                return <Music className="h-4 w-4" />;
            default:
                return <ImageIcon className="h-4 w-4" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/admin")}
                        className="shrink-0"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Asset Library</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage images, videos, and audio for your courses
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setAiDialogOpen(true)}
                        className="gap-2"
                    >
                        <Sparkles className="h-4 w-4" />
                        AI Generate
                    </Button>
                    <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                        <Upload className="h-4 w-4" />
                        Upload
                    </Button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*,audio/*"
                        multiple
                        onChange={handleFileUpload}
                    />
                </div>
            </div>

            {/* Upload Progress */}
            {uploading && uploadProgress && (
                <Card className="p-4 border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <div className="flex-1">
                            <p className="text-sm font-medium">{uploadProgress.message}</p>
                            <div className="mt-1 h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full bg-primary rounded-full transition-all duration-300"
                                    style={{ width: `${uploadProgress.progress}%` }}
                                />
                            </div>
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {Math.round(uploadProgress.progress)}%
                        </span>
                    </div>
                </Card>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search assets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                            onClick={() => setSearchQuery("")}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
                <div className="flex gap-1.5">
                    {(["all", "image", "video", "audio"] as FileTypeFilter[]).map((type) => (
                        <Button
                            key={type}
                            variant={filter === type ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilter(type)}
                            className="capitalize"
                        >
                            {type}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Assets Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : filteredAssets.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-20 text-center">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">No assets found</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                        {searchQuery
                            ? "Try adjusting your search or filters"
                            : "Upload images, videos, or audio files to get started"}
                    </p>
                    {!searchQuery && (
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-4 gap-2"
                        >
                            <Upload className="h-4 w-4" />
                            Upload First Asset
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {filteredAssets.map((asset) => (
                        <Card
                            key={asset.id}
                            className="group relative overflow-hidden rounded-lg border hover:border-primary/50 transition-colors"
                        >
                            {/* Preview */}
                            <div className="aspect-square bg-muted relative overflow-hidden">
                                {asset.file_type === "image" ? (
                                    <img
                                        src={asset.public_url}
                                        alt={asset.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : asset.file_type === "video" ? (
                                    <div className="w-full h-full relative bg-zinc-900">
                                        <video
                                            src={asset.public_url}
                                            className="w-full h-full object-cover"
                                            muted
                                            preload="metadata"
                                            onLoadedData={(e) => {
                                                // Seek to 1 second for a better thumbnail frame
                                                const vid = e.currentTarget;
                                                if (vid.duration > 1) vid.currentTime = 1;
                                            }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                                            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                                <Play className="h-5 w-5 text-zinc-800 ml-0.5" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                                        <Music className="h-10 w-10 text-zinc-500" />
                                    </div>
                                )}

                                {/* AI badge */}
                                {asset.ai_generated && (
                                    <Badge className="absolute top-2 left-2 gap-1 bg-violet-600/90 text-white text-[10px] px-1.5 py-0.5">
                                        <Sparkles className="h-2.5 w-2.5" />
                                        AI
                                    </Badge>
                                )}

                                {/* Hover actions */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    {asset.file_type === "video" && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 text-white hover:bg-white/20"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(asset.public_url, "_blank");
                                            }}
                                            title="Preview"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-white hover:bg-white/20"
                                        onClick={() => handleCopyUrl(asset)}
                                        title="Copy URL"
                                    >
                                        {copiedId === asset.id ? (
                                            <Check className="h-4 w-4" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-white hover:bg-white/20"
                                        onClick={() => window.open(asset.public_url, "_blank")}
                                        title="Download"
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-red-400 hover:bg-red-500/20"
                                        onClick={() => setDeleteTarget(asset)}
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-2.5">
                                <p className="text-xs font-medium truncate" title={asset.name}>
                                    {asset.name}
                                </p>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        {getFileIcon(asset.file_type)}
                                        {asset.file_type}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                        {formatBytes(asset.file_size)}
                                    </span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Asset count */}
            {!loading && filteredAssets.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                    {filteredAssets.length} asset{filteredAssets.length !== 1 ? "s" : ""}
                    {searchQuery && ` matching "${searchQuery}"`}
                </p>
            )}

            {/* Delete Confirmation */}
            <AlertDialog
                open={!!deleteTarget}
                onOpenChange={(open) => !open && setDeleteTarget(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-foreground">
                                {deleteTarget?.name}
                            </span>
                            ? This will permanently remove the file from storage. This action
                            cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* AI Generation Dialog */}
            <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-violet-500" />
                            AI Image Generation
                        </DialogTitle>
                        <DialogDescription>
                            Describe the image you want to generate. Uses Gemini&apos;s native
                            image generation to create course visuals.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="ai-prompt">Image Description</Label>
                            <Textarea
                                id="ai-prompt"
                                placeholder="e.g., A construction worker wearing PPE on a building site, professional corporate training style, bright and modern..."
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                rows={4}
                                disabled={aiGenerating}
                            />
                        </div>

                        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                <strong>Note:</strong> AI image generation uses your Gemini API
                                credits. Each generation consumes approximately 1 API call.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setAiDialogOpen(false)}
                            disabled={aiGenerating}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleAiGenerate}
                            disabled={!aiPrompt.trim() || aiGenerating}
                            className="gap-2"
                        >
                            {aiGenerating ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Generate Image
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
