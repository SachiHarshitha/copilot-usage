import { createHash } from 'node:crypto';

/**
 * Produce a stable, non-reversible fingerprint of a client IP address. We
 * never store the plaintext IP for an admin event — only the digest, which
 * is enough to compare two visits ("same source") without retaining PII.
 *
 * The salt comes from `ADMIN_FINGERPRINT_SALT` (or the legacy `IP_HASH_SALT`)
 * so that an attacker who exfiltrates `AdminActionLog` rows cannot brute-force
 * the small IPv4 space without also exfiltrating the salt.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;
  return sha256(`${getSalt()}|${trimmed}`);
}

/** Same idea, but for the User-Agent string. */
export function hashUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const trimmed = ua.trim();
  if (!trimmed) return null;
  return sha256(`${getSalt()}|${trimmed}`);
}

/** Hash an email for inclusion in `AdminActionLog.adminEmailHash`. */
export function hashEmail(email: string): string {
  return sha256(`${getSalt()}|email|${email.trim().toLowerCase()}`);
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function getSalt(): string {
  return (
    process.env.ADMIN_FINGERPRINT_SALT ||
    process.env.IP_HASH_SALT ||
    'admin-fingerprint-default-salt'
  );
}

/**
 * Pull the best client IP out of common proxy headers, falling back to
 * `'unknown'` when nothing is present. We trust whatever the reverse proxy
 * sets — for the admin surface that proxy is Caddy on loopback, so the
 * trust boundary is the same machine.
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}
