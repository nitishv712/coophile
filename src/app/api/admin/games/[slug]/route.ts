import { withAdminUser } from '@/src/lib/auth/firebaseAdmin';
import { deleteGame, updateGame, SlugTakenError } from '@/src/lib/games/repository';
import { validateGameInput } from '@/src/lib/games/types';
import { dbErrorResponse } from '@/src/lib/db/errors';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return withAdminUser(async () => {
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
      const game = await updateGame(slug, parsed.value!);
      if (!game) return Response.json({ error: 'No such game.' }, { status: 404 });
      return Response.json({ game });
    } catch (error) {
      if (error instanceof SlugTakenError) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      return dbErrorResponse(error);
    }
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return withAdminUser(async () => {
    try {
      const removed = await deleteGame(slug);
      if (!removed) return Response.json({ error: 'No such game.' }, { status: 404 });
      return Response.json({ deleted: slug });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}
