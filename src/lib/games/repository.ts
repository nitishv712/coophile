import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { GAMES, ensureIndexes, getDb, getRomBucket } from '../db/mongo';
import { acceptedExtensions, toGame, type Game, type GameDoc, type GameInput } from './types';
import { readCached, writeCached, dropCached } from './romCache';
import { ArchiveError, extractRomFromZip, looksLikeZip } from './archive';

async function collection() {
  await ensureIndexes();
  const db = await getDb();
  return db.collection<GameDoc>(GAMES);
}

/**
 * The catalog, held in memory.
 *
 * Every page past the sign-in gate reads it — the library, the play screen,
 * the lobby — and the ROM route consults it before it can serve a single byte,
 * even one already cached on disk. Each of those reads was a round-trip to
 * Atlas, measured at ~100ms from here, for a handful of documents that only
 * change when an admin edits them.
 *
 * Writes go through this module, so they drop the cache themselves; the TTL
 * only bounds staleness if a second instance ever writes to the same database.
 *
 * Lives on `globalThis` for the same reason the Mongo client does: route
 * bundles can each carry their own copy of this module, and an admin route
 * invalidating its private copy would leave the pages serving stale data.
 */
interface CatalogCache {
  docs: GameDoc[] | null;
  loadedAt: number;
  inflight: Promise<GameDoc[]> | null;
}

declare global {
  var __coophileCatalog: CatalogCache | undefined;
}

const CATALOG_TTL_MS = 30_000;

function catalogCache(): CatalogCache {
  globalThis.__coophileCatalog ??= { docs: null, loadedAt: 0, inflight: null };
  return globalThis.__coophileCatalog;
}

async function loadCatalog(): Promise<GameDoc[]> {
  const cache = catalogCache();
  if (cache.docs && Date.now() - cache.loadedAt < CATALOG_TTL_MS) return cache.docs;

  // One fetch serves every concurrent reader — both peers open the lobby at
  // the same moment and should not each pay for their own query.
  cache.inflight ??= (async () => {
    try {
      const games = await collection();
      const docs = await games.find({}).sort({ createdAt: 1 }).toArray();
      cache.docs = docs;
      cache.loadedAt = Date.now();
      return docs;
    } finally {
      cache.inflight = null;
    }
  })();
  return cache.inflight;
}

function invalidateCatalog(): void {
  const cache = catalogCache();
  cache.docs = null;
  cache.loadedAt = 0;
}

async function findDoc(slug: string): Promise<GameDoc | null> {
  const docs = await loadCatalog();
  return docs.find((doc) => doc.slug === slug) ?? null;
}

export async function listGames(): Promise<Game[]> {
  const docs = await loadCatalog();
  return docs.map(toGame);
}

export async function getGame(slug: string): Promise<Game | null> {
  const doc = await findDoc(slug);
  return doc ? toGame(doc) : null;
}

export class SlugTakenError extends Error {
  constructor(slug: string) {
    super(`A game with the slug "${slug}" already exists.`);
  }
}

export async function createGame(input: GameInput): Promise<Game> {
  const games = await collection();
  const now = new Date();

  const doc: GameDoc = {
    slug: input.slug!,
    title: input.title,
    altTitle: input.altTitle,
    system: input.system,
    year: input.year,
    publisher: input.publisher,
    players: input.players,
    coop: input.coop,
    genre: input.genre,
    blurb: input.blurb,
    accent: input.accent,
    glyph: input.glyph,
    rights: { ...input.rights, attestedAt: now.toISOString() },
    rom: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await games.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new SlugTakenError(doc.slug);
    throw error;
  }
  invalidateCatalog();
  return toGame(doc);
}

export async function updateGame(slug: string, input: GameInput): Promise<Game | null> {
  const games = await collection();
  const existing = await games.findOne({ slug });
  if (!existing) return null;

  const now = new Date();
  const nextSlug = input.slug ?? slug;

  if (nextSlug !== slug && (await games.findOne({ slug: nextSlug }))) {
    throw new SlugTakenError(nextSlug);
  }

  const updated: Partial<GameDoc> = {
    slug: nextSlug,
    title: input.title,
    altTitle: input.altTitle,
    system: input.system,
    year: input.year,
    publisher: input.publisher,
    players: input.players,
    coop: input.coop,
    genre: input.genre,
    blurb: input.blurb,
    accent: input.accent,
    glyph: input.glyph,
    // Keep the original attestation date; the attester may have changed.
    rights: { ...input.rights, attestedAt: existing.rights.attestedAt },
    updatedAt: now,
  };

  await games.updateOne({ slug }, { $set: updated });
  invalidateCatalog();
  const doc = await games.findOne({ slug: nextSlug });
  return doc ? toGame(doc) : null;
}

export async function deleteGame(slug: string): Promise<boolean> {
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc) return false;

  if (doc.rom) {
    await removeRomFile(doc.rom.fileId);
    await dropCached(doc.rom.sha256);
  }
  await games.deleteOne({ slug });
  invalidateCatalog();
  return true;
}

async function removeRomFile(fileId: ObjectId): Promise<void> {
  const bucket = await getRomBucket();
  try {
    await bucket.delete(fileId);
  } catch {
    // Already gone; deleting the game record is what matters.
  }
}

export class RomRejectedError extends Error {}

/**
 * Store a ROM for a game, replacing any existing one.
 *
 * The SHA-256 is computed here rather than trusted from the client — it is what
 * peers compare to prove they are running identical bytes.
 */
export async function attachRom(
  slug: string,
  fileName: string,
  data: Buffer,
): Promise<Game | null> {
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc) return null;

  if (data.byteLength === 0) throw new RomRejectedError('That file is empty.');
  if (data.byteLength > 64 * 1024 * 1024) {
    throw new RomRejectedError('Uploads above 64 MB are not accepted.');
  }

  const allowed = acceptedExtensions(doc.system);
  let romName = fileName;
  let romData = data;

  // Zips are unpacked here, so what gets stored and fingerprinted is the ROM
  // itself — not the archive, whose hash would differ between two zips of
  // identical bytes and break the peers' ROM-match check.
  if (looksLikeZip(data)) {
    try {
      const extracted = await extractRomFromZip(data, allowed);
      romName = extracted.fileName;
      romData = extracted.data;
    } catch (error) {
      if (error instanceof ArchiveError) throw new RomRejectedError(error.message);
      throw error;
    }
  } else {
    const extension = `.${fileName.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!allowed.includes(extension)) {
      throw new RomRejectedError(
        `${doc.title} expects ${allowed.join(' or ')} or a .zip — got ${extension || 'no extension'}.`,
      );
    }
  }

  const sha256 = createHash('sha256').update(romData).digest('hex');
  const bucket = await getRomBucket();

  const fileId = await new Promise<ObjectId>((resolve, reject) => {
    const upload = bucket.openUploadStream(romName, {
      metadata: { slug, sha256, system: doc.system },
    });
    Readable.from(romData)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(upload.id as ObjectId));
  });

  // Swap the pointer first, then bin the old blob, so a failure never leaves
  // the game pointing at a file that no longer exists.
  const previous = doc.rom?.fileId;
  await games.updateOne(
    { slug },
    {
      $set: {
        rom: {
          fileId,
          fileName: romName,
          size: romData.byteLength,
          sha256,
          uploadedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    },
  );
  invalidateCatalog();
  if (previous) await removeRomFile(previous);

  // The bytes are already in hand, so seed the cache now rather than making the
  // first player pay for a round-trip to fetch back what we just sent.
  await writeCached(sha256, romData);

  const updated = await games.findOne({ slug });
  return updated ? toGame(updated) : null;
}

export async function detachRom(slug: string): Promise<Game | null> {
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc) return null;

  if (doc.rom) {
    await removeRomFile(doc.rom.fileId);
    await dropCached(doc.rom.sha256);
  }
  await games.updateOne({ slug }, { $set: { rom: null, updatedAt: new Date() } });
  invalidateCatalog();

  const updated = await games.findOne({ slug });
  return updated ? toGame(updated) : null;
}

export interface RomStream {
  stream: Readable;
  fileName: string;
  size: number;
  sha256: string;
}

export async function openRom(slug: string): Promise<RomStream | null> {
  // From the in-memory catalog: a cached ROM must not cost a database
  // round-trip just to learn which file to open.
  const doc = await findDoc(slug);
  if (!doc?.rom) return null;

  const { fileName, size, sha256 } = doc.rom;

  // Served before? Then it is already on local disk, and we can skip the
  // ~300ms round-trip to Atlas entirely.
  const cached = await readCached(sha256);
  if (cached) return { stream: cached, fileName, size, sha256 };

  // First time: pull it down whole so it can be cached. ROMs are small — a
  // NES title is a few hundred KB, and the largest system we support tops out
  // in the tens of MB — so buffering one is cheaper than teeing the stream.
  const bucket = await getRomBucket();
  const chunks: Buffer[] = [];
  const download = bucket.openDownloadStream(doc.rom.fileId);
  for await (const chunk of download) chunks.push(chunk as Buffer);
  const data = Buffer.concat(chunks);

  // Cache only what arrived intact. A short read here would otherwise be
  // frozen into the cache and served as a complete ROM from then on.
  if (data.length === size) void writeCached(sha256, data);

  return { stream: Readable.from(data), fileName, size, sha256 };
}
