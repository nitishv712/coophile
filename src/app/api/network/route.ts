import { withUser } from '@/src/lib/auth/firebaseAdmin';
import { lanOrigins } from '@/src/lib/net/lanOrigins';

/**
 * Addresses this server can be reached on from other machines.
 *
 * The lobby page reads the same information directly while rendering; this
 * endpoint stays for anything asking over HTTP.
 */
export async function GET(request: Request) {
  return withUser(async () => {
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? url.host;
    const scheme = url.protocol === 'https:' ? 'https:' : 'http:';

    return Response.json({
      /** Origins another machine on the same network can open. */
      origins: lanOrigins(host, scheme),
      /** What the browser currently thinks it is talking to. */
      host,
    });
  });
}
