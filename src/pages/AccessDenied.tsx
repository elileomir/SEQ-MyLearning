import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="flex flex-col items-center space-y-6 text-center max-w-md animate-in fade-in zoom-in duration-500">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20 duration-1000" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Access Denied
          </h1>
          <p className="text-muted-foreground">
            You do not have permission to view this page. This area is
            restricted to administrators only.
          </p>
        </div>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Go Back
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="bg-red-600 hover:bg-red-700 text-white gap-2"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
