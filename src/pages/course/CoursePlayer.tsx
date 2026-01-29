import { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactPlayer from "react-player";
import { generateCertificate } from "@/lib/certificate";
import { Button } from "@/components/ui/button";

import {
  CheckCircle,
  PlayCircle,
  FileText,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Menu,
  Download,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";
import { useAuth } from "@/context/AuthContext";

type Course = Database["public"]["Tables"]["mylearning_courses"]["Row"];
type Module = Database["public"]["Tables"]["mylearning_modules"]["Row"];
type Progress = Database["public"]["Tables"]["mylearning_user_progress"]["Row"];

import ReactMarkdown from "react-markdown";
import QuizPlayer from "@/components/player/QuizPlayer";

export default function CoursePlayer() {
  const { id } = useParams();
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Data State
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);

  // UI State
  const [activeModule, setActiveModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);

  // Custom Player State
  const [playing, setPlaying] = useState(false);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Refs
  const playerRef = useRef<ReactPlayer>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Sidebar Logic
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /* Admin Preview Logic */
  const searchParams = new URLSearchParams(window.location.search);
  const isPreview = searchParams.get("preview") === "true";

  useEffect(() => {
    if (id && user) {
      fetchData(id);
    }
  }, [id, user]);

  // Video Progress Saver Effect
  useEffect(() => {
    return () => {
      if (
        activeModule?.content_type === "video" &&
        playerRef.current &&
        !isPreview
      ) {
        // Cleanup logic if needed
      }
    };
  }, [activeModule]);

  // Auto-scroll to top when active module changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo(0, 0);
    }
  }, [activeModule?.id]);

  async function fetchData(courseId: string) {
    const { data: courseData, error: courseError } = await supabase
      .from("mylearning_courses")
      .select("*")
      .eq("id", courseId)
      .single();

    if (courseError || !courseData) {
      console.error(courseError);
      return;
    }
    setCourse(courseData);

    const { data: moduleData } = await supabase
      .from("mylearning_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("sequence_order", { ascending: true });

    const sortedModules = moduleData || [];
    setModules(sortedModules);

    if (isPreview) {
      setLoading(false);
      // CHECK URL FOR MODULE ID
      const moduleIdFromUrl = searchParams.get("moduleId");
      const currentMod = moduleIdFromUrl
        ? sortedModules.find((m) => m.id === moduleIdFromUrl) ||
          sortedModules[0]
        : sortedModules[0];

      const currentIndex = sortedModules.findIndex(
        (m) => m.id === currentMod.id,
      );
      const mockStates: Record<string, any> = {};
      for (let i = 0; i < currentIndex; i++) {
        mockStates[sortedModules[i].id] = { completed: true };
      }

      setProgress({
        id: "preview-id",
        user_id: user?.id || "admin",
        course_id: courseId,
        status: "started",
        module_states: mockStates,
        current_module_id: currentMod.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completion_date: null,
        certificate_url: null,
      });

      setActiveModule(currentMod);
      setVideoCompleted(false);
      setPlaying(false);
      return;
    }

    let { data: progressData } = await supabase
      .from("mylearning_user_progress")
      .select("*")
      .eq("user_id", user!.id)
      .eq("course_id", courseId)
      .single();

    if (!progressData) {
      const { data: newProgress } = await supabase
        .from("mylearning_user_progress")
        .insert({
          user_id: user!.id,
          course_id: courseId,
          status: "started",
          module_states: {},
          current_module_id: sortedModules[0]?.id,
        })
        .select()
        .single();
      progressData = newProgress;
    }

    setProgress(progressData);

    // If completely done, show celebration state theoretically?
    // Maybe not on reload, just show 100%.

    const currentModId = progressData?.current_module_id;
    const currentMod =
      sortedModules.find((m) => m.id === currentModId) || sortedModules[0];
    setActiveModule(currentMod);
    setVideoCompleted(isModuleCompleted(currentMod.id));
    setPlaying(false);

    setLoading(false);
  }

  const isModuleCompleted = (moduleId: string) => {
    if (!progress?.module_states) return false;
    const states = progress.module_states as Record<string, any>;
    return states[moduleId]?.completed === true;
  };

  /* Duration Logic Fix */
  const updateModuleDuration = async (durationSec: number) => {
    if (isPreview || !activeModule || activeModule.content_type !== "video")
      return;

    const durationMin = Math.ceil(durationSec / 60);
    if ((activeModule as any).duration_min !== durationMin && durationMin > 0) {
      setModules(
        (prev) =>
          prev.map((m) =>
            m.id === activeModule.id ? { ...m, duration_min: durationMin } : m,
          ) as any,
      );

      await supabase
        .from("mylearning_modules")
        .update({ duration_min: durationMin } as any)
        .eq("id", activeModule.id);
    }
  };

  const handleModuleSelect = async (module: Module) => {
    if (
      activeModule &&
      activeModule.id !== module.id &&
      !isPreview &&
      activeModule.content_type === "video"
    ) {
      // Save progress before leaving
      const currentStates =
        (progress?.module_states as Record<string, any>) || {};
      const currentSec = playerRef.current?.getCurrentTime() || 0;

      const newStates = {
        ...currentStates,
        [activeModule.id]: {
          ...(currentStates[activeModule.id] || {}),
          last_position: currentSec,
        },
      };
      persistProgressToDb(newStates);
    }

    setActiveModule(module);
    setVideoCompleted(isModuleCompleted(module.id));
    setIsSidebarOpen(false);
    setPlaying(true);
    setPlayedSeconds(0);
    setDuration(0);

    if (isPreview) {
      // ... previous preview logic ...
      return;
    }

    if (progress && !isPreview) {
      await supabase
        .from("mylearning_user_progress")
        .update({ current_module_id: module.id })
        .eq("id", progress.id);
    }
  };

  const saveVideoProgress = async (moduleId: string, seconds: number) => {
    if (isPreview || !progress) return;
    const currentStates = (progress.module_states as Record<string, any>) || {};
    const currentState = currentStates[moduleId] || {};

    const newStates = {
      ...currentStates,
      [moduleId]: {
        ...currentState,
        last_position: seconds,
        updated_at: new Date().toISOString(),
      },
    };

    setProgress({ ...progress, module_states: newStates });
  };

  const persistProgressToDb = async (newStates: any) => {
    if (!progress) return;
    await supabase
      .from("mylearning_user_progress")
      .update({ module_states: newStates })
      .eq("id", progress.id);
  };

  // UPDATED: Logic to trigger Course Completion only when explicit
  const handleCourseCompletion = async (newStates: any) => {
    // 1. Update DB status to 'completed'
    await supabase
      .from("mylearning_user_progress")
      .update({
        status: "completed",
        completion_date: new Date().toISOString(),
        module_states: newStates,
      })
      .eq("id", progress!.id);

    // 2. Local State Update
    setProgress((prev: any) => ({
      ...prev,
      status: "completed",
      completion_date: new Date().toISOString(),
      module_states: newStates,
    }));

    // 3. UI Celebration
    setShowCelebration(true);
  };

  const markModuleComplete = async (moduleId: string, score?: number) => {
    if (isPreview) return;
    if (!progress) return;

    const currentStates = (progress.module_states as Record<string, any>) || {};
    const currentState = currentStates[moduleId] || {};

    // If already complete, we don't need to re-complete unless updating score
    // But we need to check if this was the last requirement for course completion

    const newStates = {
      ...currentStates,
      [moduleId]: {
        ...currentState,
        completed: true,
        completion_date: new Date().toISOString(),
        score,
      },
    };

    const updates: any = { module_states: newStates };

    // Check if ALL modules are now complete
    const allComplete = modules.every((m) => newStates[m.id]?.completed);

    if (allComplete) {
      // Only trigger full completion here IF:
      // 1. It's a quiz pass (handled by QuizPlayer callback normally, but we call this helper)
      // 2. OR it's a manual "Finish Course" click (which calls this helper)
      // Ideally markModuleComplete just marks the module.
      // The UI button or Quiz callback decides when to "Finish Course".
      // BUT, to keep state consistent, we should verify.
      // If this is the LAST module, and we are marking it complete...
      // We should probably NOT autoset course status to completed unless explicit?
      // User Requirement: "if last module is quiz then user will need to pass first... if slides/video then button complete course"
      // So we DO NOT automatically set status='completed' here.
      // We only save module state.
    }

    const { data } = await supabase
      .from("mylearning_user_progress")
      .update(updates)
      .eq("id", progress.id)
      .select()
      .single();

    if (data) setProgress(data);

    return newStates;
  };

  const handleDownloadCertificate = async () => {
    if (!course || !profile) return;
    await generateCertificate({
      course: course,
      userName: profile.full_name || "Student Name",
    });
  };

  /* Video Helper Functions */
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2500);
  };

  const handlePlayPause = () => setPlaying(!playing);
  const handleVolumeChange = (e: any) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setMuted(newVol === 0);
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return "0:00";
    const date = new Date(seconds * 1000);
    const mm = date.getUTCMinutes();
    const ss = date.getSeconds().toString().padStart(2, "0");
    if (mm > 59) {
      const hh = date.getUTCHours();
      return `${hh}:${mm.toString().padStart(2, "0")}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  const getModuleDuration = (mod: Module) => {
    if (mod.content_type === "slide") {
      const text = (mod.content_data as any)?.markdown || "";
      const wordCount = text.trim().split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200);
      return Math.max(1, readingTime) + " min";
    }
    if (mod.content_type === "quiz") {
      const qCount = (mod.content_data as any)?.questions?.length || 0;
      return Math.max(1, qCount * 1) + " min";
    }
    if (mod.content_type === "video") {
      if ((mod as any).duration_min) return (mod as any).duration_min + " min";
      return "";
    }
    return "";
  };

  const isModuleLocked = (index: number) => {
    if (index === 0) return false;
    const prevModuleId = modules[index - 1].id;
    return !isModuleCompleted(prevModuleId);
  };

  const currentModuleIndex = modules.findIndex(
    (m) => m.id === activeModule?.id,
  );

  /* SUB-COMPONENTS */
  const ModuleList = () => (
    <div className="flex flex-col h-full bg-zinc-900/95 backdrop-blur-sm text-zinc-300 border-r border-zinc-800">
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
        <div>
          <h3 className="font-semibold text-white">Course Content</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {modules.length} Modules
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(false)}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {modules.map((module, idx) => {
            const isActive = activeModule?.id === module.id;
            const isLocked = !isPreview && isModuleLocked(idx);
            const isCompleted = isModuleCompleted(module.id);
            return (
              <button
                key={module.id}
                disabled={isLocked}
                onClick={() => handleModuleSelect(module)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left group ${
                  isActive
                    ? "bg-blue-600/20 text-blue-400 border border-blue-600/30"
                    : isLocked
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-zinc-800 text-zinc-300 hover:text-white"
                }`}
              >
                <div className="shrink-0">
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : isLocked ? (
                    <div className="h-5 w-5 rounded-full border-2 border-zinc-700 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-zinc-700" />
                    </div>
                  ) : (
                    <PlayCircle
                      className={`h-5 w-5 ${isActive ? "text-blue-400" : "text-zinc-500"}`}
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">
                    {module.title}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-1 capitalize">
                    {getModuleDuration(module) && (
                      <>{getModuleDuration(module)} • </>
                    )}
                    {module.content_type}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading...
      </div>
    );

  // Calculate Progress Percentage based on Completed Modules relative to Total Logic?
  // User wants 100% only if course is totally complete (certificate issued).
  const isCourseFullyComplete = progress?.status === "completed";
  const completedModuleCount = modules.filter((m) =>
    isModuleCompleted(m.id),
  ).length;
  // If not completed fully, cap at 99% or just show ratio?
  // User says: "only if certificate issue does the course show complete or 100%"
  // So if ratio is 1.0 but status != 'completed', show 99%?
  let displayPercent = Math.round(
    (completedModuleCount / modules.length) * 100,
  );
  if (displayPercent === 100 && !isCourseFullyComplete) displayPercent = 99;

  return (
    <div className="fixed inset-0 bg-zinc-950 flex overflow-hidden font-sans">
      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex flex-col items-center justify-center text-white animate-in fade-in duration-500">
          <div className="text-center space-y-8 p-8 max-w-2xl w-full border border-zinc-800 bg-zinc-900/50 rounded-2xl shadow-2xl">
            <div className="inline-flex p-4 rounded-full bg-green-500/10 mb-2 ring-1 ring-green-500/20">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>

            <div className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-serif text-white tracking-tight">
                Course Completed
              </h1>
              <p className="text-zinc-400 text-lg">
                You have successfully finished <br />
                <span className="text-white font-medium mt-1 block text-xl">
                  {course?.title}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md mx-auto pt-6">
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/")}
                className="w-full border-zinc-700 hover:bg-zinc-800 text-zinc-300 hover:text-white h-12"
              >
                Exit Course
              </Button>
              <Button
                size="lg"
                onClick={handleDownloadCertificate}
                className="w-full bg-white text-black hover:bg-zinc-200 h-12 font-medium"
              >
                <Download className="mr-2 h-4 w-4" /> Download Certificate
              </Button>
            </div>

            <button
              onClick={() => setShowCelebration(false)}
              className="text-sm text-zinc-500 hover:text-zinc-300 underline underline-offset-4"
            >
              Back to Course Content
            </button>
          </div>
        </div>
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-zinc-800 transform transition-transform duration-300 ease-in-out shadow-2xl ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <ModuleList />
      </div>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col h-full relative transition-all duration-300 w-full">
        {/* Header */}
        <header className="h-16 shrink-0 flex items-center justify-between px-4 md:px-6 bg-zinc-950 border-b border-zinc-800 z-30">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex flex-col">
              <h1 className="text-sm md:text-base font-semibold text-white truncate max-w-[200px] md:max-w-md">
                {course?.title}
              </h1>
              {progress && (
                <div className="flex items-center gap-2">
                  <div className="h-1 w-24 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{
                        width: `${displayPercent}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {displayPercent}% Complete
                  </span>
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-500 hover:text-white gap-2"
            onClick={() => navigate("/")}
          >
            Exit Course <ArrowLeft className="h-4 w-4" />
          </Button>
        </header>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto bg-zinc-100 relative flex flex-col scroll-smooth"
        >
          {activeModule && (
            <div className="flex-1 flex flex-col min-h-full">
              {activeModule.content_type === "video" ? (
                <div
                  ref={playerContainerRef}
                  className="w-full h-full min-h-[60vh] flex-1 bg-black flex items-center justify-center relative group"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => playing && setShowControls(false)}
                >
                  <ReactPlayer
                    ref={playerRef}
                    url={
                      (typeof activeModule.content_data === "string"
                        ? activeModule.content_data
                        : (activeModule.content_data as any)?.url) || ""
                    }
                    width="100%"
                    height="100%"
                    playing={playing}
                    volume={volume}
                    muted={muted}
                    controls={false} // HIDE NATIVE CONTROLS
                    onPlay={() => setPlaying(true)}
                    onPause={() => {
                      setPlaying(false);
                      if (activeModule) {
                        saveVideoProgress(activeModule.id, playedSeconds);
                        const currentStates =
                          (progress?.module_states as Record<string, any>) ||
                          {};
                        const newStates = {
                          ...currentStates,
                          [activeModule.id]: {
                            ...(currentStates[activeModule.id] || {}),
                            last_position: playedSeconds,
                          },
                        };
                        persistProgressToDb(newStates);
                      }
                    }}
                    onReady={() => {
                      if (activeModule && progress?.module_states) {
                        const states = progress.module_states as Record<
                          string,
                          any
                        >;
                        const lastPos = states[activeModule.id]?.last_position;
                        if (lastPos && lastPos > 5 && !videoCompleted) {
                          playerRef.current?.seekTo(lastPos, "seconds");
                          setPlayedSeconds(lastPos);
                        }
                      }
                    }}
                    onEnded={() => {
                      setVideoCompleted(true);
                      if (!isPreview && activeModule)
                        markModuleComplete(activeModule.id);
                      if (document.fullscreenElement) document.exitFullscreen();
                    }}
                    onProgress={({ playedSeconds }) => {
                      setPlayedSeconds(playedSeconds);
                      if (Math.floor(playedSeconds) % 5 === 0 && activeModule) {
                        saveVideoProgress(activeModule.id, playedSeconds);
                        if (Math.floor(playedSeconds) % 15 === 0) {
                          // Sync to DB every 15s
                          const currentStates =
                            (progress?.module_states as Record<string, any>) ||
                            {};
                          const newStates = {
                            ...currentStates,
                            [activeModule.id]: {
                              ...(currentStates[activeModule.id] || {}),
                              last_position: playedSeconds,
                            },
                          };
                          persistProgressToDb(newStates);
                        }
                      }
                    }}
                    onDuration={(d) => {
                      setDuration(d);
                      updateModuleDuration(d);
                    }}
                    config={{
                      vimeo: {
                        playerOptions: {
                          playsinline: 1,
                          title: 0,
                          byline: 0,
                          portrait: 0,
                        },
                      },
                      youtube: {
                        playerVars: {
                          showinfo: 0,
                          controls: 0,
                          modestbranding: 1,
                          disablekb: 1,
                        },
                      },
                    }}
                  />

                  {/* Custom Controls Overlay */}
                  <div
                    className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-4 pt-10 transition-opacity duration-300 z-10 ${
                      showControls || !playing ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    {/* Progress Bar */}
                    <div
                      className={`w-full h-1.5 bg-zinc-700 rounded-full mb-4 overflow-hidden relative group/progress ${
                        isAdmin || isPreview ? "cursor-pointer" : ""
                      }`}
                      onClick={(e) => {
                        if (!isAdmin && !isPreview) return;
                        const progressBar = e.currentTarget;
                        const rect = progressBar.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const percent = x / rect.width;
                        const seconds = percent * duration;
                        playerRef.current?.seekTo(seconds);
                        setPlayedSeconds(seconds);
                      }}
                    >
                      <div
                        className="h-full bg-blue-500 relative transition-all duration-300"
                        style={{
                          width: `${duration > 0 ? (playedSeconds / duration) * 100 : 0}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      {/* Left Controls */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={handlePlayPause}
                          className="text-white hover:text-blue-400 transition-colors"
                        >
                          {playing ? (
                            <div className="h-8 w-8 flex items-center justify-center">
                              <div className="h-6 w-2 bg-white rounded-sm mr-1" />
                              <div className="h-6 w-2 bg-white rounded-sm" />
                            </div>
                          ) : (
                            <PlayCircle className="h-10 w-10 text-white fill-white/10" />
                          )}
                        </button>
                        <div className="text-sm font-medium text-white/90 tabular-nums">
                          {formatTime(playedSeconds)} / {formatTime(duration)}
                        </div>
                      </div>

                      {/* Right Controls */}
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 group/vol">
                          <button
                            onClick={() => setMuted(!muted)}
                            className="text-zinc-400 hover:text-white"
                          >
                            {muted || volume === 0 ? "🔇" : "🔊"}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step="any"
                            value={muted ? 0 : volume}
                            onChange={handleVolumeChange}
                            className="w-20 h-1 bg-zinc-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Completion Overlay */}
                  {videoCompleted && !playing && (
                    <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-500">
                      <div className="text-center space-y-6 max-w-md px-4">
                        <div className="mx-auto h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                          <CheckCircle className="h-10 w-10 text-green-500" />
                        </div>
                        <h2 className="text-3xl font-bold text-white">
                          Module Completed
                        </h2>
                        <div className="flex gap-4 justify-center">
                          <Button
                            variant="ghost"
                            className="bg-transparent border border-zinc-700 hover:bg-zinc-800 text-white"
                            onClick={() => {
                              setVideoCompleted(false);
                              setPlayedSeconds(0);
                              playerRef.current?.seekTo(0);
                              setPlaying(true);
                            }}
                          >
                            Replay Video
                          </Button>

                          {/* Next Module Action */}
                          {currentModuleIndex < modules.length - 1 ? (
                            <Button
                              className="bg-white text-black hover:bg-zinc-200 font-semibold"
                              onClick={() => {
                                const nextModule =
                                  modules[currentModuleIndex + 1];
                                handleModuleSelect(nextModule);
                              }}
                            >
                              Next Module{" "}
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                          ) : (
                            // Last module is video
                            <Button
                              className="bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                              onClick={async () => {
                                // Trigger Completion!
                                // Mark complete first
                                const newStates = await markModuleComplete(
                                  activeModule.id,
                                );
                                handleCourseCompletion(newStates);
                              }}
                            >
                              Finish Course <Trophy className="ml-2 h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Non-Video Content (Slide/Quiz)
                <div className="flex-1 flex flex-col bg-white">
                  {/* Header (Slide) */}
                  {activeModule.content_type === "slide" && (
                    <div className="relative h-48 md:h-64 shrink-0 overflow-hidden bg-slate-900 group">
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{
                          backgroundImage: course?.cover_image_url
                            ? `url(${course.cover_image_url})`
                            : "none",
                        }}
                      />
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                      <div className="relative z-10 size-full flex flex-col justify-end p-6 md:p-10 text-white max-w-5xl mx-auto w-full">
                        <div className="flex items-center gap-3 mb-2 opacity-80 text-sm font-medium uppercase tracking-wider">
                          <FileText className="h-4 w-4" /> Module{" "}
                          {currentModuleIndex + 1}
                        </div>
                        <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white shadow-black/50 drop-shadow-sm">
                          {activeModule.title}
                        </h2>
                      </div>
                    </div>
                  )}

                  <div className="flex-1 w-full max-w-5xl mx-auto p-6 md:p-10 bg-white">
                    {activeModule.content_type === "slide" && (
                      <div className="prose prose-slate max-w-none text-slate-800 prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 md:prose-lg">
                        <ReactMarkdown
                          components={{
                            h1: ({ node, ...props }) => (
                              <h1
                                className="text-3xl font-bold mb-6 mt-10 pb-2 border-b border-slate-200 text-slate-900 first:mt-0"
                                {...props}
                              />
                            ),
                            h2: ({ node, ...props }) => (
                              <h2
                                className="text-2xl font-semibold mb-4 mt-8 text-slate-900"
                                {...props}
                              />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul
                                className="list-disc pl-5 space-y-2 my-6"
                                {...props}
                              />
                            ),
                            ol: ({ node, ...props }) => (
                              <ol
                                className="list-decimal pl-5 space-y-2 my-6"
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
                                className="rounded-2xl shadow-lg my-8 w-full max-w-3xl mx-auto border border-slate-100"
                                alt={props.alt || "Slide image"}
                                {...props}
                              />
                            ),
                            blockquote: ({ node, ...props }) => (
                              <blockquote
                                className="border-l-4 border-blue-500 pl-4 py-1 my-6 italic text-slate-600 bg-slate-50 rounded-r-lg"
                                {...props}
                              />
                            ),
                          }}
                        >
                          {(activeModule.content_data as any).markdown ||
                            "No content provided."}
                        </ReactMarkdown>
                      </div>
                    )}
                    {activeModule.content_type === "quiz" && (
                      <QuizPlayer
                        module={activeModule}
                        previousAttempts={
                          (progress?.module_states as any)?.[activeModule.id]
                            ?.attempts || 0
                        }
                        isCourseCompleted={
                          isCourseFullyComplete &&
                          (progress?.module_states as any)?.[activeModule.id]
                            ?.completed
                        }
                        initialScore={
                          (progress?.module_states as any)?.[activeModule.id]
                            ?.score
                        }
                        initialPassed={
                          (progress?.module_states as any)?.[activeModule.id]
                            ?.completed
                        }
                        lastAttemptDate={
                          (progress?.module_states as any)?.[activeModule.id]
                            ?.last_attempt
                        }
                        onComplete={async (score, passed) => {
                          const currentAttempts =
                            (progress?.module_states as any)?.[activeModule.id]
                              ?.attempts || 0;

                          if (!progress) return;

                          // Calculate new states cleanly
                          const currentStates =
                            (progress.module_states as Record<string, any>) ||
                            {};
                          const currentState =
                            currentStates[activeModule.id] || {};

                          const settings = (activeModule.settings as any) || {};
                          const maxAttempts = settings.max_attempts;

                          let newAttemptsCount = currentAttempts + 1;
                          // If we were at/above max attempts, this must be a cooldown-allowed retry.
                          // User requested full reset of attempts in this case.
                          if (maxAttempts && currentAttempts >= maxAttempts) {
                            newAttemptsCount = 1;
                          }

                          const computedNewStates = {
                            ...currentStates,
                            [activeModule.id]: {
                              ...currentState,
                              attempts: newAttemptsCount,
                              score: score,
                              completed: currentState.completed || passed,
                              last_attempt: new Date().toISOString(),
                              completion_date: passed
                                ? new Date().toISOString()
                                : currentState.completion_date,
                            },
                          };

                          // Update DB
                          // We use persistProgressToDb defined in component
                          await persistProgressToDb(computedNewStates);

                          // CRITICAL: Update local state immediately so UI (Attempts Count) reflects change
                          setProgress((prev) =>
                            prev
                              ? { ...prev, module_states: computedNewStates }
                              : prev,
                          );

                          // Now check for COURSE completion
                          const allComplete = modules.every((m) =>
                            m.id === activeModule.id
                              ? passed || currentState.completed
                              : computedNewStates[m.id]?.completed,
                          );

                          // If Passed AND All Complete -> Trigger Celebration
                          if (passed && allComplete) {
                            handleCourseCompletion(computedNewStates);
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Footer Navigation - Hide for Quizzes (handled internally) or incomplete Videos */}
                  {!(
                    (activeModule.content_type === "video" &&
                      !isModuleCompleted(activeModule.id) &&
                      !videoCompleted) ||
                    activeModule.content_type === "quiz"
                  ) && (
                    <div className="border-t border-slate-200 bg-white p-6 md:px-10 py-6 shrink-0 animate-in slide-in-from-bottom-5 fade-in duration-500">
                      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                        <Button
                          variant="outline"
                          className="w-full md:w-auto text-slate-600 border-slate-300 hover:bg-slate-50"
                          disabled={currentModuleIndex === 0}
                          onClick={() =>
                            currentModuleIndex > 0 &&
                            handleModuleSelect(modules[currentModuleIndex - 1])
                          }
                        >
                          <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                          Module
                        </Button>
                        <Button
                          size="lg"
                          className={`w-full md:w-auto ${isModuleCompleted(activeModule.id) ? "bg-slate-900 hover:bg-slate-800 text-white" : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20"}`}
                          disabled={
                            currentModuleIndex === modules.length - 1 &&
                            isCourseFullyComplete // Disable if already done and certified? No let them download again
                          }
                          onClick={async () => {
                            if (!isModuleCompleted(activeModule.id))
                              await markModuleComplete(activeModule.id);

                            // Navigation Logic
                            if (currentModuleIndex < modules.length - 1) {
                              handleModuleSelect(
                                modules[currentModuleIndex + 1],
                              );
                            } else {
                              // FINISH COURSE PRESSED!
                              const newStates = await markModuleComplete(
                                activeModule.id,
                              );
                              handleCourseCompletion(newStates);
                            }
                          }}
                        >
                          {currentModuleIndex === modules.length - 1
                            ? isCourseFullyComplete
                              ? "Download Certificate"
                              : "Finish Course"
                            : isModuleCompleted(activeModule.id)
                              ? "Next Module"
                              : "Mark as Complete & Next"}
                          {currentModuleIndex !== modules.length - 1 ? (
                            <ChevronRight className="ml-2 h-4 w-4" />
                          ) : (
                            !isCourseFullyComplete && (
                              <Trophy className="ml-2 h-4 w-4" />
                            )
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
