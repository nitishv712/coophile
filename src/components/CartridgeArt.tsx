import type { Game } from '@/src/lib/games/types';

/**
 * Generated cover art.
 *
 * Real box art carries its own copyright, so each game gets a deterministic
 * geometric pattern derived from its accent colour instead — intersecting
 * squares and circles, in the flat editorial style of the rest of the UI.
 */
export default function CartridgeArt({
  game,
  loaded = false,
}: {
  game: Pick<Game, 'accent' | 'glyph' | 'system' | 'slug'>;
  loaded?: boolean;
}) {
  // Deterministic per game, so a title always looks the same.
  const seed = [...game.slug].reduce((total, char) => total + char.charCodeAt(0), 0);
  const rotation = seed % 45;
  const offsetX = 20 + (seed % 35);
  const offsetY = 15 + ((seed >> 2) % 40);

  return (
    <div
      className="h-40 w-full relative overflow-hidden bg-surface-container-high"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 group-hover:scale-105 transition-transform duration-500"
        style={{
          background: `linear-gradient(135deg, ${game.accent}18 0%, ${game.accent}05 100%)`,
        }}
      >
        <svg
          viewBox="0 0 200 120"
          preserveAspectRatio="xMidYMid slice"
          className="w-full h-full"
        >
          <g
            transform={`rotate(${rotation} 100 60)`}
            stroke={game.accent}
            fill="none"
            strokeWidth="1.25"
            opacity="0.55"
          >
            <rect x={offsetX} y={offsetY} width="60" height="60" />
            <rect x={offsetX + 24} y={offsetY + 18} width="60" height="60" />
            <circle cx={offsetX + 60} cy={offsetY + 30} r="30" />
          </g>
          <g fill={game.accent} opacity="0.16">
            <circle cx={offsetX + 24} cy={offsetY + 48} r="14" />
          </g>
        </svg>
      </div>

      {loaded && (
        <div className="absolute top-3 left-3 bg-surface-container-lowest/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1">
          <span className="material-symbols-outlined icon-filled text-sm text-primary">
            check_circle
          </span>
          <span className="font-label text-[10px] tracking-widest uppercase text-primary font-semibold">
            Ready
          </span>
        </div>
      )}
    </div>
  );
}
