import { cookies } from 'next/headers';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_MS,
  createSessionCookie,
  currentUser,
  isAuthConfigured,
} from '@/src/lib/auth/firebaseAdmin';

/** Who the caller is, so the client can render without a second round trip. */
export async function GET() {
  return Response.json({
    configured: isAuthConfigured(),
    user: await currentUser(),
  });
}

/** Exchange a Firebase ID token for an httpOnly session cookie. */
export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return Response.json(
      { error: 'Sign-in is not configured: set FIREBASE_SERVICE_ACCOUNT on the server.' },
      { status: 503 },
    );
  }

  let idToken = '';
  try {
    const body = (await request.json()) as { idToken?: unknown };
    idToken = typeof body.idToken === 'string' ? body.idToken : '';
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  if (!idToken) {
    return Response.json({ error: 'idToken is required.' }, { status: 400 });
  }

  try {
    const session = await createSessionCookie(idToken);

    // Secure only when the connection actually is. Keying this off NODE_ENV
    // instead silently breaks LAN use: browsers drop Secure cookies on
    // insecure origins (localhost excepted), so sign-in would appear to
    // succeed while the cookie never stuck.
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const isSecure =
      (forwardedProto ?? new URL(request.url).protocol.replace(':', '')) === 'https';

    const store = await cookies();
    store.set(SESSION_COOKIE, session, {
      httpOnly: true,
      // 'lax' rather than 'strict': an invite link arriving from a chat app is
      // a cross-site navigation, and 'strict' would withhold the cookie on
      // that first request and bounce the guest back to signing in.
      sameSite: 'lax',
      secure: isSecure,
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });

    return Response.json({ user: await currentUser() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[auth/session]', message);
    return Response.json({ error: 'That sign-in could not be verified.' }, { status: 401 });
  }
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ signedOut: true });
}
