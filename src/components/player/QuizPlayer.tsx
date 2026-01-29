import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Lock,
  Clock,
  HelpCircle,
  Trophy,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface QuizPlayerProps {
  module: any;
  onComplete: (score: number, passed: boolean) => void;
  previousAttempts?: number;
  initialScore?: number;
  initialPassed?: boolean;
  isCourseCompleted?: boolean;
  lastAttemptDate?: string;
}

type QuizState = "intro" | "playing" | "result";

export default function QuizPlayer({
  module,
  onComplete,
  previousAttempts = 0,
  initialScore,
  initialPassed,
  isCourseCompleted = false,
  lastAttemptDate,
}: QuizPlayerProps) {
  const topRef = useRef<HTMLDivElement>(null);

  const questions = module.content_data?.questions || [];
  const settings = module.settings || {};
  const passPercentage = settings.pass_percentage ?? 90;
  const maxAttempts = settings.max_attempts; // null or undefined means infinite
  const retakeCooldown = settings.retake_cooldown_hours || 0;

  // Global State
  const [gameState, setGameState] = useState<QuizState>(
    isCourseCompleted || (initialPassed && isCourseCompleted)
      ? "result"
      : "intro",
  );

  // Auto-scroll to top when showing results
  useEffect(() => {
    if (gameState === "result" && topRef.current) {
      topRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [gameState]);

  // Quiz State
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(initialScore || 0);
  const [passed, setPassed] = useState(initialPassed || false);

  // Cooldown Logic
  const lastAttemptTime = lastAttemptDate
    ? new Date(lastAttemptDate).getTime()
    : 0;
  // Calculate when the cooldown EXPIRES
  const cooldownExpiresAt = lastAttemptTime + retakeCooldown * 60 * 60 * 1000;
  const now = Date.now();
  const isCoolingDown = retakeCooldown > 0 && now < cooldownExpiresAt;

  // Checks if user is locked out
  // NOTE: If maxAttempts reached, we also check if we are currently in a cooldown period.
  // If we have a cooldown setting, and the cooldown has EXPIRED, we allow entry (effectively +1 attempt).
  // If no cooldown setting, maxAttempts is a hard lock.
  const attemptsExhausted = maxAttempts && previousAttempts >= maxAttempts;
  const isLocked =
    !passed && attemptsExhausted && (retakeCooldown > 0 ? isCoolingDown : true);

  const handleStart = () => {
    setGameState("playing");
  };

  const handleSelect = (qIndex: number, optionIndex: number) => {
    if (gameState !== "playing") return;
    setAnswers({ ...answers, [qIndex]: optionIndex });
  };

  const handleSubmit = () => {
    let correctCount = 0;
    questions.forEach((q: any, i: number) => {
      if (answers[i] === q.correctIndex) {
        correctCount++;
      }
    });

    const finalScore = Math.round((correctCount / questions.length) * 100);
    const isPassed = finalScore >= passPercentage;

    setScore(finalScore);
    setPassed(isPassed);
    setGameState("result");
    onComplete(finalScore, isPassed);
  };

  const handleRetake = () => {
    setAnswers({});
    setScore(0);
    setPassed(false);
    setGameState("intro"); // Go back to intro first
  };

  const DonutChart = ({
    value,
    size = 120,
    color = "text-indigo-600",
  }: any) => {
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
      <div className="relative flex items-center justify-center">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90 transition-all duration-1000"
        >
          {/* Background Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-slate-100"
          />
          {/* Progress Circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{value}%</span>
        </div>
      </div>
    );
  };

  if (isLocked && gameState !== "result") {
    const unlockDate = new Date(cooldownExpiresAt);
    const unlockTimeString = unlockDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const unlockDateString = unlockDate.toLocaleDateString();

    return (
      <Card className="max-w-3xl mx-auto p-12 text-center space-y-6 border-2 border-red-50 bg-red-50/10">
        <div className="flex justify-center">
          <div className="bg-red-100 p-4 rounded-full">
            <Lock className="h-12 w-12 text-red-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-800">
            Assessment Locked
          </h2>
          <p className="text-slate-600 max-w-lg mx-auto leading-relaxed">
            You have reached the maximum number of attempts ({maxAttempts}) for
            this assessment.
          </p>
          {retakeCooldown > 0 && isCoolingDown && (
            <div className="pt-4">
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-2">
                Next attempt available at
              </p>
              <div className="inline-flex items-center gap-2 text-lg font-bold text-slate-900 bg-white px-6 py-3 rounded-xl border-2 border-indigo-100 shadow-sm">
                <Clock className="h-5 w-5 text-indigo-500" />
                {unlockDateString === new Date().toLocaleDateString()
                  ? "Today"
                  : unlockDateString}{" "}
                at {unlockTimeString}
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                                 INTRO VIEW                                 */
  /* -------------------------------------------------------------------------- */
  if (gameState === "intro") {
    return (
      <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-500">
        <Card className="overflow-hidden border-2 shadow-sm">
          {/* Header Banner */}
          <div className="bg-slate-900 p-8 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 transition-transform group-hover:scale-110 duration-1000"></div>
            <div className="relative z-10 space-y-4">
              <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-indigo-200">
                <Trophy className="h-3 w-3" /> Assessment
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {module.title}
              </h1>
              <p className="text-slate-300 max-w-2xl text-lg font-light leading-relaxed">
                Complete this assessment to test your knowledge. Review the
                rules below before starting.
              </p>
            </div>
          </div>

          <div className="p-8 space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Pass Score
                </p>
                <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  {passPercentage}%
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Questions
                </p>
                <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <HelpCircle className="h-5 w-5 text-blue-500" />
                  {questions.length}
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Attempts
                </p>
                <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-orange-500" />
                  {maxAttempts ? `${previousAttempts} / ${maxAttempts}` : "∞"}
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  Cooldown
                </p>
                <div className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-500" />
                  {retakeCooldown ? `${retakeCooldown}h` : "None"}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                size="lg"
                onClick={handleStart}
                className="w-full md:w-auto text-lg px-8 py-6 h-auto shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all hover:scale-105"
              >
                Start Assessment <PlayCircle className="h-5 w-5 ml-2" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                                PLAYING VIEW                                */
  /* -------------------------------------------------------------------------- */
  if (gameState === "playing") {
    const progress = (Object.keys(answers).length / questions.length) * 100;

    return (
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
        <div className="flex items-center justify-between bg-white p-4 rounded-lg border shadow-sm sticky top-4 z-10 opacity-95 backdrop-blur-sm">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Assessment Progress
            </h2>
            <p className="text-xs text-slate-500">
              {Object.keys(answers).length} of {questions.length} Answered
            </p>
          </div>
          <div className="w-1/3">
            <Progress value={progress} className="h-2" />
          </div>
        </div>

        <div className="space-y-8 pb-12">
          {questions.map((q: any, i: number) => (
            <Card key={i} className="overflow-hidden border-2 shadow-sm">
              <div className="p-6 bg-slate-50 border-b">
                <div className="flex gap-4">
                  <span className="flex-none bg-indigo-600 text-white font-bold h-8 w-8 rounded-lg flex items-center justify-center text-sm">
                    {i + 1}
                  </span>
                  <p className="font-semibold text-lg text-slate-900 leading-relaxed pt-0.5">
                    {q.question}
                  </p>
                </div>
              </div>
              <div className="p-6">
                <div className="grid gap-3">
                  {(q.options || []).map((opt: string, optIdx: number) => {
                    const isSelected = answers[i] === optIdx;
                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleSelect(i, optIdx)}
                        className={cn(
                          "relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group",
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/50 shadow-sm"
                            : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50",
                        )}
                      >
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 mr-4 flex items-center justify-center transition-colors",
                            isSelected
                              ? "border-indigo-600"
                              : "border-slate-300 group-hover:border-indigo-400",
                          )}
                        >
                          {isSelected && (
                            <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "font-medium transition-colors",
                            isSelected ? "text-indigo-900" : "text-slate-700",
                          )}
                        >
                          {opt}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-4 z-10 flex justify-center">
          <Card className="px-2 py-2 shadow-xl border-2 border-indigo-100 bg-white/90 backdrop-blur-md rounded-2xl">
            <Button
              size="lg"
              onClick={handleSubmit}
              disabled={Object.keys(answers).length < questions.length}
              className="px-12 rounded-xl text-lg h-14 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all hover:-translate-y-1"
            >
              Submit Assessment ({Object.keys(answers).length}/
              {questions.length})
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------------- */
  /*                                 RESULT VIEW                                */
  /* -------------------------------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
      {/* Result Card */}
      <Card
        className={cn(
          "overflow-hidden border-2 shadow-lg",
          passed ? "border-green-100" : "border-red-100",
        )}
      >
        <div
          className={cn(
            "p-8 text-center",
            passed ? "bg-green-50/50" : "bg-red-50/50",
          )}
        >
          <div className="mb-6 inline-flex p-4 bg-white rounded-full shadow-sm">
            {passed ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="h-16 w-16 text-red-500" />
            )}
          </div>
          <h2 className="text-3xl font-bold mb-2">
            {passed ? "Assessment Passed!" : "Assessment Failed"}
          </h2>
          <p className="text-slate-600 max-w-md mx-auto mb-8">
            {passed
              ? "Congratulations! You have successfully demonstrated your understanding of this module."
              : "Review the material and try again. Practice makes perfect."}
          </p>

          <div className="flex justify-center gap-8 mb-8">
            <div className="flex flex-col items-center">
              <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-2">
                Your Score
              </p>
              <DonutChart
                value={score}
                color={passed ? "text-green-600" : "text-red-600"}
              />
            </div>
            <div className="w-px bg-slate-200 self-stretch my-4" />
            <div className="flex flex-col items-center justify-center">
              <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-2">
                Required
              </p>
              <div className="h-[120px] w-[120px] flex items-center justify-center rounded-full border-4 border-slate-200 bg-white">
                <span className="text-3xl font-bold text-slate-400">
                  {passPercentage}%
                </span>
              </div>
            </div>
          </div>

          {!passed &&
            (!maxAttempts || previousAttempts < maxAttempts) &&
            !isCourseCompleted && (
              <Button
                onClick={handleRetake}
                size="lg"
                className="bg-white text-slate-900 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 mb-4"
              >
                <RefreshCw className="h-4 w-4 mr-2" /> Try Again
              </Button>
            )}

          {isCourseCompleted && (
            <div className="mt-4 p-4 bg-slate-100 rounded-lg text-slate-600 text-sm">
              This assessment is closed because the course is completed.
            </div>
          )}
        </div>
      </Card>

      {/* Review Section */}
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-px bg-slate-200 flex-1" />
          <h3 className="text-sm uppercase tracking-widest font-bold text-slate-400">
            Review Answers
          </h3>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {questions.map((q: any, i: number) => {
          const userAnswer = answers[i];
          const isCorrect = userAnswer === q.correctIndex;

          return (
            <Card
              key={i}
              className={cn(
                "overflow-hidden border-2 transition-all",
                isCorrect
                  ? "border-green-100 bg-white"
                  : "border-red-100 bg-white",
              )}
            >
              <div className="p-6">
                <div className="flex gap-4">
                  <div className="flex-none pt-1">
                    {isCorrect ? (
                      <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="h-4 w-4 text-red-600" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 w-full">
                    <p className="font-semibold text-lg text-slate-900">
                      {q.question}
                    </p>

                    <div className="space-y-2">
                      {q.options.map((opt: string, optIdx: number) => {
                        const isSelected = userAnswer === optIdx;
                        const isCorrectOption = q.correctIndex === optIdx;

                        // Logic: If passed or locked, show mostly everything.
                        // If failed and can retake, HIDE correct answer.
                        const showCorrect = passed || isLocked;

                        let stateStyle = "border-slate-100 text-slate-600";
                        let icon = null;

                        if (isCorrectOption) {
                          if (showCorrect) {
                            stateStyle =
                              "border-green-200 bg-green-50 text-green-800 font-medium";
                            icon = (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            );
                          } else {
                            // If hidden, just show neutral (unless it was selected, which is handled below)
                            // Actually, if isCorrectOption is TRUE, but user NOT selected it, and we want to hide it...
                            // just leave it default.
                          }
                        }

                        if (isSelected) {
                          if (isCorrectOption) {
                            // User got it right. Always show green.
                            stateStyle =
                              "border-green-200 bg-green-50 text-green-800 font-medium";
                            icon = (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            );
                          } else {
                            // User got it wrong. Always show red.
                            stateStyle =
                              "border-red-200 bg-red-50 text-red-800 font-medium";
                            icon = <XCircle className="h-4 w-4 text-red-600" />;
                          }
                        }

                        return (
                          <div
                            key={optIdx}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg border text-sm",
                              stateStyle,
                            )}
                          >
                            <span>{opt}</span>
                            {icon}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (passed || isLocked) && (
                      <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                        <p className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                          <HelpCircle className="h-3 w-3 text-indigo-500" />{" "}
                          Explanation
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                          {q.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
