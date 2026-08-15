import { headers } from "next/headers";
import SiteNav from "@/src/components/SiteNav";
import SiteFooter from "@/src/components/SiteFooter";
import LobbyClient from "@/src/components/LobbyClient";
import type { Game } from "@/src/lib/games/types";
import { getGame } from "@/src/lib/games/repository";
import { lanOrigins } from "@/src/lib/net/lanOrigins";
import { first, type SearchParams } from "@/src/lib/searchParams";
import { signInGate } from "@/src/components/SignInGate";

/**
 * The lobby shell.
 *
 * Everything the browser used to ask for after mounting — which game this room
 * is for, and what addresses this server can be reached on — is resolved here
 * instead, so the netplay component starts with both already in hand.
 */
export default async function LobbyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await signInGate();
  if (gate) return gate;

  const params = await searchParams;
  const gameId = first(params.game);
  const invitedRoom = first(params.room)?.toUpperCase() ?? "";

  let game: Game | null = null;
  if (gameId) {
    // A lobby with an unknown game is still a usable lobby — the ROM check
    // below simply reports that this side has nothing loaded.
    game = await getGame(gameId).catch(() => null);
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
  const origins = host ? lanOrigins(host, forwardedProto === "https" ? "https:" : "http:") : [];

  return (
    <>
      <SiteNav />

      <main className="flex-grow w-full max-w-screen-xl mx-auto px-6 lg:px-12 py-12 lg:py-16">
        {/* ── Header ─────────────────────────────────── */}
        <header className="mb-12">
          <p className="font-label tracking-widest uppercase text-xs text-tertiary mb-4 font-semibold">
            /lobby
          </p>
          <h1 className="font-headline text-4xl sm:text-5xl md:text-6xl text-primary font-bold leading-tight mb-4 tracking-tight">
            NETPLAY LOBBY
          </h1>
          <p className="font-body text-lg text-on-surface-variant max-w-3xl leading-relaxed">
            Open a direct peer-to-peer link with a friend. Once connected, gameplay
            goes browser to browser — the server only introduces you.
          </p>
        </header>

        <LobbyClient
          game={game}
          gameId={gameId}
          invitedRoom={invitedRoom}
          lanOrigins={origins}
        />
      </main>

      <SiteFooter />
    </>
  );
}
