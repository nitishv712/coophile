import { cookies } from 'next/headers';
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';

/**
 * Server-side Firebase, for verifying who a request actually is.
 *
 * The client can claim anything; only the Admin SDK — holding the service
 * account key — can confirm a token really came from Firebase and has not
 * expired. Every protected route goes through `currentUser()` here.
 */

export const SESSION_COOKIE = 'coophile_session';

/** Twelve hours, matching how long a session cookie is minted for. */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Service account, supplied as inline JSON or base64-encoded JSON. Kept out of
 * `NEXT_PUBLIC_*` deliberately: this key can mint credentials for any user in
 * the project, so it must never reach the browser bundle.
 */
function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept raw JSON or base64, since shell-quoting JSON in an env file is
    // a common place to lose a newline in the private key.
    const text = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let app: App | null = null;

function adminApp(): App | null {
  if (app) return app;
  if (getApps().length) {
    app = getApp();
    return app;
  }

  const account = serviceAccount();
  if (!account) return null;

  app = initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      // Env files usually carry the key with escaped newlines.
      privateKey: account.private_key?.replace(/\\n/g, '\n'),
    }),
  });
  return app;
}

export function isAuthConfigured(): boolean {
  return serviceAccount() !== null;
}

export interface SessionUser {
  uid: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

/**
 * Admins are named by email rather than by a shared password.
 *
 * The previous scheme was a single `ADMIN_TOKEN` that everyone shared: it could
 * not say who did anything, and rotating it locked out every admin at once.
 * An allowlist keyed on verified Google identity fixes both.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = adminEmails();
  // An empty allowlist grants nobody admin — failing closed is the only safe
  // default when the deployment forgot to configure it.
  return allow.includes(email.toLowerCase());
}

function toSessionUser(decoded: DecodedIdToken): SessionUser {
  const email = (decoded.email as string | undefined) ?? null;
  return {
    uid: decoded.uid,
    email,
    name: (decoded.name as string | undefined) ?? null,
    picture: (decoded.picture as string | undefined) ?? null,
    // Google verifies the address; an unverified one must not grant admin.
    isAdmin: decoded.email_verified === true && isAdminEmail(email),
  };
}

/** Mint a session cookie value from a freshly-issued ID token. */
export async function createSessionCookie(idToken: string): Promise<string> {
  const instance = adminApp();
  if (!instance) throw new Error('Firebase Admin is not configured on the server.');
  return getAuth(instance).createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
}

/**
 * Sessions whose revocation status has been confirmed recently.
 *
 * Verifying a cookie's signature is local and fast, but asking whether it has
 * been revoked is a round-trip to Google — measured at ~400ms from here, paid
 * on *every* request, which dwarfed everything else the app does. Checking it
 * on an interval instead keeps that cost off the hot path.
 *
 * The trade is bounded: revoking a session or disabling an account takes up to
 * REVOCATION_INTERVAL_MS to be noticed on ordinary routes, and is still checked
 * immediately on anything that requires admin.
 */
const revocationChecked = new Map<string, number>();
const REVOCATION_INTERVAL_MS = 5 * 60 * 1000;
const REVOCATION_CACHE_LIMIT = 500;

function needsRevocationCheck(session: string, now: number): boolean {
  const last = revocationChecked.get(session);
  return last === undefined || now - last > REVOCATION_INTERVAL_MS;
}

function markChecked(session: string, now: number): void {
  // Bounded so a long-lived server cannot accumulate entries forever; Map
  // iterates in insertion order, so this drops the oldest.
  if (revocationChecked.size >= REVOCATION_CACHE_LIMIT) {
    const oldest = revocationChecked.keys().next().value;
    if (oldest !== undefined) revocationChecked.delete(oldest);
  }
  revocationChecked.set(session, now);
}

/**
 * Who is making this request, or null if the session is absent or invalid.
 *
 * `force` skips the interval and always confirms with Google — used for admin
 * routes, where a revoked session must not linger.
 */
export async function currentUser(force = false): Promise<SessionUser | null> {
  const instance = adminApp();
  if (!instance) return null;

  const store = await cookies();
  const session = store.get(SESSION_COOKIE)?.value;
  if (!session) return null;

  const now = Date.now();
  const checkRevoked = force || needsRevocationCheck(session, now);

  try {
    // Either way the signature and expiry are verified locally against Google's
    // cached public keys — an expired or forged cookie is rejected here without
    // any network call.
    const decoded = await getAuth(instance).verifySessionCookie(session, checkRevoked);
    if (checkRevoked) markChecked(session, now);
    return toSessionUser(decoded);
  } catch {
    revocationChecked.delete(session);
    return null;
  }
}

/** 401 unless signed in; hands the verified user to the handler. */
export async function withUser(
  handler: (user: SessionUser) => Promise<Response>,
  force = false,
): Promise<Response> {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: 'Sign-in is not configured on this server.' },
      { status: 503 },
    );
  }
  const user = await currentUser(force);
  if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401 });
  return handler(user);
}

/**
 * 401/403 unless signed in *and* on the admin allowlist.
 *
 * Admin requests are rare and consequential, so this always re-confirms with
 * Google that the session has not been revoked rather than trusting the
 * interval that ordinary requests use.
 */
export async function withAdminUser(
  handler: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  return withUser(async (user) => {
    if (!user.isAdmin) {
      return Response.json(
        { error: 'That account is not an admin on this server.' },
        { status: 403 },
      );
    }
    return handler(user);
  }, true);
}
