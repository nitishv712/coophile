"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

interface AuthValue {
  user: SessionUser | null;
  /** False when the server has no Firebase credentials — sign-in cannot work. */
  configured: boolean;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ask the server who we are. The httpOnly session cookie is the source of
  // truth — the client SDK's own cached token says nothing about whether our
  // API will accept the request.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: { configured?: boolean; user?: SessionUser | null }) => {
        if (cancelled) return;
        setConfigured(data.configured !== false);
        setUser(data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      // Imported lazily so the Firebase client bundle is only fetched when
      // somebody actually signs in.
      const { signInWithGoogle } = await import("@/src/lib/auth/firebaseClient");
      await signInWithGoogle();
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      setUser(data.user ?? null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // A closed popup is a normal thing to do, not an error worth shouting about.
      if (/popup-closed-by-user|cancelled-popup-request|popup_closed/i.test(message)) return;
      setError(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    const { signOut: doSignOut } = await import("@/src/lib/auth/firebaseClient");
    await doSignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, configured, loading, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
