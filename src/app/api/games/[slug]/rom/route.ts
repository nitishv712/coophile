import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { openRom } from '@/src/lib/games/repository';
import { dbErrorResponse } from '@/src/lib/db/errors';
import { withUser } from '@/src/lib/auth/firebaseAdmin';

/**
 * Stream a ROM out of GridFS.
 *
 * The SHA-256 travels in a header so the client can verify what it received
 * without hashing the whole file again, and so both peers can compare.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // The ROM bytes are the thing actually worth protecting — an unauthenticated
  // download endpoint would make the whole library public regardless of the gate.
  return withUser(async () => {
    try {
      const rom = await openRom(slug);
      if (!rom) {
        return Response.json({ error: 'No ROM attached to this game.' }, { status: 404 });
      }

      const body = Readable.toWeb(rom.stream) as WebReadableStream<Uint8Array>;

      return new Response(body as unknown as BodyInit, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(rom.size),
          'content-disposition': `inline; filename="${encodeURIComponent(rom.fileName)}"`,
          'x-rom-sha256': rom.sha256,
          // Immutable: a different upload lands under a new sha, and the game
          // record changes with it.
          'cache-control': 'private, max-age=3600',
        },
      });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}
