import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { withTestDb } from '../test/withTestDb';
import { hashPassword } from './password';
import { ADMIN_SESSION_COOKIE_NAME, serializeSessionCookie } from './sessionCookie';
import {
  loginWithPassword,
  setupTwoFactor,
  confirmTwoFactor,
} from './auth/loginActions';
import { generateTotp } from './totp';
import { AdminAuthRequiredError, requireAdmin } from './requireAdmin';

const STRONG_PW = 'Correct-Horse-Battery-9!';

function buildReq(token: string | null): NextRequest {
  const req = new NextRequest('https://admin.example.com/admin', {
    method: 'GET',
    headers: token
      ? { cookie: serializeSessionCookie(token, { maxAgeSeconds: 1800 }).split(';')[0] }
      : {},
  });
  return req;
}

test('requireAdmin throws 401 when no session cookie is present', async () => {
  await withTestDb(async ({ prisma }) => {
    await assert.rejects(requireAdmin(buildReq(null), { prisma }), AdminAuthRequiredError);
  });
});

test('requireAdmin throws 401 for half-authenticated (no 2FA) sessions', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: {
        email: 'half@example.com',
        passwordHash: await hashPassword(STRONG_PW),
      },
    });
    const login = await loginWithPassword(prisma, {
      email: 'half@example.com',
      password: STRONG_PW,
      ipHash: null,
      userAgentHash: null,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    await assert.rejects(requireAdmin(buildReq(login.token), { prisma }), AdminAuthRequiredError);
  });
});

test('requireAdmin returns the admin for fully-authenticated sessions', async () => {
  await withTestDb(async ({ prisma }) => {
    const created = await prisma.adminUser.create({
      data: {
        email: 'full@example.com',
        passwordHash: await hashPassword(STRONG_PW),
      },
    });
    const login = await loginWithPassword(prisma, {
      email: 'full@example.com',
      password: STRONG_PW,
      ipHash: null,
      userAgentHash: null,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    const setup = await setupTwoFactor(prisma, login.token, {
      ipHash: null,
      userAgentHash: null,
    });
    await confirmTwoFactor(prisma, login.token, generateTotp(setup.secret), {
      ipHash: null,
      userAgentHash: null,
    });
    const admin = await requireAdmin(buildReq(login.token), { prisma });
    assert.equal(admin.id, created.id);
  });
});

test('requireAdmin enforces minRole', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: {
        email: 'reader@example.com',
        passwordHash: await hashPassword(STRONG_PW),
        role: 'READ_ONLY',
      },
    });
    const login = await loginWithPassword(prisma, {
      email: 'reader@example.com',
      password: STRONG_PW,
      ipHash: null,
      userAgentHash: null,
    });
    assert.equal(login.ok, true);
    if (!login.ok) return;
    const setup = await setupTwoFactor(prisma, login.token, {
      ipHash: null,
      userAgentHash: null,
    });
    await confirmTwoFactor(prisma, login.token, generateTotp(setup.secret), {
      ipHash: null,
      userAgentHash: null,
    });
    await assert.rejects(
      requireAdmin(buildReq(login.token), { minRole: 'ADMIN', prisma }),
      (err: unknown) => err instanceof AdminAuthRequiredError && err.status === 403,
    );
  });
});

test('cookie name matches ADMIN_SESSION_COOKIE_NAME', () => {
  assert.equal(ADMIN_SESSION_COOKIE_NAME, '__Host-promptstreak_admin_sid');
});
