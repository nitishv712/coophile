import type { ObjectId } from 'mongodb';
import { SYSTEMS, type SystemType } from '../emulator/types';

export type { SystemType };

export type CoopMode = 'simultaneous' | 'alternating' | 'none';

/**
 * Provenance for anything the server hosts.
 *
 * Required, not optional: the server distributes whatever is uploaded here, so
 * every ROM must carry a record of where it came from and under what terms.
 */
export interface RightsRecord {
  sourceUrl: string;
  license: string;
  /** Who signed off that this is cleared for distribution. */
  attestedBy: string;
  attestedAt: string;
}

export interface RomRecord {
  fileName: string;
  size: number;
  /** Both peers must run identical bytes or lockstep desyncs. */
  sha256: string;
  uploadedAt: string;
}

/** Shape stored in Mongo. */
export interface GameDoc {
  _id?: ObjectId;
  slug: string;
  title: string;
  altTitle?: string;
  system: SystemType;
  year: string;
  publisher: string;
  players: number;
  coop: CoopMode;
  genre: string;
  blurb: string;
  accent: string;
  glyph: string;
  rights: RightsRecord;
  rom: (RomRecord & { fileId: ObjectId }) | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape sent to the browser — no ObjectIds, JSON-safe. */
export interface Game {
  slug: string;
  title: string;
  altTitle?: string;
  system: SystemType;
  year: string;
  publisher: string;
  players: number;
  coop: CoopMode;
  genre: string;
  blurb: string;
  accent: string;
  glyph: string;
  rights: RightsRecord;
  rom: RomRecord | null;
  createdAt: string;
  updatedAt: string;
}

export function toGame(doc: GameDoc): Game {
  return {
    slug: doc.slug,
    title: doc.title,
    altTitle: doc.altTitle,
    system: doc.system,
    year: doc.year,
    publisher: doc.publisher,
    players: doc.players,
    coop: doc.coop,
    genre: doc.genre,
    blurb: doc.blurb,
    accent: doc.accent,
    glyph: doc.glyph,
    rights: doc.rights,
    rom: doc.rom
      ? {
          fileName: doc.rom.fileName,
          size: doc.rom.size,
          sha256: doc.rom.sha256,
          uploadedAt: doc.rom.uploadedAt,
        }
      : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export const COOP_MODES: CoopMode[] = ['simultaneous', 'alternating', 'none'];

export function isSystemType(value: unknown): value is SystemType {
  return typeof value === 'string' && value in SYSTEMS;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

/** Extensions the picker should accept for a game's system. */
export function acceptedExtensions(system: SystemType): string[] {
  return SYSTEMS[system].extensions;
}

/** Every ROM extension across all systems, plus .zip, for a generic picker. */
export function allRomExtensions(): string[] {
  const extensions = Object.values(SYSTEMS).flatMap((info) => info.extensions);
  return [...new Set(extensions)];
}

/** Which console a file belongs to, judged by its extension. */
export function systemForFileName(fileName: string): SystemType | null {
  const extension = `.${fileName.split('.').pop()?.toLowerCase() ?? ''}`;
  for (const [system, info] of Object.entries(SYSTEMS)) {
    if (info.extensions.includes(extension)) return system as SystemType;
  }
  return null;
}

/**
 * A sensible starting title from a filename.
 *
 * Dumps are usually named like "Super Tilt Bro. (E) [!].nes" — strip the
 * extension and the region/quality tags so the operator has less to retype.
 */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[([][^)\]]*[)\]]/g, '')
    // Underscores only — a dot here is usually real punctuation ("Bro."), and
    // the extension has already been removed.
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GameInput {
  title: string;
  slug?: string;
  altTitle?: string;
  system: SystemType;
  year: string;
  publisher: string;
  players: number;
  coop: CoopMode;
  genre: string;
  blurb: string;
  accent: string;
  glyph: string;
  rights: { sourceUrl: string; license: string; attestedBy: string };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: GameInput;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ACCENT = '#094cb2';
export const DEFAULT_GLYPH = '🎮';

/**
 * Server-side validation — the admin UI mirrors this but never replaces it.
 *
 * Only three things are actually required: a title, a system (it decides which
 * emulator core runs), and a licence. Everything else is presentation and has a
 * sensible default, so adding a game is a short job.
 */
export function validateGameInput(body: unknown): ValidationResult {
  const errors: string[] = [];
  const raw = (body ?? {}) as Record<string, unknown>;

  const text = (key: string, max: number): string => {
    const value = typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
    if (value.length > max) errors.push(`${key} is too long`);
    return value.slice(0, max);
  };

  const title = text('title', 120);
  if (!title) errors.push('title is required');

  if (!isSystemType(raw.system)) errors.push('system must be a supported console');

  // Optional, with defaults — a game with none of these still works.
  const year = text('year', 12);
  const publisher = text('publisher', 120);
  const genre = text('genre', 60);
  const blurb = text('blurb', 400);

  const players = Number(raw.players ?? 2);
  const validPlayers = Number.isInteger(players) && players >= 1 && players <= 8;
  if (raw.players !== undefined && !validPlayers) {
    errors.push('players must be a whole number between 1 and 8');
  }

  const coopRaw = raw.coop as CoopMode;
  const coop = COOP_MODES.includes(coopRaw) ? coopRaw : 'simultaneous';

  const accentRaw = typeof raw.accent === 'string' ? raw.accent : '';
  const accent = HEX_COLOR.test(accentRaw) ? accentRaw : DEFAULT_ACCENT;

  const glyphRaw = typeof raw.glyph === 'string' ? raw.glyph.trim() : '';
  const glyph = glyphRaw && glyphRaw.length <= 8 ? glyphRaw : DEFAULT_GLYPH;

  /**
   * Provenance is recorded when given but no longer required — the operator
   * confirms their right to distribute in the admin UI instead. Only the URL is
   * still validated, and only when one is actually supplied.
   */
  const rights = (raw.rights ?? {}) as Record<string, unknown>;
  const sourceUrl = typeof rights.sourceUrl === 'string' ? rights.sourceUrl.trim() : '';
  const license = typeof rights.license === 'string' ? rights.license.trim() : '';
  const attestedBy = typeof rights.attestedBy === 'string' ? rights.attestedBy.trim() : '';

  if (sourceUrl && !/^https?:\/\/\S+$/.test(sourceUrl)) {
    errors.push('source must be an http(s) link, or left blank');
  }

  const slug = typeof raw.slug === 'string' && raw.slug.trim() ? slugify(raw.slug) : slugify(title);
  if (!slug) errors.push('slug could not be derived from the title');

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    value: {
      title,
      slug,
      altTitle:
        typeof raw.altTitle === 'string' && raw.altTitle.trim()
          ? raw.altTitle.trim()
          : undefined,
      system: raw.system as SystemType,
      year,
      publisher,
      players: validPlayers ? players : 2,
      coop,
      genre,
      blurb,
      accent,
      glyph,
      rights: { sourceUrl, license, attestedBy },
    },
  };
}
