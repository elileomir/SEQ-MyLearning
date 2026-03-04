import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PlusCircle,
  Edit,
  Trash2,
  Globe,
  EyeOff,
  MoreHorizontal,
  FileText,
  Users,
  Loader2,
  BrainCircuit,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AICourseGeneratorDialog,
  CourseGenerationParams,
} from "@/components/admin/AICourseGeneratorDialog";
import { generateFullCourse, GeneratedCourse } from "@/lib/gemini";

// Helper to detect video platform from URL
function detectVideoPlatform(url: string): string {
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  return "direct"; // MP4 or other direct link
}

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStage, setGenerationStage] = useState<string>("Initializing AI Engine...");

  /* const [layout, setLayout] = useState("list"); */
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchCourses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("mylearning_courses")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setCourses(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const togglePublish = async (course: Course) => {
    const newStatus = !course.is_published;
    await supabase
      .from("mylearning_courses")
      .update({ is_published: newStatus })
      .eq("id", course.id);

    // Optimistic update
    setCourses(
      courses.map((c) =>
        c.id === course.id ? { ...c, is_published: newStatus } : c,
      ),
    );
    toast.success(`Course ${newStatus ? "Published" : "Unpublished"}`);
  };

  const deleteCourse = async () => {
    if (!deleteId) return;

    const { error } = await supabase
      .from("mylearning_courses")
      .delete()
      .eq("id", deleteId);

    if (!error) {
      setCourses(courses.filter((c) => c.id !== deleteId));
      toast.success("Course deleted successfully");
    } else {
      toast.error("Error deleting course: " + error.message);
    }
    setDeleteId(null);
  };

  const createCourse = async () => {
    const { data, error } = await supabase
      .from("mylearning_courses")
      .insert({
        title: "Untitled Course",
        description: "New course description...",
        is_published: false,
        target_job_roles: ["All"],
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
    } else if (data) {
      toast.success("Course created! Redirecting...");
      navigate(`/admin/course/${data.id}/edit`);
    }
  };

  // Handler for AI Course Generation
  const handleGenerateCourse = async (params: CourseGenerationParams) => {
    if (!user) return;
    setIsGenerating(true);
    setGenerationStage("Initializing AI Engine...");
    try {
      // 1. Generate Content via AI
      const generatedData: GeneratedCourse = await generateFullCourse({
        ...params,
        onProgress: setGenerationStage,
      });

      // 2. Create Course in DB
      const { data: courseData, error: courseError } = await supabase
        .from("mylearning_courses")
        .insert({
          title: generatedData.title,
          description: generatedData.description,
          created_by: user.id,
          is_published: false, // Default to draft so user can review
          target_job_roles: ["All"], // Add default job role
        })
        .select()
        .single();

      if (courseError || !courseData)
        throw courseError || new Error("Failed to create course");

      // 3. Create Modules
      const modulesToInsert = generatedData.modules.map((mod, index) => ({
        course_id: courseData.id,
        title: mod.title,
        description: `Module ${index + 1}: ${mod.title}`,
        content_type: mod.type,
        content_data:
          mod.type === "quiz"
            ? { questions: mod.questions }
            : mod.type === "video" && mod.videoUrl // If type is video, verify URL
              ? {
                url: mod.videoUrl,
                platform: detectVideoPlatform(mod.videoUrl),
              } // Use 'url' to match ModuleEditor
              : mod.content,
        // NOTE: If type is 'slide', content_data is string (markdown).
        // If 'quiz', it's JSON object.
        sequence_order: index,
      }));

      // Adjusting content_data structure based on assumption
      // Ideally check schema, but { markdown: ... } is safer than raw string in JSONB column.

      const refinedModules = modulesToInsert.map((m) => ({
        ...m,
        content_data:
          m.content_type === "slide"
            ? { markdown: m.content_data as string }
            : m.content_data,
      }));

      const { error: modulesError } = await supabase
        .from("mylearning_modules")
        .insert(refinedModules);

      if (modulesError) throw modulesError;

      toast.success(`Course "${generatedData.title}" generated successfully!`);

      // Refresh list
      fetchCourses();
    } catch (error: any) {
      console.error("Course Generation Logic Error:", error);
      toast.error("Generation Failed: " + (error.message || "Unknown error"));
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Course Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Build and manage your training catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AICourseGeneratorDialog
            onGenerate={handleGenerateCourse}
            isGenerating={isGenerating}
          />
          <Button onClick={createCourse} className="gap-2 shadow-sm">
            <PlusCircle className="h-4 w-4" />
            Create Manual Course
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {courses.map((course) => (
          <Card
            key={course.id}
            className="group flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 transition-all hover:bg-muted/10 hover:border-primary/20 hover:shadow-sm"
          >
            <div className="flex items-start gap-4 mb-4 sm:mb-0 w-full sm:w-auto">
              {/* Icon Placeholder */}
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-primary" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h3
                    className="font-semibold text-lg hover:text-primary cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/course/${course.id}/edit`)}
                  >
                    {course.title}
                  </h3>
                  {course.is_published ? (
                    <Badge
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Globe className="h-3 w-3 mr-1" /> Published
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    >
                      <EyeOff className="h-3 w-3 mr-1" /> Draft
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {course.target_job_roles?.length === 1 &&
                      course.target_job_roles[0] === "All"
                      ? "All Employees"
                      : `${course.target_job_roles?.length} Roles`}
                  </span>
                  <span>•</span>
                  <span>
                    Created{" "}
                    {course.created_at
                      ? new Date(course.created_at).toLocaleDateString()
                      : "Unknown"}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex"
                onClick={() => togglePublish(course)}
              >
                {course.is_published ? "Unpublish" : "Publish"}
              </Button>

              <Button
                size="sm"
                className="gap-2 flex-1 sm:flex-none"
                onClick={() => navigate(`/admin/course/${course.id}/edit`)}
              >
                <Edit className="h-4 w-4" /> Edit Content
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => togglePublish(course)}>
                    {course.is_published ? "Unpublish" : "Publish"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      window.open(`/course/${course.id}?preview=true`, "_blank")
                    }
                  >
                    <Globe className="h-4 w-4 mr-2" /> Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => setDeleteId(course.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Course
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}

        {courses.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg bg-muted/5">
            <div className="bg-muted p-4 rounded-full mb-4">
              <PlusCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold">No courses yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm text-center">
              Create your first course to start building your organization's
              learning path.
            </p>
            <Button onClick={createCourse}>Create Course</Button>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              course and remove all data associated with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={deleteCourse}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dynamic AI Generation Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-md transition-all duration-500 animate-in fade-in">
          <div className="flex flex-col items-center max-w-lg w-full p-8 rounded-3xl bg-white shadow-2xl border border-purple-100 text-center space-y-8 animate-in zoom-in-95 duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-2xl animate-pulse"></div>
              <div className="relative bg-gradient-to-tr from-purple-100 to-indigo-50 p-6 rounded-full border border-purple-200 shadow-inner">
                <BrainCircuit className="w-16 h-16 text-purple-600 animate-bounce" />
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Generating Course...
              </h2>
              <p className="text-gray-500 text-sm max-w-[280px] mx-auto leading-relaxed">
                Our AI is crafting your curriculum, modules, and assessments. This might take a minute or two.
              </p>
            </div>

            <div className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center gap-3 text-left shadow-sm">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Current Action</p>
                <p className="text-sm font-medium text-gray-700 truncate" title={generationStage}>
                  {generationStage}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
