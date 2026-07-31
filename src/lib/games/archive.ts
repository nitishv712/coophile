import { fromBuffer, type Entry, type ZipFile } from 'yauzl';

/**
 * ROM extraction from zip archives.
 *
 * Most ROMs arrive zipped — itch.io downloads, homebrew releases, and personal
 * backups almost always are. Extraction happens here rather than in the browser
 * so the stored bytes and their fingerprint are both produced server-side.
 */

/** Local file header: "PK\x03\x04". */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Guards against a small archive that expands to something enormous. */
const MAX_ENTRIES = 512;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

export class ArchiveError extends Error {}

export interface ExtractedRom {
  fileName: string;
  data: Buffer;
}

export function looksLikeZip(data: Buffer): boolean {
  return data.length >= 4 && data.subarray(0, 4).equals(ZIP_MAGIC);
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Entries worth considering: real files, not directories, and not the metadata
 * folders macOS and Windows sprinkle into archives.
 */
function isUsableEntry(entry: Entry): boolean {
  const path = entry.fileName;
  if (path.endsWith('/')) return false;
  if (path.startsWith('__MACOSX/') || path.includes('/__MACOSX/')) return false;
  if (baseName(path).startsWith('.')) return false;
  // Never trust a path out of an archive, even though nothing is written to disk.
  if (path.startsWith('/') || path.includes('..')) return false;
  return true;
}

function openArchive(archive: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    fromBuffer(archive, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(new ArchiveError('That zip file could not be opened — it may be corrupt.'));
        return;
      }
      resolve(zipFile);
    });
  });
}

function readEntries(zipFile: ZipFile): Promise<Entry[]> {
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zipFile.on('entry', (entry: Entry) => {
      if (entries.length >= MAX_ENTRIES) {
        reject(new ArchiveError(`That zip has more than ${MAX_ENTRIES} files in it.`));
        zipFile.close();
        return;
      }
      entries.push(entry);
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolve(entries));
    zipFile.on('error', () => reject(new ArchiveError('That zip file could not be read.')));
    zipFile.readEntry();
  });
}

function readEntryData(zipFile: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(new ArchiveError(`Could not read ${baseName(entry.fileName)} from the zip.`));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;

      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        // Belt and braces: the declared size was checked, but a crafted archive
        // can lie about it, so stop on the real byte count too.
        if (total > MAX_ENTRY_BYTES) {
          stream.destroy();
          reject(new ArchiveError('That ROM is larger than 64 MB once unpacked.'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', () => reject(new ArchiveError('The zip entry could not be unpacked.')));
    });
  });
}

/**
 * Pull the one ROM out of a zip.
 *
 * Ambiguity is an error rather than a guess: an archive holding two ROMs (a
 * game and its second quest, say) needs the operator to say which one, because
 * picking wrong would be silently stored and fingerprinted as the real thing.
 */
export async function extractRomFromZip(
  archive: Buffer,
  allowedExtensions: string[],
): Promise<ExtractedRom> {
  const zipFile = await openArchive(archive);

  try {
    const entries = (await readEntries(zipFile)).filter(isUsableEntry);

    if (entries.length === 0) {
      throw new ArchiveError('That zip is empty.');
    }

    const candidates = entries.filter((entry) =>
      allowedExtensions.includes(extensionOf(entry.fileName)),
    );

    if (candidates.length === 0) {
      const found = entries.slice(0, 6).map((entry) => baseName(entry.fileName)).join(', ');
      throw new ArchiveError(
        `No ${allowedExtensions.join(' or ')} file inside that zip. It contains: ${found}` +
          (entries.length > 6 ? `, and ${entries.length - 6} more.` : '.'),
      );
    }

    if (candidates.length > 1) {
      const names = candidates.map((entry) => baseName(entry.fileName)).join(', ');
      throw new ArchiveError(
        `That zip holds more than one ROM (${names}). Upload the one you want on its own.`,
      );
    }

    const [entry] = candidates;
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
      throw new ArchiveError('That ROM is larger than 64 MB once unpacked.');
    }

    const data = await readEntryData(zipFile, entry);
    if (data.length === 0) {
      throw new ArchiveError(`${baseName(entry.fileName)} is empty inside the zip.`);
    }

    return { fileName: baseName(entry.fileName), data };
  } finally {
    zipFile.close();
  }
}
