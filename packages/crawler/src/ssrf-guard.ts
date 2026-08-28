import dns from "node:dns";
import net from "node:net";

// Blocks requests to internal/private network targets - both Site Audit's
// BFS crawl and Page Analyzer's single-URL fetch previously accepted a
// fully attacker/user-supplied host with no restriction, meaning either
// feature could be pointed at localhost, an internal service, or a cloud
// metadata endpoint (169.254.169.254) and have this app fetch it and
// reflect the response back through the report. Every real fetch this
// package makes (the initial request AND every redirect hop, since a
// public-looking URL can redirect to a private one) goes through
// assertPublicHost() first.
//
// Not exhaustive DNS-rebinding protection (that needs re-resolving at
// connect time, which the fetch API doesn't expose) - this blocks the
// realistic case: a URL, or a hostname's real DNS answer, that's an
// obviously private/reserved address.

const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local - includes the AWS/GCP/Azure metadata IP 169.254.169.254
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIPv4(v4Mapped[1]!);
  return false;
}

export class SsrfBlockedError extends Error {}

export async function assertPublicHost(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${urlString}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError(`Refusing to fetch a non-http(s) URL: ${urlString}`);
  }

  const hostname = parsed.hostname;
  const ipVersion = net.isIP(hostname);

  if (ipVersion === 4) {
    if (isPrivateIPv4(hostname)) throw new SsrfBlockedError(`Refusing to fetch a private/internal address: ${hostname}`);
    return;
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(hostname)) throw new SsrfBlockedError(`Refusing to fetch a private/internal address: ${hostname}`);
    return;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SsrfBlockedError(`Refusing to fetch localhost`);
  }

  // A public-looking hostname can still resolve to a private address -
  // check every real DNS answer, not just the hostname string.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch (err) {
    throw new SsrfBlockedError(`Could not resolve ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIPv4(address)) {
      throw new SsrfBlockedError(`Refusing to fetch ${hostname} - resolves to a private address (${address})`);
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new SsrfBlockedError(`Refusing to fetch ${hostname} - resolves to a private address (${address})`);
    }
  }
}
