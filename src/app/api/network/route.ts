import { networkInterfaces } from 'node:os';
import { withUser } from '@/src/lib/auth/firebaseAdmin';

/**
 * Addresses this server can be reached on from other machines.
 *
 * The lobby needs this because an invite link built from `window.location`
 * is useless when the host is browsing on localhost — the recipient would open
 * their own machine. Only the server knows its real addresses.
 */

/** Virtual interfaces nobody else can route to. */
const IGNORED_INTERFACES = /^(docker|br-|veth|virbr|lo|tun|tap|wg)/i;

function lanAddresses(): string[] {
  const found: string[] = [];

  for (const [name, entries] of Object.entries(networkInterfaces())) {
    if (IGNORED_INTERFACES.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      // Link-local means DHCP failed; it will not help anyone.
      if (entry.address.startsWith('169.254.')) continue;
      found.push(entry.address);
    }
  }

  // Ordinary home networks first — they are the ones a friend is likely on.
  return found.sort((a, b) => {
    const rank = (address: string) => (address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2);
    return rank(a) - rank(b);
  });
}

export async function GET(request: Request) {
  return withUser(async () => {
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? url.host;
    const port = host.includes(':') ? host.split(':').pop()! : url.protocol === 'https:' ? '443' : '80';
    const scheme = url.protocol === 'https:' ? 'https:' : 'http:';

    const addresses = lanAddresses();
    const defaultPort = scheme === 'https:' ? '443' : '80';
    const suffix = port === defaultPort ? '' : `:${port}`;

    return Response.json({
      /** Origins another machine on the same network can open. */
      origins: addresses.map((address) => `${scheme}//${address}${suffix}`),
      /** What the browser currently thinks it is talking to. */
      host,
    });
  });
}
