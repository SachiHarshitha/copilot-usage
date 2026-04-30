/**
 * Cookie name and serialization for the admin session token.
 *
 * The `__Host-` prefix forces the browser to require: Secure flag, no Domain
 * attribute, and Path=/. This blocks subdomain-based cookie injection and
 * matches the threat model in docs/promptstreak-admin-implementation-plan.md.
 *
 * SameSite=Strict prevents the cookie from riding along on any cross-site
 * navigation — admin pages should never be reached from a third-party link.
 */
export const ADMIN_SESSION_COOKIE_NAME = '__Host-promptstreak_admin_sid';

interface SerializeOptions {
  /** Cookie lifetime in seconds. Use the session's idle window. */
  maxAgeSeconds: number;
}

const STATIC_FLAGS = 'Path=/; HttpOnly; Secure; SameSite=Strict';

/**
 * Serialize an admin session cookie. The token is URL-encoded so a malicious
 * value can never break out of the cookie value into a separate attribute or
 * a fresh header line.
 */
export function serializeSessionCookie(token: string, opts: SerializeOptions): string {
  const safeToken = encodeURIComponent(token);
  return `${ADMIN_SESSION_COOKIE_NAME}=${safeToken}; ${STATIC_FLAGS}; Max-Age=${opts.maxAgeSeconds}`;
}

/**
 * Build a cookie that immediately expires the existing admin session cookie.
 * Flags must match {@link serializeSessionCookie} so the browser overwrites
 * the original entry rather than creating a sibling.
 */
export function clearSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE_NAME}=; ${STATIC_FLAGS}; Max-Age=0`;
}
