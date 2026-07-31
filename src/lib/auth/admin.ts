import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Single-operator admin auth.
 *
 * One shared token in `ADMIN_TOKEN`, exchanged for an httpOnly session cookie.
 * The cookie holds an HMAC of the token rather than the token itself, so a
 * leaked cookie cannot be replayed as the token elsewhere.
 */

export const ADMIN_COOKIE = 'coophile_admin';
const SESSION_LABEL = 'coophile-admin-v1';

/** Dev convenience only — production with no token configured stays locked. */
const DEV_FALLBACK_TOKEN = 'dev';

export function adminToken(): string | null {
  const configured = process.env.ADMIN_TOKEN?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return DEV_FALLBACK_TOKEN;
  return null;
}

/** False in production when ADMIN_TOKEN is unset — admin is then disabled. */
export function adminEnabled(): boolean {
  return adminToken() !== null;
}

export function sessionValue(token: string): string {
  return createHmac('sha256', token).update(SESSION_LABEL).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function tokenMatches(candidate: string): boolean {
  const expected = adminToken();
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export function sessionMatches(cookieValue: string | undefined): boolean {
  const expected = adminToken();
  if (!expected || !cookieValue) return false;
  return safeEqual(cookieValue, sessionValue(expected));
}

/** Read the session cookie in a Server Component or Route Handler. */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return sessionMatches(store.get(ADMIN_COOKIE)?.value);
}

/** Standard 401/503 responses so every admin route rejects identically. */
export function adminDenied(): Response {
  if (!adminEnabled()) {
    return Response.json(
      {
        error:
          'Admin is disabled: set ADMIN_TOKEN in the environment to enable it.',
      },
      { status: 503 },
    );
  }
  return Response.json({ error: 'Not signed in.' }, { status: 401 });
}

/** Wrap an admin-only handler; returns 401/503 unless the session is valid. */
export async function withAdmin(
  handler: () => Promise<Response>,
): Promise<Response> {
  if (!(await isAdminRequest())) return adminDenied();
  return handler();
}
