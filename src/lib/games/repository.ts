import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { GAMES, ensureIndexes, getDb, getRomBucket } from '../db/mongo';
import { acceptedExtensions, toGame, type Game, type GameDoc, type GameInput } from './types';
import { ArchiveError, extractRomFromZip, looksLikeZip } from './archive';

async function collection() {
  await ensureIndexes();
  const db = await getDb();
  return db.collection<GameDoc>(GAMES);
}

export async function listGames(): Promise<Game[]> {
  const games = await collection();
  const docs = await games.find({}).sort({ createdAt: 1 }).toArray();
  return docs.map(toGame);
}

export async function getGame(slug: string): Promise<Game | null> {
  const games = await collection();
  const doc = await games.findOne({ slug });
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
  const doc = await games.findOne({ slug: nextSlug });
  return doc ? toGame(doc) : null;
}

export async function deleteGame(slug: string): Promise<boolean> {
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc) return false;

  if (doc.rom) await removeRomFile(doc.rom.fileId);
  await games.deleteOne({ slug });
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
  if (previous) await removeRomFile(previous);

  const updated = await games.findOne({ slug });
  return updated ? toGame(updated) : null;
}

export async function detachRom(slug: string): Promise<Game | null> {
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc) return null;

  if (doc.rom) await removeRomFile(doc.rom.fileId);
  await games.updateOne({ slug }, { $set: { rom: null, updatedAt: new Date() } });

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
  const games = await collection();
  const doc = await games.findOne({ slug });
  if (!doc?.rom) return null;

  const bucket = await getRomBucket();
  return {
    stream: bucket.openDownloadStream(doc.rom.fileId),
    fileName: doc.rom.fileName,
    size: doc.rom.size,
    sha256: doc.rom.sha256,
  };
}
