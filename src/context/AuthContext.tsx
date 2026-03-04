import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Database } from "@/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  hasAccess: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signInWithSSO: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and subscribe to auth changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error("Unexpected error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    // For now, simpler email login or magic link could be used.
    // Since strict auth requirements weren't specified, we'll use a placeholder or assume existing auth flow.
    // Ideally user enters email.
    // For this context, we return the auth method.
    // IMPORTANT: Implementing a basic login for demo purposes if needed,
    // but usually this is handled by a dedicated Login page.
  };

  const signInWithSSO = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          // In a standard React SPA like Vite, we redirect back to origin
          // and the Supabase client automatically parses the token on redirect.
          redirectTo: window.location.origin,
          scopes: "email profile openid",
        },
      });

      if (error) {
        return { error: error.message };
      }

      return { error: null };
    } catch (err) {
      return {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred during Microsoft sign-in.",
      };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  };

  const value = {
    user,
    profile,
    session,
    loading,
    isAdmin: profile?.role === "admin",
    hasAccess: profile?.mylearning_access === true,
    signIn,
    signOut,
    signInWithSSO,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
