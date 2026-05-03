import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/db';
import {
  AuthError,
  loginWithPassword,
  logout as logoutAction,
  setupTwoFactor as setupTwoFactorAction,
  confirmTwoFactor as confirmTwoFactorAction,
  verifyTwoFactor as verifyTwoFactorAction,
  verifyRecoveryCode as verifyRecoveryCodeAction,
} from './loginActions';
import {
  ADMIN_AUTH_EMAIL_LIMIT_PER_MINUTE,
  ADMIN_AUTH_IP_LIMIT_PER_MINUTE,
  adminAuthRateLimiter,
} from './rateLimit';
import {
  getClientIpFromHeaders,
  hashIp,
  hashUserAgent,
} from './clientFingerprint';
import {
  ADMIN_SESSION_COOKIE_NAME,
  clearSessionCookie,
  serializeSessionCookie,
} from '../sessionCookie';
import { IDLE_TIMEOUT_MS } from '../session';

/**
 * Per-route rate-limit + body-parsing scaffolding shared by every admin auth
 * handler. Returns a typed result so handlers can short-circuit cleanly.
 */
async function withRateLimit(
  req: NextRequest,
  emailKey: string | null,
): Promise<{ ok: true; ipHash: string | null; userAgentHash: string | null } | NextResponse> {
  const ip = getClientIpFromHeaders(req.headers);
  const ipBudget = adminAuthRateLimiter.consume({
    key: `ip:${ip}`,
    perMinute: ADMIN_AUTH_IP_LIMIT_PER_MINUTE,
  });
  if (!ipBudget.allowed) {
    return tooManyRequests(ipBudget.retryAfterSeconds);
  }
  if (emailKey) {
    const emailBudget = adminAuthRateLimiter.consume({
      key: `email:${emailKey}`,
      perMinute: ADMIN_AUTH_EMAIL_LIMIT_PER_MINUTE,
    });
    if (!emailBudget.allowed) {
      return tooManyRequests(emailBudget.retryAfterSeconds);
    }
  }
  return {
    ok: true,
    ipHash: hashIp(ip),
    userAgentHash: hashUserAgent(req.headers.get('user-agent')),
  };
}

function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: 'rate_limited', retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function readSessionCookie(req: NextRequest): string {
  return req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? '';
}

function authErrorToStatus(err: AuthError): number {
  switch (err.code) {
    case 'invalid_session':
      return 401;
    case 'totp_already_confirmed':
    case 'totp_not_setup':
      return 409;
    case 'invalid_code':
      return 401;
    default:
      return 400;
  }
}

/** POST /api/admin/auth/login */
export async function loginHandler(req: NextRequest): Promise<NextResponse> {
  const body = (await readJson(req)) ?? {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const guard = await withRateLimit(req, email || null);
  if (guard instanceof NextResponse) return guard;

  if (!email || !password) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 400 });
  }
  const result = await loginWithPassword(prisma, {
    email,
    password,
    ipHash: guard.ipHash,
    userAgentHash: guard.userAgentHash,
  });
  if (!result.ok) {
    if (result.reason === 'account_locked') {
      return NextResponse.json(
        { error: 'account_locked', retryAfterSeconds: result.retryAfterSeconds },
        { status: 423 },
      );
    }
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const res = NextResponse.json({ requires2fa: result.requires2fa }, { status: 200 });
  res.headers.append(
    'Set-Cookie',
    serializeSessionCookie(result.token, { maxAgeSeconds: Math.floor(IDLE_TIMEOUT_MS / 1000) }),
  );
  return res;
}

/** POST /api/admin/auth/logout */
export async function logoutHandler(req: NextRequest): Promise<NextResponse> {
  const guard = await withRateLimit(req, null);
  if (guard instanceof NextResponse) return guard;
  const token = readSessionCookie(req);
  await logoutAction(prisma, token, {
    ipHash: guard.ipHash,
    userAgentHash: guard.userAgentHash,
  });
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.headers.append('Set-Cookie', clearSessionCookie());
  return res;
}

/** POST /api/admin/auth/2fa/setup */
export async function setupTwoFactorHandler(req: NextRequest): Promise<NextResponse> {
  const guard = await withRateLimit(req, null);
  if (guard instanceof NextResponse) return guard;
  const token = readSessionCookie(req);
  try {
    const setup = await setupTwoFactorAction(prisma, token, {
      ipHash: guard.ipHash,
      userAgentHash: guard.userAgentHash,
    });
    return NextResponse.json(setup, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: authErrorToStatus(err) });
    }
    throw err;
  }
}

/** POST /api/admin/auth/2fa/confirm */
export async function confirmTwoFactorHandler(req: NextRequest): Promise<NextResponse> {
  const guard = await withRateLimit(req, null);
  if (guard instanceof NextResponse) return guard;
  const body = (await readJson(req)) ?? {};
  // Accept either `code` (canonical) or `recoveryCode` (sent by the verify
  // page UI). Without this, the recovery flow silently submits an empty
  // string and always fails. See launch-readiness-gap-analysis.md (P1-C).
  const code =
    typeof body.code === 'string'
      ? body.code
      : typeof body.recoveryCode === 'string'
        ? body.recoveryCode
        : '';
  const token = readSessionCookie(req);
  try {
    const result = await confirmTwoFactorAction(prisma, token, code, {
      ipHash: guard.ipHash,
      userAgentHash: guard.userAgentHash,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: authErrorToStatus(err) });
    }
    throw err;
  }
}

/** POST /api/admin/auth/2fa/verify */
export async function verifyTwoFactorHandler(req: NextRequest): Promise<NextResponse> {
  const guard = await withRateLimit(req, null);
  if (guard instanceof NextResponse) return guard;
  const body = (await readJson(req)) ?? {};
  const code = typeof body.code === 'string' ? body.code : '';
  const token = readSessionCookie(req);
  try {
    await verifyTwoFactorAction(prisma, token, code, {
      ipHash: guard.ipHash,
      userAgentHash: guard.userAgentHash,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: authErrorToStatus(err) });
    }
    throw err;
  }
}

/** POST /api/admin/auth/recovery-code */
export async function recoveryCodeHandler(req: NextRequest): Promise<NextResponse> {
  const guard = await withRateLimit(req, null);
  if (guard instanceof NextResponse) return guard;
  const body = (await readJson(req)) ?? {};
  // Accept both `code` (canonical) and `recoveryCode` (legacy client field) so
  // recovery-code login from /admin/login/verify works end-to-end.
  const code =
    typeof body.code === 'string'
      ? body.code
      : typeof body.recoveryCode === 'string'
        ? body.recoveryCode
        : '';
  const token = readSessionCookie(req);
  try {
    const result = await verifyRecoveryCodeAction(prisma, token, code, {
      ipHash: guard.ipHash,
      userAgentHash: guard.userAgentHash,
    });
    return NextResponse.json({ ok: true, remaining: result.remaining }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.code }, { status: authErrorToStatus(err) });
    }
    throw err;
  }
}
