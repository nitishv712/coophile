import { withAdmin } from '@/src/lib/auth/admin';
import { attachRom, detachRom, RomRejectedError } from '@/src/lib/games/repository';
import { dbErrorResponse } from '@/src/lib/db/errors';

/**
 * Attach a ROM to a game.
 *
 * Only reachable by a signed-in admin, and only for a game whose rights record
 * is already on file — provenance is captured when the game is created, not
 * bolted on afterwards.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return withAdmin(async () => {
    let file: File | null = null;
    try {
      const form = await request.formData();
      const candidate = form.get('rom');
      if (candidate instanceof File) file = candidate;
    } catch {
      return Response.json({ error: 'Expected multipart form data.' }, { status: 400 });
    }

    if (!file) {
      return Response.json({ error: 'No file supplied under "rom".' }, { status: 400 });
    }

    try {
      const data = Buffer.from(await file.arrayBuffer());
      const game = await attachRom(slug, file.name, data);
      if (!game) return Response.json({ error: 'No such game.' }, { status: 404 });
      return Response.json({ game });
    } catch (error) {
      if (error instanceof RomRejectedError) {
        return Response.json({ error: error.message }, { status: 400 });
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

  return withAdmin(async () => {
    try {
      const game = await detachRom(slug);
      if (!game) return Response.json({ error: 'No such game.' }, { status: 404 });
      return Response.json({ game });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}
