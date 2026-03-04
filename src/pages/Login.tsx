import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

const MicrosoftLogo = () => (
  <svg className="h-4 w-4 mr-2" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const { signInWithSSO } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Forgot Password State
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      navigate("/");
    } catch (error: any) {
      setMessage(error.message || "An error occurred during sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSSOLogin = async () => {
    setMessage("");
    setSsoLoading(true);

    const { error } = await signInWithSSO();
    if (error) {
      setMessage(error);
      setSsoLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + "/reset-password", // Ensure this route exists or redirect to home logic handles tokens
      });

      if (error) throw error;
      setResetMessage("Check your email for the password reset link!");
    } catch (error: any) {
      setResetMessage(error.message || "Failed to send reset email.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Panel - Branding & Messaging (Hidden on mobile) */}
      <div className="hidden w-1/2 flex-col justify-between bg-zinc-900 p-12 text-white lg:flex relative">
        <div className="absolute inset-0 bg-primary/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/40 via-background/0 to-background/0" />

        <div className="relative z-10 flex items-center gap-3">
          {/* LOGO FIX: Removed brightness-0 invert to show original logo colors */}
          <img src="/SEQ-Formwork-Logo.svg" alt="SEQ Logo" className="h-8" />
          <span className="text-xl font-bold tracking-tight">MyLearning</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-white">
            Empowering your growth at SEQ Formwork.
          </h1>
          <p className="text-lg text-zinc-400">
            Access your training modules, track your progress, and certify your
            skills—all in one place.
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} SEQ Formwork. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex w-full flex-col justify-center px-8 lg:w-1/2 lg:px-12 xl:px-24 bg-background">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <div className="flex justify-center lg:hidden mb-4">
              <img
                src="/SEQ-Formwork-Logo.svg"
                alt="SEQ Logo"
                className="h-10"
              />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 border-input bg-background hover:bg-muted font-medium text-foreground transition-all duration-200"
              onClick={handleSSOLogin}
              disabled={ssoLoading || loading}
            >
              {ssoLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MicrosoftLogo />
              )}
              Continue with Microsoft
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-muted" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with email
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@seqformwork.com"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {/* Removed 'Forgot password?' link from here as requested */}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="pl-9 pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">Toggle password visibility</span>
                  </Button>
                </div>
              </div>
            </div>

            {message && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive flex items-center justify-center font-medium">
                {message}
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={loading || ssoLoading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            {/* Replaced 'Don't have an account?' with Forgot Password Modal Trigger */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="link"
                  className="px-0 font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>
                    Enter your email address and we'll send you a link to reset
                    your password.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="name@seqformwork.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                  {resetMessage && (
                    <p
                      className={`text-sm text-center ${resetMessage.includes("Check") ? "text-green-600" : "text-destructive"}`}
                    >
                      {resetMessage}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={resetLoading}
                  >
                    {resetLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending Link...
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
