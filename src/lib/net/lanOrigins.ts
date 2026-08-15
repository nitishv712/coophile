import { networkInterfaces } from 'node:os';

/**
 * Addresses this server can be reached on from other machines.
 *
 * The lobby needs this because an invite link built from `window.location` is
 * useless when the host is browsing on localhost — the recipient would open
 * their own machine. Only the server knows its real addresses.
 */

/** Virtual interfaces nobody else can route to. */
const IGNORED_INTERFACES = /^(docker|br-|veth|virbr|lo|tun|tap|wg)/i;

export function lanAddresses(): string[] {
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
    const rank = (address: string) =>
      address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2;
    return rank(a) - rank(b);
  });
}

/**
 * Those addresses as origins another machine can open, carrying over the port
 * and scheme the current request arrived on.
 */
export function lanOrigins(host: string, scheme: 'http:' | 'https:'): string[] {
  const defaultPort = scheme === 'https:' ? '443' : '80';
  const port = host.includes(':') ? host.split(':').pop()! : defaultPort;
  const suffix = port === defaultPort ? '' : `:${port}`;
  return lanAddresses().map((address) => `${scheme}//${address}${suffix}`);
}
