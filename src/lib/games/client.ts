import type { Game, GameInput } from './types';

/** Browser-side wrappers over the games API. */

async function unwrap<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Array.isArray(payload.details) ? `: ${payload.details.join('; ')}` : '';
    throw new Error(`${payload.error ?? `Request failed (${response.status})`}${details}`);
  }
  return payload as T;
}

export async function fetchGames(): Promise<Game[]> {
  const data = await unwrap<{ games: Game[] }>(await fetch('/api/games'));
  return data.games;
}

/**
 * Where a game's ROM is fetched from.
 *
 * The hash goes in the query string for two reasons. It lets the server mark
 * the response immutable, so a browser that has the bytes never asks again.
 * And EmulatorJS keys its own IndexedDB cache on the last URL segment — with a
 * bare `/rom` every game shared the key "rom", so each switch between games
 * evicted the previous one and two ROMs of equal size could be confused.
 */
export function romUrl(slug: string, sha256?: string | null): string {
  const base = `/api/games/${encodeURIComponent(slug)}/rom`;
  return sha256 ? `${base}?v=${sha256}` : base;
}

// ── Admin ────────────────────────────────────────────────────────


export async function adminCreateGame(input: GameInput): Promise<Game> {
  const data = await unwrap<{ game: Game }>(
    await fetch('/api/admin/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return data.game;
}

export async function adminUpdateGame(slug: string, input: GameInput): Promise<Game> {
  const data = await unwrap<{ game: Game }>(
    await fetch(`/api/admin/games/${slug}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return data.game;
}

export async function adminDeleteGame(slug: string): Promise<void> {
  await unwrap(await fetch(`/api/admin/games/${slug}`, { method: 'DELETE' }));
}

export async function adminUploadRom(slug: string, file: File): Promise<Game> {
  const form = new FormData();
  form.set('rom', file);
  const data = await unwrap<{ game: Game }>(
    await fetch(`/api/admin/games/${slug}/rom`, { method: 'POST', body: form }),
  );
  return data.game;
}

export async function adminRemoveRom(slug: string): Promise<Game> {
  const data = await unwrap<{ game: Game }>(
    await fetch(`/api/admin/games/${slug}/rom`, { method: 'DELETE' }),
  );
  return data.game;
}
