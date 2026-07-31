import { withAdmin } from '@/src/lib/auth/admin';
import { createGame, listGames, SlugTakenError } from '@/src/lib/games/repository';
import { validateGameInput } from '@/src/lib/games/types';
import { dbErrorResponse } from '@/src/lib/db/errors';

/** Same data as the public route, but only for signed-in admins. */
export async function GET() {
  return withAdmin(async () => {
    try {
      return Response.json({ games: await listGames() });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}

export async function POST(request: Request) {
  return withAdmin(async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Expected JSON.' }, { status: 400 });
    }

    const parsed = validateGameInput(body);
    if (!parsed.ok) {
      return Response.json({ error: 'Invalid game.', details: parsed.errors }, { status: 400 });
    }

    try {
      return Response.json({ game: await createGame(parsed.value!) }, { status: 201 });
    } catch (error) {
      if (error instanceof SlugTakenError) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      return dbErrorResponse(error);
    }
  });
}
