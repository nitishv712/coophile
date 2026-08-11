"use client";

import { useAuth } from "./AuthProvider";
import Logo from "./Logo";

/**
 * Wraps the app so nothing renders until the visitor is signed in.
 *
 * Deliberately a gate rendered *in place* rather than a redirect to a
 * /sign-in route. An invite link carries its room and game in the query
 * string, and redirecting away to sign in would drop them — the guest would
 * land on an empty lobby after authenticating. Rendering over the top leaves
 * the URL untouched, so the moment they sign in the page they were sent is
 * already there.
 */
export default function SignInGate({ children }: { children: React.ReactNode }) {
  const { user, configured, loading, error, signIn } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  // Without server credentials nothing can sign in, and an opaque Firebase
  // error helps nobody — say exactly what is missing.
  if (!configured) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <span className="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-6">
          key_off
        </span>
        <h1 className="font-headline text-3xl font-bold mb-3">Sign-in is not configured</h1>
        <p className="font-body text-on-surface-variant max-w-lg leading-relaxed mb-4">
          This server has no Firebase credentials, so nobody can sign in. Set{" "}
          <code className="font-mono text-primary">FIREBASE_SERVICE_ACCOUNT</code> and the{" "}
          <code className="font-mono text-primary">NEXT_PUBLIC_FIREBASE_*</code> values, then
          restart.
        </p>
        <p className="font-body text-sm text-on-surface-variant/70 max-w-lg">
          See <code className="font-mono">.env.example</code> for the full list.
        </p>
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="card p-8 w-full max-w-sm text-center">
        <Logo size={56} className="mx-auto mb-6 text-primary" title="Coophile" />
        <h1 className="font-headline text-2xl font-bold mb-2">Sign in to Coophile</h1>
        <p className="font-body text-sm text-on-surface-variant mb-6 leading-relaxed">
          Play retro games with friends. Signing in keeps your controls and your
          rooms tied to you.
        </p>

        {error && (
          <p
            id="signin-error"
            className="font-body text-sm text-on-error-container bg-error-container rounded-lg px-3 py-2 mb-4 text-left"
          >
            {error}
          </p>
        )}

        <button
          id="btn-google-signin"
          onClick={signIn}
          className="btn-secondary w-full min-h-12 inline-flex items-center justify-center gap-3 text-sm"
        >
          {/* Google's mark, drawn inline so it needs no external request. */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="font-body text-xs text-on-surface-variant/70 mt-6 leading-relaxed">
          Emulator software is lawful; distributing copyrighted ROMs is not.
          Whoever runs this server is responsible for its library.
        </p>
      </div>
    </div>
  );
}
