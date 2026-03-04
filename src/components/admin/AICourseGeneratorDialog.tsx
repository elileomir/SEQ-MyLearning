import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Sparkles,
  Loader2,
  Video,
  ImageIcon,
  Plus,
  Trash2,
  Wand2,
  Upload,
  CheckCircle2,
  FolderOpen,
  FileText,
  X,
  ScanSearch,
} from "lucide-react";
import { uploadAsset, checkDuplicate, type UploadProgress } from "@/lib/storage";
import { AssetPickerDialog } from "@/components/admin/AssetPickerDialog";
import { analyzeImageFromUrl, analyzeVideoFromUrl } from "@/lib/gemini";
import { extractTextFromFile, SUPPORTED_DOC_TYPES } from "@/lib/documentParser";
import { toast } from "sonner";

interface AICourseGeneratorDialogProps {
  onGenerate: (data: CourseGenerationParams) => Promise<void>;
  isGenerating?: boolean;
}

export interface CustomImageEntry {
  url: string;
  description: string;
}

export interface VideoEntry {
  url: string;
  description: string;
}

export interface CourseGenerationParams {
  topic: string;
  moduleCount: number;        // 0 = AI decides
  includeQuiz: boolean;
  quizCount: number;          // 0 = AI decides, 5-30
  includeVideo: boolean;
  videos: VideoEntry[];
  customImages: CustomImageEntry[];
  includeAiImages: boolean;
  maxAiImages: number;
  documentContext?: string;
}

/** Progress state that covers upload + AI analysis phases */
interface FullProgress {
  stage: "compressing" | "uploading" | "saving" | "analyzing";
  progress: number;
  message: string;
}

/** Slim progress bar component */
function ProgressStrip({ progress }: { progress: FullProgress }) {
  const stageColors: Record<string, string> = {
    compressing: "from-amber-500 to-orange-500",
    uploading: "from-blue-500 to-indigo-500",
    saving: "from-indigo-500 to-purple-500",
    analyzing: "from-purple-500 to-pink-500",
  };
  const gradient = stageColors[progress.stage] || "from-purple-500 to-indigo-500";

  return (
    <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${gradient} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${Math.max(progress.progress, 3)}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500 font-medium truncate">
          {progress.message}
        </span>
        <span className="text-[10px] text-gray-400 font-mono tabular-nums shrink-0 ml-2">
          {progress.progress}%
        </span>
      </div>
    </div>
  );
}

export function AICourseGeneratorDialog({
  onGenerate,
  isGenerating = false,
}: AICourseGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [moduleCount, setModuleCount] = useState([5]);
  const [aiDecideModules, setAiDecideModules] = useState(false);
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [quizCount, setQuizCount] = useState([10]);
  const [aiDecideQuiz, setAiDecideQuiz] = useState(false);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [videos, setVideos] = useState<VideoEntry[]>([]);
  const [videoProgress, setVideoProgress] = useState<Record<number, FullProgress | null>>({});
  const [includeCustomImages, setIncludeCustomImages] = useState(false);
  const [customImages, setCustomImages] = useState<CustomImageEntry[]>([]);
  const [includeAiImages, setIncludeAiImages] = useState(false);
  const [maxAiImages, setMaxAiImages] = useState([3]);
  const [aiDecideAiImages, setAiDecideAiImages] = useState(false);
  const [documentContext, setDocumentContext] = useState("");
  const [documentFileName, setDocumentFileName] = useState("");
  const [documentParsing, setDocumentParsing] = useState(false);
  const [imageProgress, setImageProgress] = useState<Record<number, FullProgress | null>>({});
  const imageFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const documentFileRef = useRef<HTMLInputElement>(null);
  const activeUploadIndex = useRef<number>(0);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerContext, setAssetPickerContext] = useState<{
    type: "image" | "video";
    imageIndex?: number;
  }>({ type: "image" });

  // ---- AI Analysis Confirmation ----
  const [analyzeConfirm, setAnalyzeConfirm] = useState<{
    open: boolean;
    assets: Array<{ type: 'image' | 'video'; index: number; url: string }>;
  } | null>(null);

  const runAiAnalysis = async (assets: Array<{ type: 'image' | 'video'; index: number; url: string }>) => {
    for (const asset of assets) {
      if (asset.type === 'image') {
        setImageProgressForIndex(asset.index, { stage: 'analyzing', progress: 50, message: 'AI analyzing image...' });
        try {
          const desc = await analyzeImageFromUrl(asset.url);
          updateCustomImage(asset.index, 'description', desc);
          setImageProgressForIndex(asset.index, { stage: 'analyzing', progress: 100, message: 'Done!' });
        } catch {
          toast.info("Couldn't auto-describe image. Add a description manually.");
        } finally {
          setTimeout(() => setImageProgressForIndex(asset.index, null), 1500);
        }
      } else {
        setVideoProgressForIndex(asset.index, { stage: 'analyzing', progress: 50, message: 'AI analyzing video...' });
        try {
          const desc = await analyzeVideoFromUrl(asset.url);
          updateVideo(asset.index, 'description', desc);
          setVideoProgressForIndex(asset.index, { stage: 'analyzing', progress: 100, message: 'Done!' });
        } catch {
          toast.info("Couldn't auto-describe video. Add a description manually.");
        } finally {
          setTimeout(() => setVideoProgressForIndex(asset.index, null), 1500);
        }
      }
    }
  };

  const promptAnalyzeConfirmation = (assets: Array<{ type: 'image' | 'video'; index: number; url: string }>) => {
    const needsAnalysis = assets.filter(a => {
      if (a.type === 'image') return !customImages[a.index]?.description?.trim();
      return !videos[a.index]?.description?.trim();
    });
    if (needsAnalysis.length === 0) return;
    setAnalyzeConfirm({ open: true, assets: needsAnalysis });
  };

  // ---- Image helpers ----
  const addCustomImage = () => {
    if (customImages.length >= 30) return;
    setCustomImages([...customImages, { url: "", description: "" }]);
  };

  const removeCustomImage = (index: number) => {
    setCustomImages(customImages.filter((_, i) => i !== index));
    setImageProgress((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateCustomImage = (
    index: number,
    field: keyof CustomImageEntry,
    value: string
  ) => {
    setCustomImages((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const setImageProgressForIndex = (index: number, p: FullProgress | null) => {
    setImageProgress((prev) => ({ ...prev, [index]: p }));
  };

  const triggerImageUpload = (index: number) => {
    activeUploadIndex.current = index;
    imageFileRef.current?.click();
  };

  const handleImageFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const startIndex = activeUploadIndex.current;

    // Ensure enough slots exist for the new files
    setCustomImages((prev) => {
      const neededSlots = startIndex + files.length;
      if (neededSlots <= prev.length) return prev;
      const additional = Math.min(neededSlots, 30) - prev.length;
      return [
        ...prev,
        ...Array.from({ length: additional }, () => ({ url: "", description: "" })),
      ];
    });

    for (let i = 0; i < files.length; i++) {
      const index = startIndex + i;
      if (index >= 30) {
        toast.warning("Maximum of 30 images allowed. Skipped remaining files.");
        break;
      }

      const file = files[i];

      // Duplicate detection — skip upload if same filename exists
      const existing = await checkDuplicate(file.name);
      if (existing) {
        updateCustomImage(index, "url", existing.public_url);
        if (existing.description) {
          updateCustomImage(index, "description", existing.description);
        }
        toast.info(`"${file.name}" already in library — using existing asset.`);
        continue;
      }

      try {
        const asset = await uploadAsset(file, {
          onProgress: (p: UploadProgress) => {
            setImageProgressForIndex(index, {
              stage: p.stage,
              progress: p.progress,
              message: p.message,
            });
          },
        });

        updateCustomImage(index, "url", asset.public_url);
        toast.success(`Uploaded "${file.name}"`);

        // Prompt user to confirm AI analysis
        promptAnalyzeConfirmation([{ type: 'image', index, url: asset.public_url }]);
      } catch (err: any) {
        toast.error("Upload failed: " + (err.message || "Unknown error"));
      } finally {
        // Clear progress after a short delay to show "Done!"
        setTimeout(() => setImageProgressForIndex(index, null), 1500);
      }
    }

    if (imageFileRef.current) imageFileRef.current.value = "";
  };

  const handleImageUrlBlur = (index: number) => {
    const img = customImages[index];
    if (!img?.url.trim() || img.description.trim()) return;
    promptAnalyzeConfirmation([{ type: 'image', index, url: img.url }]);
  };

  // ---- Video helpers ----
  const addVideo = () => {
    if (videos.length >= 30) return;
    setVideos((prev) => [...prev, { url: "", description: "" }]);
  };

  const removeVideo = (index: number) => {
    setVideos((prev) => prev.filter((_, i) => i !== index));
    setVideoProgress((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const updateVideo = (
    index: number,
    field: keyof VideoEntry,
    value: string
  ) => {
    setVideos((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const setVideoProgressForIndex = (index: number, p: FullProgress | null) => {
    setVideoProgress((prev) => ({ ...prev, [index]: p }));
  };

  const triggerVideoUpload = (index: number) => {
    activeUploadIndex.current = index;
    videoFileRef.current?.click();
  };

  const handleVideoFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const startIndex = activeUploadIndex.current;

    setVideos((prev) => {
      const neededSlots = startIndex + files.length;
      if (neededSlots <= prev.length) return prev;
      const additional = Math.min(neededSlots, 30) - prev.length;
      return [
        ...prev,
        ...Array.from({ length: additional }, () => ({ url: "", description: "" })),
      ];
    });

    for (let i = 0; i < files.length; i++) {
      const index = startIndex + i;
      if (index >= 30) {
        toast.warning("Maximum of 30 videos allowed. Skipped remaining files.");
        break;
      }

      const file = files[i];

      // Duplicate detection — skip upload if same filename exists
      const existing = await checkDuplicate(file.name);
      if (existing) {
        updateVideo(index, "url", existing.public_url);
        if (existing.description) {
          updateVideo(index, "description", existing.description);
        }
        toast.info(`"${file.name}" already in library — using existing asset.`);
        continue;
      }

      try {
        const asset = await uploadAsset(file, {
          skipCompression: true,
          onProgress: (p: UploadProgress) => {
            setVideoProgressForIndex(index, {
              stage: p.stage,
              progress: p.progress,
              message: p.message,
            });
          },
        });

        updateVideo(index, "url", asset.public_url);
        toast.success(`Uploaded "${file.name}"`);

        // Prompt user to confirm AI analysis
        promptAnalyzeConfirmation([{ type: 'video', index, url: asset.public_url }]);
      } catch (err: any) {
        toast.error("Video upload failed: " + (err.message || "Unknown error"));
      } finally {
        setTimeout(() => setVideoProgressForIndex(index, null), 1500);
      }
    }

    if (videoFileRef.current) videoFileRef.current.value = "";
  };

  const handleVideoUrlBlur = (index: number) => {
    const vid = videos[index];
    if (!vid?.url.trim() || vid.description.trim()) return;
    promptAnalyzeConfirmation([{ type: 'video', index, url: vid.url }]);
  };

  // ---- Document context helpers ----
  const handleDocumentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocumentParsing(true);
    setDocumentFileName(file.name);
    try {
      const text = await extractTextFromFile(file);
      setDocumentContext(text);
      toast.success(`Extracted ${text.length.toLocaleString()} characters from "${file.name}"`);
    } catch (err: any) {
      toast.error("Failed to parse document: " + (err.message || "Unknown error"));
      setDocumentFileName("");
      setDocumentContext("");
    } finally {
      setDocumentParsing(false);
      if (documentFileRef.current) documentFileRef.current.value = "";
    }
  };

  const clearDocument = () => {
    setDocumentContext("");
    setDocumentFileName("");
  };

  const handleGenerate = async () => {
    if (!topic) return;

    const validVideos = includeVideo
      ? videos.filter((v) => v.url.trim())
      : [];

    const validCustomImages = includeCustomImages
      ? customImages.filter((img) => img.url.trim() && img.description.trim())
      : [];

    await onGenerate({
      topic,
      moduleCount: aiDecideModules ? 0 : moduleCount[0],
      includeQuiz,
      quizCount: aiDecideQuiz ? 0 : quizCount[0],
      includeVideo,
      videos: validVideos,
      customImages: validCustomImages,
      includeAiImages,
      maxAiImages: aiDecideAiImages ? 0 : maxAiImages[0],
      documentContext: documentContext || undefined,
    });
    setOpen(false);
  };

  const hasActiveProgress =
    Object.values(videoProgress).some((p) => p !== null) ||
    Object.values(imageProgress).some((p) => p !== null);
  const isBusy = isGenerating || hasActiveProgress;

  return (
    <>
      <Dialog open={open} onOpenChange={(val) => {
        if (!val && isBusy) {
          toast.warning("Please wait for AI analysis or generation to finish before closing.");
          return;
        }
        setOpen(val);
      }}>
        <DialogTrigger asChild>
          <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/20 border-0 transition-all hover:scale-[1.02]">
            <Sparkles className="mr-2 h-4 w-4" />
            Create with AI
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-4 sm:p-6 rounded-2xl shadow-2xl border-purple-100"
          onPointerDownOutside={(e) => {
            if (isBusy) {
              e.preventDefault();
              toast.warning("Please wait for AI analysis or generation to finish.");
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isBusy) {
              e.preventDefault();
              toast.warning("Please wait for AI analysis or generation to finish.");
            }
          }}
        >
          <DialogHeader className="shrink-0 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">
              <Sparkles className="h-6 w-6 text-purple-600" />
              Generate Course with AI
            </DialogTitle>
            <DialogDescription className="text-base text-gray-500">
              Describe your course topic and let AI structure the content, quizzes,
              and narrative flow for you.
            </DialogDescription>
          </DialogHeader>

          {/* Hidden file inputs */}
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageFileSelect}
          />
          <input
            ref={videoFileRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleVideoFileSelect}
          />

          <div className="space-y-5 py-4 overflow-y-auto overflow-x-hidden pr-1" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            {/* Topic */}
            <div className="space-y-2">
              <Label htmlFor="topic" className="text-base font-medium">
                Course Topic & Description
              </Label>
              <Textarea
                id="topic"
                placeholder="Describe your course topic in detail. E.g.:
Introduction to React Patterns
- Focus on hooks and composition
- Target audience: intermediate developers
- Include real-world examples"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="min-h-[100px] w-full resize-none border-gray-200 focus:border-purple-500 transition-colors break-words"
                style={{ overflowWrap: 'anywhere' }}
              />
            </div>

            {/* Document Context Upload */}
            <div className="space-y-2">
              <Label className="text-base font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-600" />
                Supporting Document (Optional)
              </Label>
              <div className="text-xs text-muted-foreground mb-1">
                Upload a PDF or Word file as reference material. Content is extracted locally and used as AI context.
              </div>
              <input
                ref={documentFileRef}
                type="file"
                accept={SUPPORTED_DOC_TYPES}
                className="hidden"
                onChange={handleDocumentUpload}
              />
              {documentFileName ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
                  <FileText className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="text-sm font-medium text-purple-700 truncate flex-1">
                    {documentFileName}
                  </span>
                  <span className="text-xs text-purple-500">
                    {documentContext.length.toLocaleString()} chars
                  </span>
                  <button
                    type="button"
                    onClick={clearDocument}
                    className="h-6 w-6 rounded-full flex items-center justify-center text-purple-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => documentFileRef.current?.click()}
                  disabled={documentParsing}
                  className="w-full h-12 border-dashed border-gray-300 hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer"
                >
                  {documentParsing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Extracting text...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Upload PDF, Word, or Text file</>
                  )}
                </Button>
              )}
            </div>

            {/* Module Count */}
            <div className="space-y-4 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
              <div className="flex items-center justify-between">
                <Label className="font-medium">
                  {aiDecideModules ? "Modules: AI will decide" : `Number of Modules: ${moduleCount[0]}`}
                </Label>
                <label className="flex items-center gap-2 text-xs text-purple-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aiDecideModules}
                    onChange={(e) => setAiDecideModules(e.target.checked)}
                    className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <Sparkles className="h-3 w-3" /> Let AI decide
                </label>
              </div>
              {!aiDecideModules && (
                <>
                  <Slider
                    value={moduleCount}
                    onValueChange={setModuleCount}
                    max={30}
                    min={3}
                    step={1}
                    className="py-2 cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground w-full px-1">
                    <span>3 modules</span>
                    <span>30 modules</span>
                  </div>
                </>
              )}
              {aiDecideModules && (
                <div className="text-xs text-muted-foreground bg-purple-50 p-2 rounded-md">
                  AI will analyze your topic and determine the optimal count (3-30 modules)
                </div>
              )}
            </div>

            {/* ==================== INCLUDE QUIZ ==================== */}
            <div className="space-y-3 border border-gray-200 p-4 rounded-xl transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    className="text-base font-medium flex items-center gap-2 cursor-pointer"
                    htmlFor="quiz-switch"
                  >
                    <Wand2 className="h-4 w-4 text-purple-600" />
                    Include Quiz
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Generate an assessment module at the end
                  </div>
                </div>
                <Switch
                  id="quiz-switch"
                  checked={includeQuiz}
                  onCheckedChange={setIncludeQuiz}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {includeQuiz && (
                <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      {aiDecideQuiz ? "Questions: AI will decide" : `Number of Questions: ${quizCount[0]}`}
                    </Label>
                    <label className="flex items-center gap-2 text-xs text-purple-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={aiDecideQuiz}
                        onChange={(e) => setAiDecideQuiz(e.target.checked)}
                        className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <Sparkles className="h-3 w-3" /> Let AI decide
                    </label>
                  </div>
                  {!aiDecideQuiz && (
                    <>
                      <Slider
                        value={quizCount}
                        onValueChange={setQuizCount}
                        max={30}
                        min={5}
                        step={1}
                        className="py-2 cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground w-full px-1">
                        <span>5 questions</span>
                        <span>30 questions</span>
                      </div>
                    </>
                  )}
                  {aiDecideQuiz && (
                    <div className="text-xs text-muted-foreground bg-purple-50 p-2 rounded-md">
                      AI will analyze your content depth and generate the optimal number of questions (5-30)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ==================== INCLUDE VIDEO ==================== */}
            <div className="space-y-3 border border-gray-200 p-4 rounded-xl transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    className="text-base font-medium flex items-center gap-2 cursor-pointer"
                    htmlFor="video-switch"
                  >
                    <Video className="h-4 w-4 text-purple-600" />
                    Include Videos
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Add one or more videos — AI will place them optimally
                  </div>
                </div>
                <Switch
                  id="video-switch"
                  checked={includeVideo}
                  onCheckedChange={(checked) => {
                    setIncludeVideo(checked);
                    if (checked && videos.length === 0) addVideo();
                  }}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {includeVideo && (
                <div className="pt-2 space-y-4 animate-in fade-in slide-in-from-top-2">
                  {videos.map((vid, index) => {
                    const progress = videoProgress[index] || null;
                    return (
                      <div
                        key={index}
                        className="space-y-2 p-3 bg-white rounded-lg border border-gray-200 shadow-sm"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                            Video {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeVideo(index)}
                            className="h-7 w-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            aria-label={`Remove video ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* URL + Upload + Browse */}
                        <div className="flex gap-2 w-full min-w-0">
                          <Input
                            placeholder="Paste video URL or upload →"
                            value={vid.url}
                            onChange={(e) =>
                              updateVideo(index, "url", e.target.value)
                            }
                            onBlur={() => handleVideoUrlBlur(index)}
                            className="text-sm h-9 bg-gray-50/50 border-gray-200 focus:border-purple-400 flex-1 min-w-0"
                            readOnly={progress !== null && progress.stage !== "analyzing"}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => triggerVideoUpload(index)}
                            disabled={progress !== null}
                            className="h-9 px-3 shrink-0 border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                            title="Upload new file"
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAssetPickerContext({ type: "video", imageIndex: index });
                              setAssetPickerOpen(true);
                            }}
                            disabled={progress !== null}
                            className="h-9 px-3 shrink-0 border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                            title="Browse existing assets"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Progress */}
                        {progress && <ProgressStrip progress={progress} />}

                        {/* Description */}
                        <div className="relative">
                          <Textarea
                            placeholder="Description — AI will auto-fill on upload to provide rich context to the course generator..."
                            value={vid.description}
                            onChange={(e) =>
                              updateVideo(index, "description", e.target.value)
                            }
                            className={`min-h-[80px] w-full resize-y bg-gray-50/50 border-gray-200 focus:border-purple-400 transition-all ${progress?.stage === "analyzing"
                              ? "blur-[2px] pointer-events-none select-none"
                              : ""
                              }`}
                            style={{ overflowWrap: 'anywhere' }}
                          />
                          {progress?.stage === "analyzing" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-md">
                              <div className="flex items-center gap-2 text-sm text-purple-600 font-medium">
                                {progress.progress >= 100 ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                {progress.message}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Video URL indicator */}
                        {vid.url && !progress && (
                          <div className="flex items-center gap-1.5 text-xs text-green-600 min-w-0 w-full overflow-hidden truncate">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                            <span className="truncate">{vid.url}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Video Button */}
                  {videos.length < 30 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addVideo}
                      className="w-full border-dashed border-gray-300 text-gray-500 hover:text-purple-600 hover:border-purple-300 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Another Video ({videos.length}/30)
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* ==================== INCLUDE IMAGES ==================== */}
            <div className="space-y-3 border border-gray-200 p-4 rounded-xl transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    className="text-base font-medium flex items-center gap-2 cursor-pointer"
                    htmlFor="custom-images-switch"
                  >
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                    Include Images
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Upload or paste URLs — AI analyzes & places them in slides
                  </div>
                </div>
                <Switch
                  id="custom-images-switch"
                  checked={includeCustomImages}
                  onCheckedChange={(checked) => {
                    setIncludeCustomImages(checked);
                    if (checked && customImages.length === 0) {
                      setCustomImages([{ url: "", description: "" }]);
                    }
                  }}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {includeCustomImages && (
                <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2">
                  {customImages.map((img, index) => {
                    const progress = imageProgress[index] || null;

                    return (
                      <div
                        key={index}
                        className="relative bg-white rounded-lg border border-gray-200 p-3 space-y-2 animate-in fade-in slide-in-from-top-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
                            Image {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCustomImage(index)}
                            className="h-7 w-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                            aria-label={`Remove image ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* URL + Upload row */}
                        <div className="flex gap-2 w-full min-w-0">
                          <Input
                            placeholder="Paste image URL or click Upload →"
                            value={img.url}
                            onChange={(e) =>
                              updateCustomImage(index, "url", e.target.value)
                            }
                            onBlur={() => handleImageUrlBlur(index)}
                            className="text-sm h-9 bg-gray-50/50 border-gray-200 focus:border-purple-400 flex-1 min-w-0"
                            readOnly={progress !== null && progress.stage !== "analyzing"}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => triggerImageUpload(index)}
                            disabled={progress !== null}
                            className="h-9 px-3 shrink-0 border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                            title="Upload new file"
                          >
                            <Upload className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAssetPickerContext({ type: "image", imageIndex: index });
                              setAssetPickerOpen(true);
                            }}
                            disabled={progress !== null}
                            className="h-9 px-3 shrink-0 border-gray-200 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-600 cursor-pointer"
                            title="Browse existing assets"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Upload/Analysis Progress */}
                        {progress && <ProgressStrip progress={progress} />}

                        {/* Thumbnail preview */}
                        {img.url && !progress && (
                          <div className="flex items-center gap-2 min-w-0 w-full overflow-hidden">
                            <img
                              src={img.url}
                              alt="Preview"
                              className="h-8 w-8 rounded object-cover border border-gray-200 shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                              <span className="text-[10px] text-green-600 font-medium">
                                Image ready
                              </span>
                              <span className="text-[10px] text-muted-foreground truncate">
                                {img.url}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Description with AI analyzing overlay */}
                        <div className="relative">
                          <Textarea
                            placeholder="Description — AI will auto-fill on upload to provide rich context to the course generator..."
                            value={img.description}
                            onChange={(e) =>
                              updateCustomImage(
                                index,
                                "description",
                                e.target.value
                              )
                            }
                            className={`min-h-[80px] w-full resize-y bg-gray-50/50 border-gray-200 focus:border-purple-400 transition-all ${progress?.stage === "analyzing"
                              ? "blur-[2px] pointer-events-none select-none"
                              : ""
                              }`}
                            style={{ overflowWrap: 'anywhere' }}
                          />
                          {progress?.stage === "analyzing" && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-md">
                              <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium">
                                {progress.progress >= 100 ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                {progress.message}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {customImages.length < 30 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addCustomImage}
                      className="w-full border-dashed border-gray-300 text-gray-500 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Another Image ({customImages.length}/30)
                    </Button>
                  )}

                  <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-2.5">
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 leading-relaxed">
                      AI auto-generates descriptions on upload and places each
                      image in the most relevant slide.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ==================== AI IMAGE GENERATION ==================== */}
            <div className="space-y-3 border border-gray-200 p-4 rounded-xl transition-colors duration-200">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label
                    className="text-base font-medium flex items-center gap-2 cursor-pointer"
                    htmlFor="ai-images-switch"
                  >
                    <Wand2 className="h-4 w-4 text-purple-600" />
                    Generate AI Images
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Auto-create visuals with Gemini AI
                  </div>
                </div>
                <Switch
                  id="ai-images-switch"
                  checked={includeAiImages}
                  onCheckedChange={setIncludeAiImages}
                  className="data-[state=checked]:bg-purple-600"
                />
              </div>

              {includeAiImages && (
                <div className="pt-2 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <Label className="text-sm">
                    {aiDecideAiImages ? "Image count: AI will decide" : `Max Images: ${maxAiImages[0]}`}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ai-decide-images"
                      checked={aiDecideAiImages}
                      onChange={(e) => setAiDecideAiImages(e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                    />
                    <Label htmlFor="ai-decide-images" className="text-xs text-muted-foreground cursor-pointer">
                      Let AI decide how many images to generate
                    </Label>
                  </div>
                  {!aiDecideAiImages && (
                    <>
                      <Slider
                        value={maxAiImages}
                        onValueChange={setMaxAiImages}
                        max={15}
                        min={1}
                        step={1}
                        className="py-1 cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                        <span>1 image</span>
                        <span>15 images</span>
                      </div>
                    </>
                  )}
                  {aiDecideAiImages && (
                    <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2">
                      <p className="text-[11px] text-purple-600 dark:text-purple-400">
                        AI will analyze your course content and determine the optimal number of images (1-15).
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2">
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Each image uses ~1 Gemini API call. Generation may take
                      30-60s.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t mt-auto">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isBusy} className="hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!topic || isBusy}
              className={`bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md transition-all ${isBusy && !isGenerating ? "opacity-70 cursor-not-allowed" : ""}`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Magic...
                </>
              ) : hasActiveProgress ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI is Analyzing...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4 animate-pulse" />
                  Generate Course
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset Picker Dialog */}
      <AssetPickerDialog
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        filterType={assetPickerContext.type}
        multiSelect={true}
        onSelectMultiple={async (assets) => {
          if (!assets || assets.length === 0) return;

          if (assetPickerContext.type === "image" && assetPickerContext.imageIndex !== undefined) {
            const startIndex = assetPickerContext.imageIndex;

            // First asset updates current slot
            updateCustomImage(startIndex, "url", assets[0].url);
            if (assets[0].description) {
              updateCustomImage(startIndex, "description", assets[0].description);
            }

            // Rest append as new slots immediately after
            if (assets.length > 1) {
              const newItems = assets.slice(1).map(a => ({ url: a.url, description: a.description || "" }));
              setCustomImages(prev => {
                const combined = [...prev];
                combined.splice(startIndex + 1, 0, ...newItems);
                return combined.slice(0, 30);
              });
            }

            toast.success(`${assets.length} image(s) selected`);

            // Collect assets needing analysis and prompt user
            const needsAnalysis = assets
              .map((a, i) => ({ type: 'image' as const, index: startIndex + i, url: a.url }))
              .filter((a, i) => a.index < 30 && !assets[i].description);
            if (needsAnalysis.length > 0) {
              promptAnalyzeConfirmation(needsAnalysis);
            }
          } else if (assetPickerContext.type === "video" && assetPickerContext.imageIndex !== undefined) {
            const startIndex = assetPickerContext.imageIndex;

            // First asset updates current slot
            updateVideo(startIndex, "url", assets[0].url);
            if (assets[0].description) {
              updateVideo(startIndex, "description", assets[0].description);
            }

            // Rest append as new slots immediately after
            if (assets.length > 1) {
              const newItems = assets.slice(1).map(a => ({ url: a.url, description: a.description || "", title: "" }));
              setVideos(prev => {
                const combined = [...prev];
                combined.splice(startIndex + 1, 0, ...newItems);
                return combined.slice(0, 30);
              });
            }

            toast.success(`${assets.length} video(s) selected`);

            // Collect assets needing analysis and prompt user
            const needsAnalysis = assets
              .map((a, i) => ({ type: 'video' as const, index: startIndex + i, url: a.url }))
              .filter((a, i) => a.index < 30 && !assets[i].description);
            if (needsAnalysis.length > 0) {
              promptAnalyzeConfirmation(needsAnalysis);
            }
          }
        }}
      />

      {/* AI Analysis Confirmation Dialog */}
      <Dialog
        open={!!analyzeConfirm?.open}
        onOpenChange={(open) => { if (!open) setAnalyzeConfirm(null); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <ScanSearch className="h-5 w-5 text-purple-600" />
              AI Description Analysis
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              {analyzeConfirm && analyzeConfirm.assets.length === 1
                ? `Would you like AI to analyze this ${analyzeConfirm.assets[0].type} and generate a description?`
                : `Would you like AI to analyze ${analyzeConfirm?.assets.length ?? 0} asset(s) and generate descriptions?`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 mt-2">
            <p className="text-xs text-purple-600 dark:text-purple-400">
              AI will examine the content and create a detailed educational description. This may take 15-45 seconds per asset.
            </p>
          </div>
          <DialogFooter className="flex gap-2 pt-4 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setAnalyzeConfirm(null)}
              className="hover:bg-gray-50 transition-colors"
            >
              No, Skip
            </Button>
            <Button
              onClick={() => {
                if (analyzeConfirm) {
                  runAiAnalysis(analyzeConfirm.assets);
                }
                setAnalyzeConfirm(null);
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              <ScanSearch className="h-4 w-4 mr-1.5" />
              Yes, Analyze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
