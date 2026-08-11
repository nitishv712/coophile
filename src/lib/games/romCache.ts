import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, unlink, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';

/**
 * A local copy of every ROM that has been served at least once.
 *
 * ROM bytes live in GridFS on MongoDB Atlas, which is across the internet:
 * measured from this machine, a single round-trip to the cluster is ~100ms and
 * pulling a 256KB ROM takes ~300ms. That cost is paid on every game load, by
 * every player, for bytes that never change.
 *
 * Moving the bytes to a different remote store (Firebase Storage, S3, R2) does
 * not fix this — the round-trip to Google measures ~110ms from here, so the
 * physics are the same. What fixes it is not crossing the internet twice: the
 * browser already talks to this server over the LAN, so once the server holds
 * the file locally the fetch drops to disk speed.
 *
 * Entries are keyed by SHA-256, which makes the cache content-addressed: a
 * re-uploaded ROM lands under a different key, so a stale entry cannot be
 * served and there is nothing to invalidate.
 */

const CACHE_DIR = join(tmpdir(), 'coophile-roms');

/** Beyond this the oldest entries are dropped. Roughly 200 NES-sized ROMs. */
const MAX_BYTES = 512 * 1024 * 1024;

function entryPath(sha256: string): string {
  return join(CACHE_DIR, sha256);
}

/** A cached ROM as a stream, or null if we have not seen this one yet. */
export async function readCached(sha256: string): Promise<Readable | null> {
  // A short hash would let a caller reach outside the directory; the digest is
  // generated server-side, but the check is cheap and the failure is nasty.
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  try {
    await stat(entryPath(sha256));
    return createReadStream(entryPath(sha256));
  } catch {
    return null;
  }
}

/**
 * Store bytes under their digest.
 *
 * Written to a temporary name and renamed into place, so a crash mid-write
 * cannot leave a truncated file that later reads would happily serve as if it
 * were the whole ROM.
 */
export async function writeCached(sha256: string, data: Buffer): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const temporary = `${entryPath(sha256)}.${process.pid}.partial`;
    await writeFile(temporary, data, { mode: 0o600 });
    await rename(temporary, entryPath(sha256));
    void prune();
  } catch {
    // A cache that cannot be written is a slow app, not a broken one.
  }
}

/** Drop the least recently used entries once the directory outgrows the cap. */
async function prune(): Promise<void> {
  try {
    const names = await readdir(CACHE_DIR);
    const entries = await Promise.all(
      names
        .filter((name) => /^[a-f0-9]{64}$/.test(name))
        .map(async (name) => {
          const info = await stat(join(CACHE_DIR, name)).catch(() => null);
          return info ? { name, size: info.size, used: info.atimeMs } : null;
        }),
    );

    const present = entries.filter((entry) => entry !== null);
    let total = present.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= MAX_BYTES) return;

    present.sort((a, b) => a.used - b.used);
    for (const entry of present) {
      if (total <= MAX_BYTES) break;
      await unlink(join(CACHE_DIR, entry.name)).catch(() => {});
      total -= entry.size;
    }
  } catch {
    // Pruning is housekeeping; failing it must not fail a request.
  }
}

/** Forget a ROM, for when it is detached from a game. */
export async function dropCached(sha256: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(sha256)) return;
  await unlink(entryPath(sha256)).catch(() => {});
}
