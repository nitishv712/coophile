import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { getGame, openRom } from '@/src/lib/games/repository';
import { dbErrorResponse } from '@/src/lib/db/errors';
import { withUser } from '@/src/lib/auth/firebaseAdmin';

type Params = { params: Promise<{ slug: string }> };

/**
 * Headers shared by GET and HEAD, so the two never disagree about a ROM.
 *
 * The URL carries the ROM's SHA-256 as `?v=` (see `romUrl` on the client).
 * When it matches, the response is immutable: a re-uploaded ROM lands under a
 * new hash and therefore a new URL, so there is nothing to invalidate and the
 * browser may keep this copy for as long as it likes. Without a matching `v`
 * the client is told to revalidate each time, which the ETag turns into a
 * cheap 304 rather than a re-download.
 */
function romHeaders(
  rom: { fileName: string; size: number; sha256: string },
  request: Request,
): Record<string, string> {
  const wanted = new URL(request.url).searchParams.get('v');
  const immutable = wanted === rom.sha256;
  return {
    'content-type': 'application/octet-stream',
    'content-length': String(rom.size),
    'content-disposition': `inline; filename="${encodeURIComponent(rom.fileName)}"`,
    'x-rom-sha256': rom.sha256,
    etag: `"${rom.sha256}"`,
    'cache-control': immutable
      ? 'private, max-age=31536000, immutable'
      : 'private, no-cache',
  };
}

function notModified(request: Request, sha256: string): boolean {
  const tags = request.headers.get('if-none-match');
  return Boolean(tags) && tags!.split(',').some((tag) => tag.trim() === `"${sha256}"`);
}

/**
 * EmulatorJS probes the ROM with a HEAD request before every load and
 * compares the length with what it has in IndexedDB. Answering from the
 * catalog alone keeps that probe from opening — and reading — the whole file.
 */
export async function HEAD(request: Request, { params }: Params) {
  const { slug } = await params;
  return withUser(async () => {
    try {
      const game = await getGame(slug);
      if (!game?.rom) return new Response(null, { status: 404 });
      return new Response(null, { status: 200, headers: romHeaders(game.rom, request) });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}

/**
 * Stream a ROM out of the local cache, or GridFS on first request.
 *
 * The SHA-256 travels in a header so the client can verify what it received
 * without hashing the whole file again, and so both peers can compare.
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;

  // The ROM bytes are the thing actually worth protecting — an unauthenticated
  // download endpoint would make the whole library public regardless of the gate.
  return withUser(async () => {
    try {
      const game = await getGame(slug);
      if (!game?.rom) {
        return Response.json({ error: 'No ROM attached to this game.' }, { status: 404 });
      }

      // Decided before the file is opened: a revalidation must not cost a read.
      if (notModified(request, game.rom.sha256)) {
        return new Response(null, { status: 304, headers: romHeaders(game.rom, request) });
      }

      const rom = await openRom(slug);
      if (!rom) {
        return Response.json({ error: 'No ROM attached to this game.' }, { status: 404 });
      }

      const body = Readable.toWeb(rom.stream) as WebReadableStream<Uint8Array>;
      return new Response(body as unknown as BodyInit, { headers: romHeaders(rom, request) });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}
