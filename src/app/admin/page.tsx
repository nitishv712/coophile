import SiteNav from "@/src/components/SiteNav";
import SiteFooter from "@/src/components/SiteFooter";
import AdminClient from "@/src/components/AdminClient";
import SignOutButton from "@/src/components/SignOutButton";
import type { Game } from "@/src/lib/games/types";
import { listGames } from "@/src/lib/games/repository";
import { dbErrorMessage } from "@/src/lib/db/errors";
import { requestAuth } from "@/src/lib/auth/session";
import { signInGate } from "@/src/components/SignInGate";

/**
 * The admin panel.
 *
 * The allowlist is checked here, on the server, with a forced revocation check
 * — a session cancelled a minute ago must not still open this page. Somebody
 * who is not an admin never receives the catalog at all.
 */
export default async function AdminPage() {
  const gate = await signInGate();
  if (gate) return gate;

  const { user } = await requestAuth(true);

  // The gate above guarantees a signed-in Google account, so the only
  // remaining question is the allowlist. Show who is actually signed
  // in — "access denied" while logged into the wrong Google account is a
  // genuinely confusing state otherwise.
  if (!user?.isAdmin) {
    return (
      <>
        <SiteNav />
        <div className="flex-grow flex flex-col items-center justify-center text-center px-6">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/40 mb-6">
            lock
          </span>
          <h1 className="font-headline text-3xl font-bold mb-3">Admins only</h1>
          <p className="font-body text-on-surface-variant max-w-md leading-relaxed mb-2">
            You are signed in as{" "}
            <span className="font-mono text-on-surface">
              {user?.email ?? "an unknown account"}
            </span>
            , which is not on the admin allowlist.
          </p>
          <p className="font-body text-sm text-on-surface-variant/70 max-w-md leading-relaxed mb-8">
            Add the address to <code className="font-mono text-primary">ADMIN_EMAILS</code> in
            the environment and restart, or sign in with an account that is already listed.
          </p>
          <SignOutButton
            id="btn-admin-switch-account"
            className="btn-secondary text-sm px-6 py-3"
          >
            Sign in with a different account
          </SignOutButton>
        </div>
      </>
    );
  }

  let games: Game[] = [];
  let error: string | null = null;
  try {
    games = await listGames();
  } catch (cause) {
    error = dbErrorMessage(cause);
  }

  return (
    <>
      <SiteNav />
      <AdminClient initialGames={games} initialError={error} />
      <SiteFooter />
    </>
  );
}
