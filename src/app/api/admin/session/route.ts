import { cookies } from 'next/headers';
import {
  ADMIN_COOKIE,
  adminEnabled,
  isAdminRequest,
  sessionValue,
  tokenMatches,
  adminToken,
} from '@/src/lib/auth/admin';

/** Whether the caller is currently signed in, and whether admin is even on. */
export async function GET() {
  return Response.json({
    enabled: adminEnabled(),
    signedIn: await isAdminRequest(),
  });
}

/** Exchange the shared token for an httpOnly session cookie. */
export async function POST(request: Request) {
  if (!adminEnabled()) {
    return Response.json(
      { error: 'Admin is disabled: set ADMIN_TOKEN in the environment.' },
      { status: 503 },
    );
  }

  let token = '';
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === 'string' ? body.token : '';
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  if (!tokenMatches(token)) {
    return Response.json({ error: 'That token is not correct.' }, { status: 401 });
  }

  // Mark the cookie Secure only when the connection actually is.
  //
  // Keying this off NODE_ENV instead silently breaks LAN use: a production
  // build served over plain http (http://192.168.1.33:3000) still sets
  // `Secure`, and browsers drop Secure cookies on insecure origins — localhost
  // being the one exception. Sign-in then returns 200 while the cookie never
  // sticks, so the panel renders but every later call 401s. Only downgrading
  // on connections that are already insecure costs nothing: `Secure` exists to
  // stop a cookie leaking onto plaintext, and this *is* the plaintext case.
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const isSecure = (forwardedProto ?? new URL(request.url).protocol.replace(':', '')) === 'https';

  const store = await cookies();
  store.set(ADMIN_COOKIE, sessionValue(adminToken()!), {
    httpOnly: true,
    sameSite: 'strict',
    secure: isSecure,
    path: '/',
    maxAge: 60 * 60 * 12,
  });

  return Response.json({ signedIn: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  return Response.json({ signedIn: false });
}
