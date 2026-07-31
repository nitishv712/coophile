import { listGames } from '@/src/lib/games/repository';
import { dbErrorResponse } from '@/src/lib/db/errors';

/** Public catalog. Returns metadata only — ROM bytes come from the rom route. */
export async function GET() {
  try {
    return Response.json({ games: await listGames() });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
