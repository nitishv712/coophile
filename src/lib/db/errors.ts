/**
 * Turn a database failure into something actionable.
 *
 * A missing Mongo is the single most likely setup problem, so it gets its own
 * message rather than surfacing a driver stack trace.
 */
export function dbErrorResponse(error: unknown): Response {
  const unreachable = isUnreachable(error);
  return Response.json({ error: dbErrorMessage(error) }, { status: unreachable ? 503 : 500 });
}

function isUnreachable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|ServerSelection|connect failed|topology was destroyed/i.test(message);
}

/**
 * The same wording as `dbErrorResponse`, for server-rendered pages that read
 * the database directly and have no response to attach a status to.
 */
export function dbErrorMessage(error: unknown): string {
  if (isUnreachable(error)) {
    return 'Cannot reach MongoDB. Start it with `npm run mongo`, or set MONGODB_URI to your own cluster.';
  }
  console.error('[coophile] database error:', error instanceof Error ? error.message : error);
  return 'Database error.';
}
