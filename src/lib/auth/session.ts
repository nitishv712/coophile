import { cache } from 'react';
import { currentUser, isAuthConfigured, type SessionUser } from './firebaseAdmin';

/**
 * Who the current request belongs to, resolved once per request.
 *
 * Server rendering asks this question from several places in one pass — the
 * root layout (to seed the nav), the route's gate, and the page itself — and
 * each `currentUser()` call re-verifies the session cookie. `cache()` collapses
 * them into a single verification for the lifetime of the request, without any
 * of the call sites having to thread the answer through props.
 *
 * `force` is part of the cache key, so an admin route asking for a confirmed
 * revocation check still gets one rather than a cheaper cached answer.
 */
export const requestAuth = cache(
  async (force = false): Promise<{ configured: boolean; user: SessionUser | null }> => ({
    configured: isAuthConfigured(),
    user: await currentUser(force),
  }),
);

export type { SessionUser };
