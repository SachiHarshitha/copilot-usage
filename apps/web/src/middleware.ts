import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * Admin surface guard. Runs on every /admin/** and /api/admin/** request and:
 *
 *  1. Verifies the request arrived through the trusted reverse proxy
 *     (loopback Caddy vhost) by checking a shared secret + marker header.
 *     Anything else gets a flat 404 — we don't want to advertise that the
 *     admin surface exists.
 *  2. Adds defensive response headers so the browser never caches admin
 *     content and search engines never index it.
 *
 * Session and 2FA enforcement happen at the route layer via `requireAdmin`
 * (see apps/web/src/lib/admin/requireAdmin.ts). This middleware is the
 * outermost ring — purely network/transport guard.
 *
 * Bypass for local development: set `ADMIN_NETWORK_GUARD=disabled`. The bypass
 * must be opt-in so a misconfigured production deploy fails closed.
 */

const ADMIN_PATH_PATTERN = /^\/(?:admin|api\/admin)(?:\/|$)/;
const TRUSTED_PROXY_HEADER = 'x-internal-source';
const TRUSTED_PROXY_VALUE = 'admin-loopback';
const PROXY_SECRET_HEADER = 'x-internal-proxy-secret';
const NETWORK_GUARD_DISABLED = 'disabled';

const HARDENING_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function applyHardeningHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(HARDENING_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

/** Constant-time compare; returns false on length mismatch instead of throwing. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function middleware(req: NextRequest): NextResponse {
  if (!ADMIN_PATH_PATTERN.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (process.env.ADMIN_NETWORK_GUARD !== NETWORK_GUARD_DISABLED) {
    const expectedSecret = process.env.ADMIN_INTERNAL_PROXY_SECRET;
    if (!expectedSecret) {
      // Fail closed if the operator forgot to provision the secret.
      return new NextResponse('Not Found', { status: 404 });
    }
    const sourceHeader = req.headers.get(TRUSTED_PROXY_HEADER) ?? '';
    const secretHeader = req.headers.get(PROXY_SECRET_HEADER) ?? '';
    if (
      sourceHeader !== TRUSTED_PROXY_VALUE ||
      !safeEqual(secretHeader, expectedSecret)
    ) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  return applyHardeningHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
