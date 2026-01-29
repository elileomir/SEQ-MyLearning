import { useEffect, useState } from "react";
import { useParams, useNavigate, useBlocker } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  GripVertical,
  Video,
  FileText,
  HelpCircle,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";
import ModuleEditor from "@/components/admin/ModuleEditor";
import {
  generateCourseDescription,
  enhanceCourseDescription,
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

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];
type Module = Database["public"]["Tables"]["mylearning_modules"]["Row"];

export default function CourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);

  /* State for saving status */
  const [isSaving, setIsSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiContextOpen, setAiContextOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");

  const handleAIGenerateClick = () => {
    if (!course?.title) {
      toast.error("Please enter a course title first.");
      return;
    }

    if (!course.description || course.description.trim() === "") {
      // Open modal for new generation to get context
      setAiContext("");
      setAiContextOpen(true);
    } else {
      // Enhance existing - no context needed for now (or could add?)
      // User asked for modal for "Generate with AI".
      handleAIGenerateConfirm("");
    }
  };

  const handleAIGenerateConfirm = async (context: string) => {
    setAiContextOpen(false);
    setAiLoading(true);

    try {
      let result = "";
      if (!course?.description || course.description.trim() === "") {
        // Generate new with context
        result = await generateCourseDescription(course!.title!, context);
        toast.success("Description generated!");
      } else {
        // Enhance existing
        result = await enhanceCourseDescription(
          course!.description!,
          course!.title!,
        );
        toast.success("Description enhanced!");
      }

      // Update state and trigger save
      handleCourseChange({ description: result });
    } catch (error) {
      toast.error("Failed to generate description. Please check API key.");
    } finally {
      setAiLoading(false);
    }
  };

  /* Unsaved Changes State */
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [activeTab, setActiveTab] = useState("content");

  /* Module Deletion State */
  const [moduleToDelete, setModuleToDelete] = useState<Module | null>(null);

  // Block React Router Navigation (Sidebar, Back Button, etc.)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Sync Blocker state with UI Dialog
  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowUnsavedDialog(true);
    }
  }, [blocker.state]);

  // Handle Browser Refresh / Close Tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Handle Internal Actions (Tabs, Module Selection)
  const handleProtectedAction = (action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action);
      setShowUnsavedDialog(true);
    } else {
      action();
    }
  };

  const handleConfirmDiscard = () => {
    if (blocker.state === "blocked") {
      blocker.proceed();
    } else if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }

    setIsDirty(false); // Reset dirty state
    setShowUnsavedDialog(false);
  };

  const handleCancelNavigation = () => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
    setPendingAction(null);
    setShowUnsavedDialog(false);
  };

  useEffect(() => {
    if (id) fetchCourseData(id);
  }, [id]);

  async function fetchCourseData(courseId: string) {
    const { data: courseData, error: courseError } = await supabase
      .from("mylearning_courses")
      .select("*")
      .eq("id", courseId)
      .single();

    if (courseError) {
      console.error(courseError);
      return;
    }
    setCourse(courseData);

    const { data: moduleData, error: moduleError } = await supabase
      .from("mylearning_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("sequence_order", { ascending: true });

    if (moduleError) console.error(moduleError);
    else setModules(moduleData || []);

    setLoading(false);
  }

  // Debounced save function using a ref to hold the timeout
  const saveTimeoutRef = useState<{ current: NodeJS.Timeout | null }>({
    current: null,
  })[0];

  function handleCourseChange(updates: Partial<Course>) {
    if (!course) return;

    // 1. Optimistic Update (Immediate UI change)
    const newCourseState = { ...course, ...updates };
    setCourse(newCourseState);

    // 2. Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 3. Set new timeout for DB save
    setIsSaving(true);
    saveTimeoutRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from("mylearning_courses")
        .update(updates)
        .eq("id", course.id);

      setIsSaving(false);
      if (error) {
        console.error("Error saving course:", error);
        // Optional: Revert state or show error toast
      }
    }, 1000); // 1s debounce
  }

  // Instant save for things like Publish Toggle (no debounce needed)
  async function togglePublish() {
    if (!course) return;
    const newValue = !course.is_published;

    // Optimistic
    setCourse({ ...course, is_published: newValue });

    const { error } = await supabase
      .from("mylearning_courses")
      .update({ is_published: newValue })
      .eq("id", course.id);

    if (error) {
      // Revert if failed
      setCourse({ ...course, is_published: !newValue });
      alert("Error updating publish status");
    }
  }

  async function addModule(type: "video" | "slide" | "quiz") {
    handleProtectedAction(async () => {
      if (!course) return;
      const { data, error } = await supabase
        .from("mylearning_modules")
        .insert({
          course_id: course.id,
          title: `New ${type} module`,
          content_type: type,
          sequence_order: modules.length,
          content_data: {},
          settings: {},
        })
        .select()
        .single();

      if (error) {
        alert(error.message);
      } else if (data) {
        setModules([...modules, data]);
        setSelectedModule(data);
      }
    });
  }

  async function confirmDeleteModule() {
    if (!moduleToDelete) return;

    // Check if we are deleting the potentially selected module
    if (selectedModule?.id === moduleToDelete.id) {
      // If we are, proceed (protected action check might be needed if dirty,
      // but typically deletion overrides editing state or requires discarding first.
      // For simplicity, we'll force the delete and clear selection.)
      setSelectedModule(null);
      setIsDirty(false); // Reset dirty since the module is gone
    }

    const { error } = await supabase
      .from("mylearning_modules")
      .delete()
      .eq("id", moduleToDelete.id);

    if (error) {
      toast.error("Failed to delete module");
      console.error(error);
    } else {
      setModules(modules.filter((m) => m.id !== moduleToDelete.id));
      toast.success("Module deleted");
    }

    setModuleToDelete(null);
  }

  const handleModuleUpdate = (updated: Module) => {
    setModules(modules.map((m) => (m.id === updated.id ? updated : m)));
    setSelectedModule(updated);
  };

  /* Drag and Drop Logic */
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setModules((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over?.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);

        // Update sequence based on new index
        const updates = newOrder.map((mod, index) => ({
          ...mod,
          sequence_order: index,
        }));

        // Fire and forget DB update (Optimistic UI)
        updateModuleOrderInDB(updates);

        return updates;
      });
    }
  };

  const updateModuleOrderInDB = async (updatedModules: Module[]) => {
    // 1. Prepare updates for all affected modules
    // Note: Supabase doesn't have a single bulk update RPC by default, so we loop.
    // For specific performance, an RPC `upsert_modules` would be better.
    // Given low module count (<50), parallel promises are acceptable.

    // We only need to optimize if this feels slow.
    const promises = updatedModules.map((mod) =>
      supabase
        .from("mylearning_modules")
        .update({ sequence_order: mod.sequence_order })
        .eq("id", mod.id),
    );

    await Promise.all(promises);
    // Explicitly do not trigger loading or error UI here to keep it smooth
  };

  if (loading) return <div>Loading Editor...</div>;
  if (!course) return <div>Course not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={handleCancelNavigation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes in the module editor. If you leave, these
              changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelNavigation}>
              Keep Editing
            </Button>
            <Button variant="destructive" onClick={handleConfirmDiscard}>
              Discard Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module Delete Dialog */}
      <Dialog
        open={!!moduleToDelete}
        onOpenChange={(open) => !open && setModuleToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Module</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{moduleToDelete?.title}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteModule}>
              Delete Module
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3 bg-card">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleProtectedAction(() => navigate("/admin"))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-col">
            <span className="font-semibold text-lg flex items-center gap-2">
              {course.title}
              {isSaving && (
                <span className="text-xs text-muted-foreground font-normal animate-pulse">
                  (Saving...)
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {course.is_published ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              {course.is_published ? "Published" : "Draft"}
            </span>
          </div>
        </div>
        <Button onClick={togglePublish}>
          {course.is_published ? "Unpublish" : "Publish"}
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(val) =>
            handleProtectedAction(() => setActiveTab(val))
          }
          className="h-full flex flex-col"
        >
          <div className="px-6 py-2 border-b bg-muted/20">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="content"
            className="flex-1 overflow-hidden p-0 m-0 flex"
          >
            {/* Sidebar List */}
            <div className="w-80 border-r bg-muted/10 flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-medium mb-2">Modules</h3>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => addModule("video")}
                  >
                    <Video className="h-3 w-3 mr-1" /> Video
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => addModule("slide")}
                  >
                    <FileText className="h-3 w-3 mr-1" /> Slide
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => addModule("quiz")}
                  >
                    <HelpCircle className="h-3 w-3 mr-1" /> Quiz
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={modules.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {modules.map((module) => (
                      <SortableModuleItem
                        key={module.id}
                        module={module}
                        selected={selectedModule?.id === module.id}
                        onSelect={() =>
                          handleProtectedAction(() => setSelectedModule(module))
                        }
                        onDelete={() => setModuleToDelete(module)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            {/* Main Editor Area */}
            <div className="flex-1 bg-slate-50 p-8 overflow-y-auto">
              {selectedModule ? (
                <ModuleEditor
                  key={selectedModule.id} // Force remount on change
                  module={selectedModule}
                  onUpdate={handleModuleUpdate}
                  onClose={() => setSelectedModule(null)}
                  coverImage={course.cover_image_url}
                  onDirtyChange={setIsDirty}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground flex-col gap-2">
                  <FileText className="h-10 w-10 opacity-20" />
                  <p>
                    Select a module from the list to edit, or create a new one.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="p-6 m-0 overflow-y-auto">
            <div className="max-w-2xl mx-auto space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Course Details</CardTitle>
                  <CardDescription>
                    Basic information about this course.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={course.title}
                      onChange={(e) =>
                        handleCourseChange({ title: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Description</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800"
                        onClick={handleAIGenerateClick}
                        disabled={aiLoading}
                      >
                        <Sparkles className="h-3 w-3" />
                        {aiLoading
                          ? "Thinking..."
                          : !course.description
                            ? "Generate with AI"
                            : "Enhance with AI"}
                      </Button>
                    </div>
                    <Textarea
                      value={course.description || ""}
                      onChange={(e) =>
                        handleCourseChange({ description: e.target.value })
                      }
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cover Image URL</Label>
                    <Input
                      value={course.cover_image_url || ""}
                      onChange={(e) =>
                        handleCourseChange({ cover_image_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Access Control</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Target Job Roles (comma separated)</Label>
                    <Input
                      value={course.target_job_roles?.join(", ") || ""}
                      onChange={(e) =>
                        handleCourseChange({
                          target_job_roles: e.target.value
                            .split(",")
                            .map((s) => s.trim()),
                        })
                      }
                      placeholder="All, Engineer, Manager"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use "All" to make it visible to everyone.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={aiContextOpen} onOpenChange={setAiContextOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tell me about this course</DialogTitle>
            <DialogDescription>
              Provide some context so the AI can write a better description.
              What is the main topic? Who is it for?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Context / Topic</Label>
            <Textarea
              placeholder="e.g. This course is about the MASO safety app for site managers..."
              value={aiContext}
              onChange={(e) => setAiContext(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiContextOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleAIGenerateConfirm(aiContext)}>
              <Sparkles className="h-3 w-3 mr-2" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableModuleItem({
  module,
  selected,
  onSelect,
  onDelete,
}: {
  module: Module;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : "auto",
    position: isDragging ? ("relative" as const) : undefined, // Ensure visibility while dragging
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer group transition-colors 
        ${selected ? "bg-accent text-accent-foreground border-primary" : "bg-card hover:border-indigo-500 hover:shadow-sm"}
        ${isDragging ? "opacity-50 shadow-xl ring-2 ring-indigo-500" : ""}
      `}
      onClick={onSelect}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 -m-1"
        onClick={(e) => e.stopPropagation()} // Prevent selection when clicking grip
      >
        <GripVertical
          className={`h-4 w-4 ${selected ? "text-accent-foreground/50" : "text-muted-foreground"}`}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          {module.content_type === "video" && (
            <Video
              className={`h-3 w-3 ${selected ? "text-current" : "text-blue-500"}`}
            />
          )}
          {module.content_type === "slide" && (
            <FileText
              className={`h-3 w-3 ${selected ? "text-current" : "text-orange-500"}`}
            />
          )}
          {module.content_type === "quiz" && (
            <HelpCircle
              className={`h-3 w-3 ${selected ? "text-current" : "text-green-500"}`}
            />
          )}
          <span className="truncate text-sm font-medium">{module.title}</span>
        </div>
      </div>
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1 hover:bg-destructive/10 rounded-md"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </div>
    </div>
  );
}
