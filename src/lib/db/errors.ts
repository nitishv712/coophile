/**
 * Turn a database failure into something actionable.
 *
 * A missing Mongo is the single most likely setup problem, so it gets its own
 * message rather than surfacing a driver stack trace.
 */
export function dbErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  const unreachable =
    /ECONNREFUSED|ServerSelection|connect failed|topology was destroyed/i.test(message);

  if (unreachable) {
    return Response.json(
      {
        error:
          'Cannot reach MongoDB. Start it with `npm run mongo`, or set MONGODB_URI to your own cluster.',
      },
      { status: 503 },
    );
  }

  console.error('[api] database error:', message);
  return Response.json({ error: 'Database error.' }, { status: 500 });
}
