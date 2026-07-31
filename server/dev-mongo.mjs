/**
 * Local MongoDB for development.
 *
 * Downloads a real `mongod` binary into a user-writable cache (no root, no
 * Docker) and runs it against a persistent data directory, so records survive
 * restarts. In production set MONGODB_URI to your own cluster and never run
 * this.
 *
 * Run with: npm run mongo
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = Number(process.env.MONGODB_PORT ?? 27017);
const DB_NAME = process.env.MONGODB_DB ?? 'coophile';
const DATA_DIR = resolve(process.cwd(), '.mongo-data');

await mkdir(DATA_DIR, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: {
    port: PORT,
    dbName: DB_NAME,
    dbPath: DATA_DIR,
    // Without this the data directory is wiped on shutdown.
    storageEngine: 'wiredTiger',
  },
});

console.log(`[mongo] listening on ${server.getUri(DB_NAME)}`);
console.log(`[mongo] data directory: ${DATA_DIR}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log('[mongo] shutting down');
    await server.stop();
    process.exit(0);
  });
}
