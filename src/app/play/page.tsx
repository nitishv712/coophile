import Link from "next/link";
import Notice from "@/src/components/Notice";
import PlayClient from "@/src/components/PlayClient";
import { SYSTEMS, type SystemType } from "@/src/lib/emulator/types";
import type { Game } from "@/src/lib/games/types";
import { getGame } from "@/src/lib/games/repository";
import { dbErrorMessage } from "@/src/lib/db/errors";
import { first, type SearchParams } from "@/src/lib/searchParams";
import { signInGate } from "@/src/components/SignInGate";

const libraryLink = (
  <Link
    id="btn-go-library"
    href="/games"
    className="btn-primary text-sm px-8 py-3.5 inline-flex items-center gap-2"
  >
    Open the library
    <span className="material-symbols-outlined text-base">arrow_forward</span>
  </Link>
);

/**
 * Resolves which game is being played before anything renders.
 *
 * Every outcome that depends only on the catalog — an unknown slug, a game
 * with no ROM attached — is decided here, so those cases never reach the
 * browser as a spinner that resolves into a dead end.
 */
export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await signInGate();
  if (gate) return gate;

  const params = await searchParams;
  const gameId = first(params.game);
  const requested = first(params.system) as SystemType | null;
  const requestedSystem = requested && SYSTEMS[requested] ? requested : null;

  if (!gameId) {
    // Nothing from the catalog: either a ROM dropped on the landing page, which
    // only the browser can see, or nothing at all.
    return <PlayClient game={null} requestedSystem={requestedSystem} />;
  }

  let game: Game | null = null;
  let error: string | null = null;
  try {
    game = await getGame(gameId);
  } catch (cause) {
    error = dbErrorMessage(cause);
  }

  if (error) {
    return (
      <Notice
        icon="database_off"
        title="Could not load that game"
        body={error}
        action={libraryLink}
      />
    );
  }

  if (!game) {
    return (
      <Notice
        icon="search_off"
        title="Game not found"
        body="That game is not in the catalog."
        action={libraryLink}
      />
    );
  }

  if (!game.rom) {
    return (
      <Notice
        icon="hourglass_empty"
        title={`No ROM for ${game.title}`}
        body={`${game.title} is in the catalog but has no ROM attached yet. An admin needs to upload one.`}
        action={libraryLink}
      />
    );
  }

  return <PlayClient game={game} requestedSystem={requestedSystem} />;
}
