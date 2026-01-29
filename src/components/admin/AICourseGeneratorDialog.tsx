import { useState } from "react";
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
import { Sparkles, Loader2, Video } from "lucide-react";

interface AICourseGeneratorDialogProps {
  onGenerate: (data: CourseGenerationParams) => Promise<void>;
  isGenerating?: boolean;
}

export interface CourseGenerationParams {
  topic: string;
  moduleCount: number;
  includeQuiz: boolean;
  includeVideo: boolean;
  videoUrl?: string;
  additionalContext?: string;
}

export function AICourseGeneratorDialog({
  onGenerate,
  isGenerating = false,
}: AICourseGeneratorDialogProps) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [moduleCount, setModuleCount] = useState([5]);
  const [includeQuiz, setIncludeQuiz] = useState(true);
  const [includeVideo, setIncludeVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const handleGenerate = async () => {
    if (!topic) return;

    await onGenerate({
      topic,
      moduleCount: moduleCount[0],
      includeQuiz,
      includeVideo,
      videoUrl: includeVideo ? videoUrl : undefined,
      additionalContext,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg border-0">
          <Sparkles className="mr-2 h-4 w-4" />
          Create with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col p-6 rounded-xl shadow-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-indigo-600">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Generate Course with AI
          </DialogTitle>
          <DialogDescription className="text-base">
            Describe your course topic and let AI structure the content,
            quizzes, and narrative flow for you.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4 overflow-y-auto px-1 pr-2">
          <div className="grid gap-2">
            <Label htmlFor="topic" className="text-base font-medium">
              Course Topic
            </Label>
            <Input
              id="topic"
              placeholder="e.g. Introduction to React Patterns"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-10 border-gray-200 focus:border-purple-500 transition-colors"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="context" className="text-base font-medium">
              Additional Context (Optional)
            </Label>
            <Textarea
              id="context"
              placeholder="Any specific focus? Target audience? Story narrative style?"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              className="h-20 min-h-[80px] resize-none border-gray-200 focus:border-purple-500 transition-colors"
            />
          </div>

          <div className="grid gap-4 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
            <div className="flex items-center justify-between">
              <Label className="font-medium">
                Number of Modules: {moduleCount[0]}
              </Label>
            </div>
            <Slider
              value={moduleCount}
              onValueChange={setModuleCount}
              max={10}
              min={3}
              step={1}
              className="py-2 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-muted-foreground w-full px-1">
              <span>3 modules</span>
              <span>10 modules</span>
            </div>
          </div>

          <div className="flex items-center justify-between border p-4 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="space-y-0.5">
              <Label
                className="text-base font-medium cursor-pointer"
                htmlFor="quiz-switch"
              >
                Include Quiz
              </Label>
              <div className="text-xs text-muted-foreground">
                Generate a final assessment module
              </div>
            </div>
            <Switch
              id="quiz-switch"
              checked={includeQuiz}
              onCheckedChange={setIncludeQuiz}
              className="data-[state=checked]:bg-purple-600"
            />
          </div>

          <div className="space-y-3 border p-4 rounded-xl hover:bg-gray-50 transition-all duration-200">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label
                  className="text-base font-medium flex items-center gap-2 cursor-pointer"
                  htmlFor="video-switch"
                >
                  <Video className="h-4 w-4 text-purple-600" />
                  Include Video
                </Label>
                <div className="text-xs text-muted-foreground">
                  Embed a video resource
                </div>
              </div>
              <Switch
                id="video-switch"
                checked={includeVideo}
                onCheckedChange={setIncludeVideo}
                className="data-[state=checked]:bg-purple-600"
              />
            </div>

            {includeVideo && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                <Input
                  placeholder="Paste YouTube or Video URL"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className="bg-white"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!topic || isGenerating}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Course
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
