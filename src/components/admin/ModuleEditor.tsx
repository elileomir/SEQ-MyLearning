import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import QuizBuilder from "./QuizBuilder";
import MarkdownEditor from "./MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Database } from "@/types/supabase";
import { supabase } from "@/lib/supabase";
import {
  generateSlideContent,
  enhanceSlideContent,
  deriveTitleFromContent,
  deriveDescriptionFromContent,
} from "@/lib/gemini";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Module = Database["public"]["Tables"]["mylearning_modules"]["Row"];

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ModuleEditorProps {
  module: Module;
  onUpdate: (updated: Module) => void;
  onClose: () => void;
  coverImage?: string | null;
  onDirtyChange?: (isDirty: boolean) => void;
}

export default function ModuleEditor({
  module,
  onUpdate,
  onClose,
  coverImage,
  onDirtyChange,
}: ModuleEditorProps) {
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description || "");
  const [contentData, setContentData] = useState<any>(
    module.content_data || {},
  );
  const [settings, setSettings] = useState<any>(() => {
    // Initialize with defaults for quiz modules to prevent false "unsaved" state
    const moduleSettings = (module as any).settings || {};
    if (module.content_type === "quiz") {
      return {
        pass_percentage: 90,
        max_attempts: null,
        retake_cooldown_hours: 24,
        shuffle_questions: false,
        ...moduleSettings,
      };
    }
    return moduleSettings;
  });
  const [saving, setSaving] = useState(false);

  // Dirty State Tracking and Local State
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Helper for deep comparison
  const deepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;
    if (
      typeof obj1 !== "object" ||
      obj1 === null ||
      typeof obj2 !== "object" ||
      obj2 === null
    ) {
      return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }
    return true;
  };

  // Helper to get normalized settings (with defaults for quiz)
  const getNormalizedModuleSettings = () => {
    const moduleSettings = (module as any).settings || {};
    if (module.content_type === "quiz") {
      return {
        pass_percentage: 90,
        max_attempts: null,
        retake_cooldown_hours: 24,
        shuffle_questions: false,
        ...moduleSettings,
      };
    }
    return moduleSettings;
  };

  useEffect(() => {
    // Normalize descriptions to handle null vs empty string
    const descDirty = description !== (module.description || "");
    const titleDirty = title !== module.title;

    // Use deep comparison for objects to avoid key-order issues with JSON.stringify
    // Also handle null/undefined/empty object equivalence
    const contentDirty = !deepEqual(
      contentData || {},
      module.content_data || {},
    );

    // Compare against normalized settings (with defaults)
    const normalizedModuleSettings = getNormalizedModuleSettings();
    const settingsDirty = !deepEqual(settings || {}, normalizedModuleSettings);

    const isDirty = titleDirty || descDirty || contentDirty || settingsDirty;

    setHasUnsavedChanges(isDirty);
    if (onDirtyChange) onDirtyChange(isDirty);
  }, [title, description, contentData, settings, module, onDirtyChange]);

  /* AI State */
  const [aiLoading, setAiLoading] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");

  // New State for Granular Master Control
  const [aiTarget, setAiTarget] = useState<
    | "master_generate"
    | "master_enhance"
    | "title"
    | "description"
    | "markdown"
    | null
  >(null);

  // Enhancer Options
  const [enhanceOptions, setEnhanceOptions] = useState({
    title: true,
    description: true,
    content: true,
    contentType: "comprehensive" as "format" | "content" | "comprehensive",
  });

  /* Preview State for Slides */
  const [slideTab, setSlideTab] = useState<"edit" | "preview">("edit");

  // Magic/Master Button Handler
  const handleMasterAI = () => {
    // Determine mode based on existence of content
    const hasContent =
      contentData.markdown && contentData.markdown.trim() !== "";

    if (hasContent) {
      setAiTarget("master_enhance");
      // Reset defaults
      setEnhanceOptions({
        title: true,
        description: true,
        content: true,
        contentType: "comprehensive",
      });
    } else {
      setAiTarget("master_generate");
      setAiContext("");
    }
    setAiModalOpen(true);
  };

  /* Unified AI Execution Logic */
  const executeUnifiedAI = async () => {
    setAiModalOpen(false);
    setAiLoading(true);

    try {
      if (aiTarget === "master_generate") {
        // GENERATE MODE
        const markdown = await generateSlideContent(
          title || "New Module",
          aiContext,
        );
        setContentData({ ...contentData, markdown });

        const newTitle = await deriveTitleFromContent(markdown);
        setTitle(newTitle);

        const newDescription = await deriveDescriptionFromContent(markdown);
        setDescription(newDescription);

        toast.success("Module Generated Successfully!");
      } else if (aiTarget === "master_enhance") {
        // ENHANCE MODE
        let currentMarkdown = contentData.markdown || "";

        // 1. Process Content if selected
        if (enhanceOptions.content) {
          currentMarkdown = await enhanceSlideContent(
            currentMarkdown,
            title || "Module",
            enhanceOptions.contentType,
          );
          setContentData({ ...contentData, markdown: currentMarkdown });
        }

        // 2. Process Title if selected (Derived from LATEST content)
        if (enhanceOptions.title) {
          const newTitle = await deriveTitleFromContent(currentMarkdown);
          setTitle(newTitle);
        }

        // 3. Process Description if selected (Derived from LATEST content)
        if (enhanceOptions.description) {
          const newDescription =
            await deriveDescriptionFromContent(currentMarkdown);
          setDescription(newDescription);
        }

        toast.success("Module Enhanced Successfully!");
      }
    } catch (e) {
      console.error(e);
      toast.error("AI Operation Failed. Please try again.");
    } finally {
      setAiLoading(false);
      setAiTarget(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      title,
      description,
      content_data: contentData,
      settings: settings,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("mylearning_modules")
      .update(updates)
      .eq("id", module.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      alert(error.message);
    } else if (data) {
      if (onDirtyChange) onDirtyChange(false); // Explicitly clear dirty state
      onUpdate(data);
      // Maintained open editor as requested by user
      toast.success("Changes saved successfully!");
    }
  };

  return (
    <>
      <Card className="max-w-4xl mx-auto w-full border-2 border-primary/20 shadow-lg relative overflow-hidden">
        {aiLoading && (
          <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
              <Sparkles className="h-12 w-12 text-indigo-600 animate-spin duration-[3000ms]" />
            </div>
            <p className="text-lg font-semibold text-indigo-700 animate-pulse">
              Generating Context...
            </p>
          </div>
        )}
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Editing: {module.content_type.toUpperCase()}</CardTitle>
          {module.content_type === "slide" && (
            <Button
              onClick={handleMasterAI}
              disabled={aiLoading}
              className={`text-white shadow-md transition-all hover:scale-105 ${aiLoading
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                }`}
              size="sm"
            >
              {aiLoading ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2 text-yellow-300" />
                  {contentData.markdown
                    ? "Enhance All Fields"
                    : "Generate Full Module"}
                </>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Module Title</Label>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="hover:border-indigo-300 focus:border-indigo-500 transition-colors"
                placeholder="Enter module title..."
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
              </div>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[80px] resize-none hover:border-indigo-300 focus:border-indigo-500 transition-colors"
                placeholder="Brief description of this module..."
              />
            </div>
          </div>

          {/* Specific Editors */}
          {module.content_type === "video" && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-transparent hover:border-muted-foreground/20 transition-colors">
              <div className="space-y-2">
                <Label>Video URL</Label>
                <Input
                  placeholder="https://youtube.com/..."
                  value={contentData.url || ""}
                  onChange={(e) =>
                    setContentData({ ...contentData, url: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Supported: YouTube, Vimeo, MP4 direct links.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="skippable"
                  checked={settings.is_skippable || false}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, is_skippable: checked })
                  }
                />
                <Label htmlFor="skippable">Allow user to skip video?</Label>
              </div>
            </div>
          )}

          {module.content_type === "slide" && (
            <div className="space-y-4">
              <div className="flex bg-muted p-1 rounded-lg w-fit">
                <button
                  onClick={() => setSlideTab("edit")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-all ${slideTab === "edit" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Editor
                </button>
                <button
                  onClick={() => setSlideTab("preview")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-all ${slideTab === "preview" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Preview Mode
                </button>
              </div>

              {slideTab === "edit" ? (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Slide Content (Markdown)</Label>
                    </div>
                    <MarkdownEditor
                      value={contentData.markdown || ""}
                      onChange={(value) =>
                        setContentData({
                          ...contentData,
                          markdown: value,
                        })
                      }
                      height={350}
                      placeholder="# Header\n\nWrite your slide content here..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the toolbar above or write Markdown directly. AI will
                      also format this using Markdown.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden min-h-[500px] border shadow-md flex flex-col bg-white">
                  {/* Header Layer (Glassmorphism) */}
                  <div className="relative h-48 md:h-56 shrink-0 overflow-hidden bg-slate-900 group">
                    {/* Background Image */}
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{
                        backgroundImage: coverImage
                          ? `url(${coverImage})`
                          : "none",
                      }}
                    />
                    {/* Blur Overlay */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Title Container */}
                    <div className="relative z-10 size-full flex flex-col justify-end p-6 md:p-8 text-white">
                      <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 text-white">
                        {title}
                      </h2>
                      {description && (
                        <p className="text-slate-200 text-sm md:text-base line-clamp-2 max-w-2xl font-light leading-relaxed">
                          {description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Content Layer (Clean White) */}
                  <div className="grow p-6 md:p-8 overflow-y-auto bg-white">
                    <div className="prose prose-slate max-w-none text-slate-800 prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ node, ...props }) => (
                            <h1
                              className="text-2xl font-bold mb-4 mt-8 pb-2 border-b border-slate-200 text-slate-900 first:mt-0"
                              {...props}
                            />
                          ),
                          h2: ({ node, ...props }) => (
                            <h2
                              className="text-xl font-semibold mb-3 mt-6 text-slate-900"
                              {...props}
                            />
                          ),
                          h3: ({ node, ...props }) => (
                            <h3
                              className="text-lg font-semibold mb-2 mt-5 text-slate-800"
                              {...props}
                            />
                          ),
                          ul: ({ node, ...props }) => (
                            <ul
                              className="list-disc pl-5 space-y-1 my-4"
                              {...props}
                            />
                          ),
                          ol: ({ node, ...props }) => (
                            <ol
                              className="list-decimal pl-5 space-y-1 my-4"
                              {...props}
                            />
                          ),
                          li: ({ node, ...props }) => (
                            <li className="pl-1 leading-relaxed" {...props} />
                          ),
                          a: ({ node, ...props }) => (
                            <a
                              className="text-blue-600 hover:text-blue-700 underline decoration-blue-200 hover:decoration-blue-400 transition-colors font-semibold"
                              target="_blank"
                              rel="noopener noreferrer"
                              {...props}
                            />
                          ),
                          img: ({ node, ...props }) => (
                            <img
                              className="rounded-xl shadow-md my-6 w-full max-w-lg mx-auto border"
                              alt={props.alt || "Slide image"}
                              {...props}
                            />
                          ),
                          table: ({ node, ...props }) => (
                            <div className="my-4 overflow-x-auto rounded-lg border border-slate-200">
                              <table className="min-w-full divide-y divide-slate-200 text-sm" {...props} />
                            </div>
                          ),
                          thead: ({ node, ...props }) => (
                            <thead className="bg-slate-50" {...props} />
                          ),
                          th: ({ node, ...props }) => (
                            <th className="px-4 py-3 text-left font-semibold text-slate-900 whitespace-nowrap" {...props} />
                          ),
                          td: ({ node, ...props }) => (
                            <td className="px-4 py-3 text-slate-700 border-t border-slate-100" {...props} />
                          ),
                        }}
                      >
                        {contentData.markdown || "_No content_"}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {module.content_type === "quiz" && (
            <div className="space-y-4">
              <QuizBuilder
                initialQuestions={contentData.questions || []}
                courseId={module.course_id}
                initialSettings={{
                  pass_percentage: settings.pass_percentage ?? 90,
                  max_attempts: settings.max_attempts ?? null,
                  retake_cooldown_hours: settings.retake_cooldown_hours ?? 24,
                  shuffle_questions: settings.shuffle_questions ?? false,
                }}
                onChange={(questions, newSettings) => {
                  // Update content data with questions
                  setContentData((prev: any) => ({ ...prev, questions }));
                  // Update settings
                  setSettings((prev: any) => ({ ...prev, ...newSettings }));
                }}
                onMetadataChange={(newTitle, newDesc) => {
                  if (newTitle) setTitle(newTitle);
                  if (newDesc) setDescription(newDesc);
                }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {aiTarget === "master_generate"
                ? "Generate Module w/ AI"
                : "Enhance Module Fields"}
            </DialogTitle>
            <DialogDescription>
              {aiTarget === "master_generate"
                ? "Provide instructions and the AI will generate the content, title, and description."
                : "Select which fields you want the AI to update or refine."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {aiTarget === "master_generate" ? (
              <div className="space-y-2">
                <Label>Context / Topic</Label>
                <Textarea
                  placeholder="e.g. Explain the hierarchy of controls for risk management..."
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={4}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Content Option */}
                <div className="p-3 border rounded-lg space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold flex items-center gap-2">
                      <span className="bg-indigo-100 text-indigo-700 p-1 rounded">
                        1
                      </span>
                      Slide Content
                    </Label>
                    <Switch
                      checked={enhanceOptions.content}
                      onCheckedChange={(c) =>
                        setEnhanceOptions({ ...enhanceOptions, content: c })
                      }
                    />
                  </div>

                  {enhanceOptions.content && (
                    <div className="pl-8 grid grid-cols-3 gap-2">
                      {(["format", "content", "comprehensive"] as const).map(
                        (t) => (
                          <button
                            key={t}
                            onClick={() =>
                              setEnhanceOptions({
                                ...enhanceOptions,
                                contentType: t,
                              })
                            }
                            className={`text-xs p-1.5 rounded border transition-all ${enhanceOptions.contentType === t
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                              }`}
                          >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>

                {/* Title Option */}
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <Label className="font-semibold flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 p-1 rounded">
                      2
                    </span>
                    Module Title
                  </Label>
                  <Switch
                    checked={enhanceOptions.title}
                    onCheckedChange={(c) =>
                      setEnhanceOptions({ ...enhanceOptions, title: c })
                    }
                  />
                </div>

                {/* Description Option */}
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                  <Label className="font-semibold flex items-center gap-2">
                    <span className="bg-indigo-100 text-indigo-700 p-1 rounded">
                      3
                    </span>
                    Description
                  </Label>
                  <Switch
                    checked={enhanceOptions.description}
                    onCheckedChange={(c) =>
                      setEnhanceOptions({ ...enhanceOptions, description: c })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAiModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executeUnifiedAI} disabled={aiLoading}>
              <Sparkles className="h-3 w-3 mr-2" />
              {aiLoading
                ? "Processing..."
                : aiTarget === "master_generate"
                  ? "Generate All"
                  : "Enhance Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
