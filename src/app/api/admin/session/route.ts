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

  const store = await cookies();
  store.set(ADMIN_COOKIE, sessionValue(adminToken()!), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
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
