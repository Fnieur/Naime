/**
 * SSRF (Server-Side Request Forgery) guard.
 *
 * Validates URLs before making outbound HTTP requests to prevent access to
 * internal networks, cloud metadata endpoints, and non-HTTP protocols.
 *
 * Key protections:
 * - Blocks private/internal IP ranges (RFC 1918, loopback, link-local)
 * - Blocks cloud metadata endpoints (169.254.169.254)
 * - Blocks non-HTTP(S) protocols (file://, ftp://, etc.)
 * - Resolves DNS before validation to prevent DNS rebinding
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ---------------------------------------------------------------------------
// Blocked IP ranges (CIDR-style checks)
// ---------------------------------------------------------------------------

/** Returns true if the IP address belongs to a private or reserved range. */
export function isPrivateIp(ip: string): boolean {
  if (!ip) {
    return true;
  }

  // IPv4 checks
  const parts = ip.split(".");
  if (parts.length === 4) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, includes cloud metadata)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  // ::1 (loopback)
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // fc00::/7 (unique local)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // fe80::/10 (link-local)
  if (lower.startsWith("fe80")) return true;
  // :: (unspecified)
  if (lower === "::") return true;

  return false;
}

/** Specific IPs that must always be blocked (cloud metadata endpoints). */
const BLOCKED_IPS = new Set(["169.254.169.254", "fd00:ec2::254"]);

/** Allowed URL protocols. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Validate a URL for outbound requests. Throws {@link SsrfError} if the URL
 * targets a private/internal resource or uses a disallowed protocol.
 *
 * @param rawUrl - The URL string to validate.
 */
export async function validateUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`invalid URL: ${rawUrl}`);
  }

  // Protocol check
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfError(`protocol not allowed: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new SsrfError("URL has no hostname");
  }

  // Strip IPv6 brackets for net.isIP check
  const cleanHost = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;

  // If the hostname is already an IP literal, validate directly
  if (isIP(cleanHost)) {
    if (isPrivateIp(cleanHost)) {
      throw new SsrfError(`private/internal IP blocked: ${cleanHost}`);
    }
    if (BLOCKED_IPS.has(cleanHost)) {
      throw new SsrfError(`blocked IP address: ${cleanHost}`);
    }
    return;
  }

  // Resolve DNS to prevent DNS rebinding attacks
  try {
    const result = await lookup(hostname, { all: true });
    const addresses = Array.isArray(result) ? result : [result];
    for (const entry of addresses) {
      const addr = typeof entry === "string" ? entry : entry.address;
      if (isPrivateIp(addr)) {
        throw new SsrfError(`hostname ${hostname} resolves to private IP: ${addr}`);
      }
      if (BLOCKED_IPS.has(addr)) {
        throw new SsrfError(`hostname ${hostname} resolves to blocked IP: ${addr}`);
      }
    }
  } catch (err) {
    if (err instanceof SsrfError) {
      throw err;
    }
    throw new SsrfError(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
  }
}
