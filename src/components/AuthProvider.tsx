"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";

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

/**
 * Client-side view of the session, seeded by the server.
 *
 * `user` arrives already resolved from the root layout, which read the httpOnly
 * session cookie during rendering. There is deliberately no fetch-on-mount and
 * no loading state: the first paint already knows who is signed in, so the nav
 * never flashes a login button at somebody who is not logged out.
 */
export default function AuthProvider({
  children,
  initialUser,
  configured,
}: {
  children: React.ReactNode;
  initialUser: SessionUser | null;
  configured: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [error, setError] = useState<string | null>(null);

  // Follow the server whenever it re-renders — a `router.refresh()` elsewhere,
  // or a session that expired between navigations, both arrive as a new
  // `initialUser` and must win over whatever this component last saw.
  // Adjusted during render rather than in an effect, so nothing ever paints
  // with an identity the server has already contradicted.
  const [lastFromServer, setLastFromServer] = useState<SessionUser | null>(initialUser);
  if (lastFromServer !== initialUser) {
    setLastFromServer(initialUser);
    setUser(initialUser);
  }

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
      // The session cookie is only now set, and every gate and page that read
      // it did so before it existed. Re-render the server tree so they see it.
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      // A closed popup is a normal thing to do, not an error worth shouting about.
      if (/popup-closed-by-user|cancelled-popup-request|popup_closed/i.test(message)) return;
      setError(message);
    }
  }, [router]);

  const signOut = useCallback(async () => {
    const { signOut: doSignOut } = await import("@/src/lib/auth/firebaseClient");
    await doSignOut();
    setUser(null);
    // Same reasoning in reverse: server-rendered pages are still showing
    // signed-in content until they are asked again without the cookie.
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, configured, error, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
