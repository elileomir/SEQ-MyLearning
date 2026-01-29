import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  PlayCircle,
  CheckCircle,
  Clock,
  BookOpen,
  ArrowRight,
} from "lucide-react";
/* import { cn } from "@/lib/utils"; */

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];
type UserProgress =
  Database["public"]["Tables"]["mylearning_user_progress"]["Row"] & {
    mylearning_courses: Course | null;
  };

export default function MyCourses() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [progressData, setProgressData] = useState<UserProgress[]>([]);

  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchMyCourses() {
      if (!user) return;
      setLoading(true);

      const [progressRes, modulesRes] = await Promise.all([
        supabase
          .from("mylearning_user_progress")
          .select(
            `
          *,
          mylearning_courses (*)
        `,
          )
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false }),
        supabase.from("mylearning_modules").select("id, course_id"),
      ]);

      if (progressRes.error) {
        console.error("Error fetching courses:", progressRes.error);
      } else {
        setProgressData(progressRes.data as any);
      }

      if (modulesRes.data) {
        const counts: Record<string, number> = {};
        modulesRes.data.forEach((m) => {
          if (m.course_id) {
            counts[m.course_id] = (counts[m.course_id] || 0) + 1;
          }
        });
        setModuleCounts(counts);
      }

      setLoading(false);
    }
    fetchMyCourses();
  }, [user]);

  /* calculateProgress removed */

  const lastActive = progressData[0]; // First item since we ordered by updated_at desc

  const inProgressCourses = progressData.filter(
    (p) => p.status !== "completed",
  );
  const completedCourses = progressData.filter((p) => p.status === "completed");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">My Learning</h1>
          <p className="text-muted-foreground">
            Track your progress and continue where you left off.
          </p>
        </div>
      </div>

      {/* Hero: Resume Learning */}
      {lastActive &&
        lastActive.mylearning_courses &&
        lastActive.status !== "completed" && (
          <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-800 shadow-xl group">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]" />
            <div className="relative flex flex-col md:flex-row items-center gap-6 p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 ring-4 ring-primary/10 shrink-0">
                <PlayCircle className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start text-primary font-medium text-sm uppercase tracking-wider">
                  <Clock className="h-4 w-4" />
                  Resume Learning
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {lastActive.mylearning_courses.title}
                </h2>
                <p className="text-zinc-400 max-w-lg">
                  You are currently enrolled in this course. Jump back in to
                  make progress.
                </p>
              </div>
              <Button
                size="lg"
                className="rounded-full px-8 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                onClick={() => navigate(`/course/${lastActive.course_id}`)}
              >
                Continue Course <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      {/* Tabs & Grid */}
      <Tabs defaultValue="in-progress" className="space-y-6">
        <TabsList className="bg-zinc-100 dark:bg-zinc-900/50 p-1 border">
          <TabsTrigger value="in-progress" className="gap-2">
            <BookOpen className="h-4 w-4" /> In Progress (
            {inProgressCourses.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle className="h-4 w-4" /> Completed (
            {completedCourses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="space-y-6">
          {inProgressCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-muted/5">
              <BookOpen className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No courses in progress</p>
              <Button variant="link" onClick={() => navigate("/")}>
                Browse Courses
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {inProgressCourses.map((item) => (
                <CourseProgressCard
                  key={item.id}
                  item={item}
                  navigate={navigate}
                  totalModules={
                    item.course_id ? moduleCounts[item.course_id] || 0 : 0
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-6">
          {completedCourses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-muted/5">
              <CheckCircle className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No completed courses yet</p>
              <p className="text-muted-foreground">
                Keep learning to earn certificates!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {completedCourses.map((item) => (
                <CourseProgressCard
                  key={item.id}
                  item={item}
                  navigate={navigate}
                  completed
                  userName={
                    user?.user_metadata?.full_name || user?.email || "Student"
                  }
                  totalModules={
                    item.course_id ? moduleCounts[item.course_id] || 0 : 0
                  }
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { jsPDF } from "jspdf";
import { Download, RefreshCw } from "lucide-react";

// ... (imports remain)

// ... (MyCourses component remains mostly same, passing user to Card)

function CourseProgressCard({
  item,
  navigate,
  completed = false,
  userName,
  totalModules = 0,
}: {
  item: UserProgress;
  navigate: any;
  completed?: boolean;
  userName?: string;
  totalModules?: number;
}) {
  const course = item.mylearning_courses;
  if (!course) return null;

  const completedCount = Object.values(
    (item.module_states as Record<string, any>) || {},
  ).filter((s: any) => s.completed).length;

  const progressPercent = completed
    ? 100
    : totalModules > 0
      ? Math.round((completedCount / totalModules) * 100)
      : 0;

  const handleDownloadCertificate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // --- Resources ---
    const logoUrl = "/SEQ_Logo.png";
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const centerX = pageWidth / 2;

    // --- Colors ---
    const primaryColor = [30, 41, 59]; // Zinc-800 equivalent
    const secondaryColor = [100, 116, 139]; // Slate-500

    // --- Loading Logo (Async) ---
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
    };

    try {
      // 1. Border
      doc.setDrawColor(203, 213, 225); // Slate-300
      doc.setLineWidth(1);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20); // Outer

      doc.setDrawColor(30, 41, 59); // Inner Dark Border
      doc.setLineWidth(0.5);
      doc.rect(15, 15, pageWidth - 30, pageHeight - 30); // Inner

      // 2. Logo
      try {
        const logo = await loadImage(logoUrl);
        const logoWidth = 40;
        const logoHeight = (logo.height / logo.width) * logoWidth;
        doc.addImage(
          logo,
          "PNG",
          centerX - logoWidth / 2,
          35,
          logoWidth,
          logoHeight,
        );
      } catch (err) {
        // Fallback
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(30, 41, 59);
        doc.text("SEQ FORMWORK", centerX, 55, { align: "center" });
      }

      // 3. Title
      doc.setFont("times", "normal");
      doc.setFontSize(14);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text("CERTIFICATE OF COMPLETION", centerX, 80, { align: "center" });

      // 4. "This certifies that"
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text("This is to certify that", centerX, 95, { align: "center" });

      // 5. User Name
      doc.setFont("times", "bolditalic");
      doc.setFontSize(36);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(userName || "Student Name", centerX, 115, { align: "center" });

      // Line under name
      doc.setDrawColor(203, 213, 225);
      doc.line(centerX - 60, 118, centerX + 60, 118);

      // 6. "Has successfully completed..."
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text("has successfully completed the course", centerX, 135, {
        align: "center",
      });

      // 7. Course Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      const splitTitle = doc.splitTextToSize(course?.title || "Course", 180);
      doc.text(splitTitle, centerX, 155, { align: "center" });

      // 8. Date and ID/Signature Area
      const footerY = 175;

      // Date (Left)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text("Date Issued", centerX - 50, footerY);
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text(new Date().toLocaleDateString(), centerX - 50, footerY + 8);

      // Signature / ID (Right)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text("Authorized By", centerX + 50, footerY);
      doc.setFont("times", "italic");
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text("SEQ Formwork", centerX + 50, footerY + 8);

      // 9. Document Footer
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(200, 200, 200);
      doc.text("Verified Certificate", centerX, 195, { align: "center" });

      doc.save(`${course.title.replace(/\s+/g, "_")}_Certificate.pdf`);
    } catch (e) {
      console.error("Certificate generation failed", e);
      doc.save("certificate.pdf");
    }
  };

  return (
    <Card className="group overflow-hidden border-zinc-200 dark:border-zinc-800 hover:border-primary/50 transition-all hover:shadow-lg dark:bg-zinc-900/40 backdrop-blur-sm">
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 relative">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <BookOpen className="h-8 w-8 text-zinc-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />

        {completed && (
          <div className="absolute top-3 right-3">
            <Badge className="bg-green-600 hover:bg-green-700 shadow-sm gap-1">
              <CheckCircle className="h-3 w-3" /> Completed
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-5 space-y-3">
        <h3 className="font-bold text-lg leading-tight line-clamp-1 group-hover:text-primary transition-colors">
          {course.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2 h-10">
          {course.description || "No description provided."}
        </p>

        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs font-medium">
            <span>{completed ? "Completed" : "In Progress"}</span>
            {!completed && (
              <span className="text-muted-foreground">
                {completedCount} / {totalModules} Modules
              </span>
            )}
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardContent>

      <CardFooter className="p-5 pt-0 gap-2">
        {completed ? (
          <>
            <Button
              className="flex-1 gap-2"
              variant="outline"
              onClick={() => navigate(`/course/${item.course_id}`)}
              title="Review Course"
            >
              <RefreshCw className="h-4 w-4" /> Review
            </Button>
            <Button
              className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleDownloadCertificate}
            >
              <Download className="h-4 w-4" /> Certificate
            </Button>
          </>
        ) : (
          <Button
            className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
            variant="default"
            onClick={() => navigate(`/course/${item.course_id}`)}
          >
            Continue{" "}
            <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
