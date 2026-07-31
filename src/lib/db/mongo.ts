import { MongoClient, GridFSBucket, type Db } from 'mongodb';

/**
 * MongoDB connection, shared across route handlers.
 *
 * The client is cached on `globalThis` because dev-mode module reloading would
 * otherwise open a new connection pool on every edit until Mongo refuses them.
 */

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'coophile';

export const ROM_BUCKET = 'roms';
export const GAMES = 'games';

declare global {
  var __coophileMongoClient: Promise<MongoClient> | undefined;
}

function connect(): Promise<MongoClient> {
  globalThis.__coophileMongoClient ??= new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  }).connect();
  return globalThis.__coophileMongoClient;
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(MONGODB_DB);
}

/** GridFS holds ROM binaries — they exceed Mongo's 16 MB document limit. */
export async function getRomBucket(): Promise<GridFSBucket> {
  const db = await getDb();
  return new GridFSBucket(db, { bucketName: ROM_BUCKET });
}

let indexesReady: Promise<void> | undefined;

/** Idempotent; every route that touches the DB awaits this first. */
export function ensureIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const db = await getDb();
    await db.collection(GAMES).createIndex({ slug: 1 }, { unique: true });
    await db.collection(GAMES).createIndex({ createdAt: -1 });
  })();
  return indexesReady;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI) || process.env.NODE_ENV !== 'production';
}
