import { getGame } from '@/src/lib/games/repository';
import { dbErrorResponse } from '@/src/lib/db/errors';
import { withUser } from '@/src/lib/auth/firebaseAdmin';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  return withUser(async () => {
    try {
      const game = await getGame(slug);
      if (!game) return Response.json({ error: 'No such game.' }, { status: 404 });
      return Response.json({ game });
    } catch (error) {
      return dbErrorResponse(error);
    }
  });
}
