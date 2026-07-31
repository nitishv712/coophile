"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteNav from "@/src/components/SiteNav";
import SiteFooter from "@/src/components/SiteFooter";
import CartridgeArt from "@/src/components/CartridgeArt";
import { SYSTEMS } from "@/src/lib/emulator/types";
import type { Game } from "@/src/lib/games/types";
import { fetchGames } from "@/src/lib/games/client";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GameCard({
  game,
  onPlay,
  onHost,
}: {
  game: Game;
  onPlay: (game: Game) => void;
  onHost: (game: Game) => void;
}) {
  const netplayReady = game.coop === "simultaneous";
  const playable = Boolean(game.rom);

  return (
    <article
      id={`game-${game.slug}`}
      data-playable={playable ? "true" : "false"}
      className="group card overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300 flex flex-col h-full"
    >
      <div className="relative">
        <CartridgeArt game={game} loaded={playable} />
        {netplayReady && (
          <div className="absolute top-3 right-3 bg-surface-container-lowest/90 backdrop-blur-sm px-2 py-1 rounded-lg">
            <span className="font-label text-xs font-bold text-primary">
              {game.players}P
            </span>
          </div>
        )}
      </div>

      <div className="p-6 flex flex-col flex-grow">
        <h2 className="font-headline text-2xl font-bold mb-2 text-on-surface group-hover:text-primary transition-colors leading-tight">
          {game.title}
        </h2>

        {game.altTitle && (
          <p className="font-body text-sm text-on-surface-variant italic mb-2">
            also known as “{game.altTitle}”
          </p>
        )}

        <p className="font-label text-xs tracking-widest text-on-surface-variant uppercase mb-4">
          {SYSTEMS[game.system].name.split(" ").slice(0, 3).join(" ")}
          {game.year && ` · ${game.year}`}
          {game.publisher && ` · ${game.publisher}`}
        </p>

        {game.blurb && (
          <p className="font-body text-sm text-on-surface-variant leading-relaxed mb-4">
            {game.blurb}
          </p>
        )}

        <div className="mt-auto pt-6 border-t border-outline-variant/15 flex items-center justify-between gap-4">
          {playable ? (
            <>
              <div className="flex flex-col min-w-0">
                <span className="font-body text-xs text-on-surface-variant">
                  {formatSize(game.rom!.size)}
                </span>
                <span className="font-mono text-xs text-outline truncate">
                  {game.rom!.sha256.slice(0, 12)}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  id={`btn-play-${game.slug}`}
                  onClick={() => onPlay(game)}
                  className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  Play
                </button>
                {netplayReady && (
                  <button
                    id={`btn-online-${game.slug}`}
                    onClick={() => onHost(game)}
                    aria-label={`Play ${game.title} online`}
                    title="Play this online with a friend"
                    className="p-2 bg-surface-container hover:bg-surface-container-high rounded-lg transition-colors text-primary flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-lg">bolt</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="font-label text-xs tracking-widest uppercase text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-tertiary">
                hourglass_empty
              </span>
              No ROM attached yet
            </p>
          )}
        </div>

        {game.rights.license && (
          <p className="mt-3 font-body text-xs text-outline truncate">
            {game.rights.sourceUrl ? (
              <a
                href={game.rights.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors underline-offset-4 hover:underline"
              >
                {game.rights.license} ↗
              </a>
            ) : (
              game.rights.license
            )}
          </p>
        )}
      </div>
    </article>
  );
}

export default function GamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGames()
      .then((found) => {
        if (!cancelled) setGames(found);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const playable = games.filter((game) => game.rom);

  return (
    <>
      <SiteNav />

      <main className="flex-grow w-full max-w-screen-2xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
        {/* ── Header ─────────────────────────────────── */}
        <div className="mb-12 lg:mb-16 max-w-3xl">
          <p className="font-label tracking-widest uppercase text-xs text-tertiary mb-4 font-semibold">
            /games
          </p>
          <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl font-bold text-primary mb-6 leading-tight">
            GAME LIBRARY
          </h1>
          <p className="font-body text-lg text-on-surface-variant leading-relaxed mb-6">
            Games hosted on this server. Pick one and play — nothing to download
            or attach.
          </p>
          <div className="inline-flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-lg">
            <span className="material-symbols-outlined text-tertiary text-sm">
              inventory_2
            </span>
            <span className="font-label text-xs tracking-widest uppercase text-on-surface-variant">
              {playable.length} / {games.length} ready to play
            </span>
          </div>
        </div>

        {error && (
          <div
            id="library-error"
            className="mb-8 rounded-xl bg-error-container text-on-error-container px-4 py-3 text-sm flex items-start gap-2"
          >
            <span className="material-symbols-outlined text-lg">error</span>
            {error}
          </div>
        )}

        {/* ── Grid ───────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <span className="material-symbols-outlined text-4xl text-primary animate-spin">
              progress_activity
            </span>
          </div>
        ) : games.length === 0 && !error ? (
          <div
            id="library-empty"
            className="card p-12 lg:p-16 text-center max-w-2xl mx-auto"
          >
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-6">
              inventory_2
            </span>
            <h2 className="font-headline text-2xl mb-3 text-on-surface">
              The shelf is empty
            </h2>
            <p className="font-body text-sm text-on-surface-variant max-w-md mx-auto mb-8 leading-relaxed">
              No games have been added yet. Add them from the admin panel, along
              with a record of where each one came from.
            </p>
            <Link
              href="/admin"
              className="btn-primary text-xs px-6 py-3 inline-flex items-center gap-2"
            >
              Open admin
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {games.map((game) => (
              <GameCard
                key={game.slug}
                game={game}
                onPlay={(g) => router.push(`/play?game=${g.slug}`)}
                onHost={(g) => router.push(`/lobby?game=${g.slug}`)}
              />
            ))}
          </div>
        )}

        {/* ── About ──────────────────────────────────── */}
        <section className="mt-20 lg:mt-24 bg-surface-container-low p-8 lg:p-12 rounded-2xl">
          <h3 className="font-headline text-xl text-on-surface font-semibold mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined icon-filled text-tertiary">info</span>
            About this library
          </h3>
          <p className="font-body text-sm text-on-surface-variant leading-relaxed max-w-3xl">
            Every game here carries a recorded source and licence, shown under its
            card. Only titles the operator holds distribution rights to belong on
            this shelf — homebrew, public domain, and self-owned material. In
            netplay, the ROM is fetched once per browser and only inputs cross the
            peer-to-peer link.
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
