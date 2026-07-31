/**
 * Coophile mark: two interlocking diamonds.
 *
 * Two shapes, joined where they overlap — the same idea as the product: two
 * players sharing one game state. Drawn as geometry rather than an image so it
 * stays sharp at any size, inherits `currentColor`, and costs no request.
 *
 * The solid centre is the exact intersection of the two outlines, so the pieces
 * stay locked together at every size.
 */
export default function Logo({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <g
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M15 9 L26 20 L15 31 L4 20 Z" />
        <path d="M25 9 L36 20 L25 31 L14 20 Z" />
      </g>
      {/* Where the two overlap. */}
      <path d="M20 14 L26 20 L20 26 L14 20 Z" fill="currentColor" />
    </svg>
  );
}
