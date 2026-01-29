import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";
import {
  PlayCircle,
  Award,
  BookOpen,
  Clock,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];
type UserProgress =
  Database["public"]["Tables"]["mylearning_user_progress"]["Row"];

interface CourseWithProgress extends Course {
  progress?: UserProgress;
  progressPercent?: number;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!profile || !user) return;

      try {
        // Parallel fetch for courses, progress, and modules (for calculation)
        const [coursesResponse, progressResponse, modulesResponse] =
          await Promise.all([
            supabase
              .from("mylearning_courses")
              .select("*")
              .eq("is_published", true),
            supabase
              .from("mylearning_user_progress")
              .select("*")
              .eq("user_id", user.id),
            supabase.from("mylearning_modules").select("id, course_id"),
          ]);

        if (coursesResponse.error) throw coursesResponse.error;
        if (progressResponse.error) throw progressResponse.error;

        // Calculate Module Counts
        const moduleCounts: Record<string, number> = {};
        if (modulesResponse.data) {
          modulesResponse.data.forEach((m) => {
            if (m.course_id) {
              moduleCounts[m.course_id] = (moduleCounts[m.course_id] || 0) + 1;
            }
          });
        }

        // Filter by Role
        const filteredCourses = (coursesResponse.data || []).filter(
          (course) => {
            const roles = course.target_job_roles || [];
            return (
              roles.includes("All") ||
              (profile.job_role && roles.includes(profile.job_role))
            );
          },
        );

        // Merge Progress
        const progressMap = new Map(
          (progressResponse.data || []).map((p) => [p.course_id, p]),
        );

        const merged = filteredCourses.map((course) => {
          const userProgress = progressMap.get(course.id);
          let percent = 0;

          if (userProgress) {
            if (userProgress.status === "completed") {
              percent = 100;
            } else {
              const totalModules = moduleCounts[course.id] || 0;
              if (userProgress.module_states && totalModules > 0) {
                const states = userProgress.module_states as Record<
                  string,
                  any
                >;
                const completed = Object.values(states).filter(
                  (s: any) => s.completed,
                ).length;
                percent = Math.round((completed / totalModules) * 100);
              }
            }
          }

          return {
            ...course,
            progress: userProgress,
            progressPercent: percent,
          };
        });

        setCourses(merged);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [profile, user]);

  const inProgressCourses = courses.filter(
    (c) => c.progress && c.progress.status !== "completed",
  );
  const completedCourses = courses.filter(
    (c) => c.progress?.status === "completed",
  );
  const newCourses = courses.filter((c) => !c.progress);

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground animate-pulse">
            Loading your learning path...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-10">
      {/* Hero Welcome */}
      <div className="flex flex-col gap-2 border-b pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Welcome back, {profile?.full_name?.split(" ")[0]}!
        </h1>
        <p className="text-lg text-muted-foreground w-full max-w-2xl">
          You have{" "}
          <span className="font-medium text-primary">
            {inProgressCourses.length + newCourses.length}
          </span>{" "}
          active training modules. Keep up the great work!
        </p>
      </div>

      {/* Continue Learning Section */}
      {inProgressCourses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Continue Learning
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {inProgressCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                navigate={navigate}
                user={user}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Training Section */}
      {completedCourses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" /> Completed Training
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {completedCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                navigate={navigate}
                user={user}
              />
            ))}
          </div>
        </div>
      )}

      {/* Course Library */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" /> Training Library
          </h2>
          {/* Optional Filter or Search could go here */}
        </div>
        {newCourses.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {newCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                navigate={navigate}
                user={user}
              />
            ))}
          </div>
        ) : (
          inProgressCourses.length === 0 &&
          completedCourses.length === 0 && (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 text-center">
              <p className="text-muted-foreground">
                No new courses assigned right now.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

import { NavigateFunction } from "react-router-dom";
import { generateCertificate } from "@/lib/certificate";

function CourseCard({
  course,
  navigate,
  user,
}: {
  course: CourseWithProgress;
  navigate: NavigateFunction;
  user: any;
}) {
  const isCompleted = course.progress?.status === "completed";
  const isInProgress = !!course.progress && !isCompleted;

  const handleCertificateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    generateCertificate({
      course: course,
      userName: user?.user_metadata?.full_name || user?.email || "Student",
    });
  };

  return (
    <Card className="group flex flex-col overflow-hidden border-border/50 transition-all hover:border-primary/50 hover:shadow-md h-full">
      {/* Cover Image Area */}
      <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden group-hover:opacity-95 transition-opacity">
        {course.cover_image_url ? (
          <img
            src={course.cover_image_url}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900">
            <Award className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {/* Badge Overlay */}
        {isInProgress && (
          <Badge className="absolute top-3 right-3 bg-blue-600 hover:bg-blue-700">
            In Progress
          </Badge>
        )}
        {isCompleted && (
          <Badge className="absolute top-3 right-3 bg-green-600 hover:bg-green-700">
            Completed
          </Badge>
        )}
      </div>

      <CardHeader className="p-4 pb-2">
        <CardTitle className="line-clamp-1 text-lg group-hover:text-primary transition-colors">
          {course.title}
        </CardTitle>
        <CardDescription className="line-clamp-2 text-xs mt-1 min-h-[2.5em]">
          {course.description || "No description provided."}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 py-2 mt-auto">
        {/* Optional: Add tags or metadata here */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Example: "3 Modules" or "~20 mins" if we had that data */}
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-2 gap-2 flex-col sm:flex-row">
        {isCompleted ? (
          <>
            <Button
              className="flex-1 w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              variant="default"
              onClick={handleCertificateClick}
            >
              <Award className="h-4 w-4" /> Certificate
            </Button>
            <Button
              className="flex-1 w-full gap-2"
              variant="outline"
              onClick={() => navigate(`/course/${course.id}`)}
              title="Review Course Content"
            >
              <BookOpen className="h-4 w-4" /> Review
            </Button>
          </>
        ) : (
          <Button
            className={`w-full gap-2 transition-all`}
            variant={isInProgress ? "default" : "secondary"}
            onClick={() => navigate(`/course/${course.id}`)}
          >
            {isInProgress ? (
              <PlayCircle className="h-4 w-4" />
            ) : (
              <BookOpen className="h-4 w-4" />
            )}
            {isInProgress ? "Resume Course" : "Start Course"}
            {!isInProgress && (
              <ArrowRight className="h-3 w-3 ml-auto opacity-50" />
            )}
          </Button>
        )}
      </CardFooter>
      {/* Progress Bar (Bottom) */}
      {isInProgress && (
        <Progress
          value={course.progressPercent ?? 0}
          className="h-1 rounded-none"
        />
      )}
      {isCompleted && (
        <Progress value={100} className="h-1 rounded-none bg-green-200" />
      )}
    </Card>
  );
}
