import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Settings,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  generateQuizFromContent,
  enhanceQuizQuestions,
  deriveQuizTitleFromContent,
  deriveQuizDescriptionFromContent,
} from "@/lib/gemini";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Types
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface QuizSettings {
  pass_percentage: number;
  max_attempts: number | null; // null = infinite
  retake_cooldown_hours: number;
  shuffle_questions?: boolean;
}

interface QuizBuilderProps {
  initialQuestions?: QuizQuestion[];
  initialSettings?: QuizSettings;
  onChange: (questions: QuizQuestion[], settings: QuizSettings) => void;
  courseId?: string | null;
  onMetadataChange?: (title: string, description: string) => void;
}

export default function QuizBuilder({
  initialQuestions = [],
  initialSettings,
  onChange,
  courseId,
  onMetadataChange,
}: QuizBuilderProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(
    initialQuestions.length > 0
      ? initialQuestions.map((q) => ({
          ...q,
          id: q.id || crypto.randomUUID(),
        }))
      : [],
  );

  const [settings, setSettings] = useState<QuizSettings>(
    initialSettings || {
      pass_percentage: 90,
      max_attempts: null,
      retake_cooldown_hours: 24,
      shuffle_questions: false,
    },
  );

  // States
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [enhanceModalOpen, setEnhanceModalOpen] = useState(false);
  const [, setEnhanceType] = useState<"improve" | "add" | null>(null);

  useEffect(() => {
    onChange(questions, settings);
  }, [questions, settings]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
    setActiveId(null);
  };

  const addQuestion = () => {
    const newQ: QuizQuestion = {
      id: crypto.randomUUID(),
      question: "New Question",
      options: ["Option 1", "Option 2"],
      correctIndex: 0,
    };
    setQuestions([...questions, newQ]);
  };

  const updateQuestion = (id: string, updates: Partial<QuizQuestion>) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  };

  const confirmDeleteQuestion = () => {
    if (deleteId) {
      setQuestions(questions.filter((q) => q.id !== deleteId));
      setDeleteId(null);
    }
  };

  // Helper to fetch aggregated content
  const fetchAggregatedContent = async () => {
    if (!courseId) throw new Error("Course context missing");

    const { data: modules, error } = await supabase
      .from("mylearning_modules")
      .select("content_data, title, description, content_type")
      .eq("course_id", courseId)
      .neq("content_type", "quiz");

    if (error) throw error;
    if (!modules || modules.length === 0)
      throw new Error("No other modules found.");

    let aggregatedContent = "";
    modules.forEach((mod) => {
      const content = mod.content_data as any;
      aggregatedContent += `\n\n--- Module: ${mod.title} ---\n`;
      aggregatedContent += `Description: ${mod.description || ""}\n`;
      if (content?.markdown) {
        aggregatedContent += `${content.markdown}\n`;
      } else if (mod.content_type === "video" && mod.description) {
        aggregatedContent += `Video Content Summary: ${mod.description}\n`;
      }
    });

    return aggregatedContent;
  };

  const handleAIOperation = async (type: "generate" | "improve" | "add") => {
    if (!courseId && type !== "improve") {
      toast.error("Course context missing. Cannot generate quiz.");
      return;
    }

    setIsGenerating(true);
    setEnhanceModalOpen(false); // Close dialog if open

    try {
      if (type === "improve") {
        toast.info("Refining existing questions...");
        const improvedQuestions = await enhanceQuizQuestions(questions);

        const mergedQuestions = improvedQuestions.map(
          (imp: any, i: number) => ({
            id: questions[i]?.id || crypto.randomUUID(),
            question: imp.question,
            options: imp.options,
            correctIndex:
              typeof imp.correctIndex === "number" ? imp.correctIndex : 0,
            explanation: imp.explanation,
          }),
        );

        setQuestions(mergedQuestions);
        toast.success("Questions enhanced successfully!");
      } else {
        // Generate or Add New
        toast.info("Analyzing course content...");
        const aggregatedContent = await fetchAggregatedContent();

        if (aggregatedContent.length < 50) {
          toast.warning("Not enough content found in course modules.");
          return;
        }

        const count = type === "add" ? 5 : 10;
        const existingDocs = type === "add" ? questions : [];

        // Run generations in parallel if it's a full generation
        const promises: Promise<any>[] = [
          generateQuizFromContent(aggregatedContent, existingDocs, count),
        ];

        // If generating fresh, also try to generate title/desc
        if (type === "generate" && onMetadataChange) {
          promises.push(deriveQuizTitleFromContent(aggregatedContent));
          promises.push(deriveQuizDescriptionFromContent(aggregatedContent));
        }

        const results = await Promise.all(promises);
        const newQuestions = results[0];

        // Handle metadata updates if they exist
        if (
          type === "generate" &&
          onMetadataChange &&
          results[1] &&
          results[2]
        ) {
          onMetadataChange(results[1], results[2]);
          toast.success("Quiz title and description updated!");
        }

        const formattedQuestions = newQuestions.map((q: any) => ({
          ...q,
          id: crypto.randomUUID(),
        }));

        if (formattedQuestions.length === 0) {
          toast.warning("AI could not generate distinct new questions.");
        } else {
          setQuestions((prev) => [...prev, ...formattedQuestions]);
          toast.success(`Generated ${formattedQuestions.length} questions!`);
        }
      }
    } catch (error) {
      console.error("AI Op Error:", error);
      toast.error("Failed to process request. Try again.");
    } finally {
      setIsGenerating(false);
      setEnhanceType(null);
    }
  };

  const openEnhanceModal = () => {
    if (questions.length === 0) {
      // Direct generate if empty
      handleAIOperation("generate");
    } else {
      setEnhanceModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Quiz Header with Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            Quiz Questions ({questions.length})
          </h3>
          <p className="text-sm text-slate-500">
            Manage your quiz content below.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={openEnhanceModal}
            disabled={isGenerating}
            variant="outline"
            className={`gap-2 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 transition-all ${isGenerating ? "opacity-70" : ""}`}
          >
            {isGenerating ? (
              <Sparkles className="h-4 w-4 animate-spin text-purple-600" />
            ) : questions.length > 0 ? (
              <Wand2 className="h-4 w-4 text-purple-600" />
            ) : (
              <Sparkles className="h-4 w-4 text-purple-600" />
            )}
            {isGenerating
              ? "Processing..."
              : questions.length > 0
                ? "Enhance with AI"
                : "Generate with AI"}
          </Button>

          <Button onClick={addQuestion} className="gap-2">
            <Plus className="h-4 w-4" /> Add Question
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      <Card className="bg-slate-50 border-slate-200">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Passing Percentage (%)
              </Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={settings.pass_percentage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    pass_percentage: Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                Max Attempts (0 = Infinite)
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.max_attempts || 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSettings({
                    ...settings,
                    max_attempts: val === 0 ? null : val,
                  });
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-blue-600" />
                Retake Cooldown (Hours)
              </Label>
              <Input
                type="number"
                min="0"
                value={settings.retake_cooldown_hours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retake_cooldown_hours: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Questions List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={questions.map((q) => q.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {questions.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                <p className="text-slate-500 mb-2">No questions yet.</p>
                <Button
                  variant="link"
                  onClick={() => handleAIOperation("generate")}
                >
                  Generate 10 questions automatically
                </Button>
              </div>
            )}
            {questions.map((q, index) => (
              <SortableQuestionItem
                key={q.id}
                question={q}
                index={index}
                onUpdate={updateQuestion}
                onDelete={setDeleteId}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeId ? (
            <div className="opacity-50">
              <SortableQuestionItem
                question={questions.find((q) => q.id === activeId)!}
                index={questions.findIndex((q) => q.id === activeId)}
                onUpdate={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this question? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteQuestion}>
              Delete Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enhance/Add Modal */}
      <Dialog open={enhanceModalOpen} onOpenChange={setEnhanceModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              AI Quiz Assistant
            </DialogTitle>
            <DialogDescription>
              Choose how you would like to use AI to improve your quiz.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div
              className="border rounded-xl p-4 hover:border-indigo-500 hover:bg-slate-50 cursor-pointer transition-all group"
              onClick={() => handleAIOperation("improve")}
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Wand2 className="h-4 w-4" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">
                Refine Existing
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Improve grammar, clarity, and explanations for your{" "}
                {questions.length} existing questions.
              </p>
            </div>

            <div
              className="border rounded-xl p-4 hover:border-indigo-500 hover:bg-slate-50 cursor-pointer transition-all group"
              onClick={() => handleAIOperation("add")}
            >
              <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Plus className="h-4 w-4" />
              </div>
              <h4 className="font-semibold text-slate-900 mb-1">
                Add More Questions
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Generate 5 new questions based on course content. Checks for
                duplicates.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableQuestionItem({
  question,
  index,
  onUpdate,
  onDelete,
  isOverlay,
}: {
  question: QuizQuestion;
  index: number;
  onUpdate: (id: string, data: Partial<QuizQuestion>) => void;
  onDelete: (id: string) => void;
  isOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isOverlay ? 999 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg shadow-sm transition-all ${
        isDragging ? "shadow-xl ring-2 ring-indigo-500/50 opacity-50" : ""
      }`}
    >
      <div className="flex items-start p-3 gap-3">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-2 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 pt-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-muted-foreground">
                  Q{index + 1}
                </Badge>
                <Input
                  value={question.question}
                  onChange={(e) =>
                    onUpdate(question.id, { question: e.target.value })
                  }
                  className="font-medium text-lg border-transparent hover:border-input focus:border-input px-2 -ml-2 h-auto py-1"
                  placeholder="Enter your question here..."
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-400 hover:text-red-600 hover:bg-red-50 -mt-1"
              onClick={() => onDelete(question.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="options" className="border-none">
              <AccordionTrigger className="py-2 text-sm text-slate-500 hover:text-indigo-600">
                Edit Options & Answer ({question.options.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                {question.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors ${
                        question.correctIndex === i
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-slate-300 hover:border-green-400"
                      }`}
                      onClick={() => onUpdate(question.id, { correctIndex: i })}
                    >
                      {question.correctIndex === i && (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                    </div>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...question.options];
                        newOpts[i] = e.target.value;
                        onUpdate(question.id, { options: newOpts });
                      }}
                      className={
                        question.correctIndex === i
                          ? "border-green-200 bg-green-50"
                          : ""
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={question.options.length <= 2}
                      onClick={() => {
                        const newOpts = question.options.filter(
                          (_, idx) => idx !== i,
                        );
                        onUpdate(question.id, {
                          options: newOpts,
                          correctIndex:
                            question.correctIndex === i
                              ? 0
                              : question.correctIndex > i
                                ? question.correctIndex - 1
                                : question.correctIndex,
                        });
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-500" />
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() =>
                      onUpdate(question.id, {
                        options: [
                          ...question.options,
                          `Option ${question.options.length + 1}`,
                        ],
                      })
                    }
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Option
                  </Button>
                </div>

                <div className="pt-4 border-t mt-4">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Explanation (Optional - shown after answering)
                  </Label>
                  <Textarea
                    value={question.explanation || ""}
                    onChange={(e) =>
                      onUpdate(question.id, { explanation: e.target.value })
                    }
                    placeholder="Explain why the answer is correct..."
                    className="h-20 text-sm"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
