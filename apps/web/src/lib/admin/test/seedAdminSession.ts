import type { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

import {
  confirmTwoFactor,
  loginWithPassword,
  setupTwoFactor,
} from '../auth/loginActions';
import { hashPassword } from '../password';
import { ADMIN_SESSION_COOKIE_NAME, serializeSessionCookie } from '../sessionCookie';
import { generateTotp } from '../totp';

const STRONG_PW = 'Correct-Horse-Battery-9!';

export interface SeededAdminSession {
  adminId: string;
  email: string;
  token: string;
  cookieHeader: string;
}

/**
 * Seed an admin user and walk it through the full password + TOTP enrollment
 * flow against the supplied test Prisma client. Returns the session token and
 * a ready-to-use Cookie header value, so individual integration tests don't
 * each have to reproduce the auth dance.
 */
export async function seedAdminSession(
  prisma: PrismaClient,
  opts: { email?: string; role?: 'READ_ONLY' | 'MODERATOR' | 'ADMIN' } = {},
): Promise<SeededAdminSession> {
  const email = opts.email ?? `admin-${Date.now()}-${Math.random()}@example.com`;
  const adminUser = await prisma.adminUser.create({
    data: {
      email,
      passwordHash: await hashPassword(STRONG_PW),
      role: opts.role ?? 'ADMIN',
    },
  });

  const login = await loginWithPassword(prisma, {
    email,
    password: STRONG_PW,
    ipHash: null,
    userAgentHash: null,
  });
  if (!login.ok) {
    throw new Error(`seedAdminSession: login failed (${login.reason})`);
  }
  const setup = await setupTwoFactor(prisma, login.token, {
    ipHash: null,
    userAgentHash: null,
  });
  await confirmTwoFactor(prisma, login.token, generateTotp(setup.secret), {
    ipHash: null,
    userAgentHash: null,
  });

  const cookie = serializeSessionCookie(login.token, { maxAgeSeconds: 1800 }).split(';')[0];
  return {
    adminId: adminUser.id,
    email,
    token: login.token,
    cookieHeader: cookie,
  };
}

/**
 * Build a NextRequest whose cookie jar contains the session for the given
 * seeded admin. Pass query params to populate the URL search string.
 */
export function buildAdminRequest(
  url: string,
  session: SeededAdminSession | null,
  init: RequestInit = {},
): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (session) {
    headers.set('cookie', session.cookieHeader);
  }
  // Strip `signal: null` (allowed by lib.dom RequestInit but not by Next's
  // narrower RequestInit). Tests never pass an AbortSignal here.
  const { signal: _signal, ...rest } = init;
  void _signal;
  return new NextRequest(url, { ...rest, headers });
}

export const ADMIN_TEST_COOKIE_NAME = ADMIN_SESSION_COOKIE_NAME;
