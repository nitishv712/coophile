import { requestAuth } from "@/src/lib/auth/session";
import SignInCard from "./SignInCard";

/**
 * Server-side sign-in check for a protected page.
 *
 * Returns UI to render *instead of* the page, or null when the visitor may
 * pass. It is called at the top of each protected page rather than wrapping
 * them from a layout, and that placement is load-bearing: a layout that
 * declines to render `children` does not stop Next from rendering the page
 * segment anyway and serialising it into the flight payload, so a gate up
 * there would still query the database for a signed-out visitor and ship the
 * results to them. Returning early from the page itself is what actually
 * prevents the work.
 *
 * Deliberately a gate rendered *in place* rather than a redirect to a
 * /sign-in route. An invite link carries its room and game in the query
 * string, and redirecting away to sign in would drop them — the guest would
 * land on an empty lobby after authenticating. Rendering over the top leaves
 * the URL untouched, so the moment they sign in the page they were sent is
 * already there.
 */
export async function signInGate(): Promise<React.ReactNode | null> {
  const { user, configured } = await requestAuth();

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

  if (!user) return <SignInCard />;

  return null;
}
