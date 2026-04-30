import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import {
  createBadgeOverrideHandler,
  findActiveBadgeOverride,
  resolveBadgeEligibility,
} from './badgeOverrides';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const URL_BASE = 'https://admin.example.com/api/admin/users';

let nextGithubId = 7_000_000;
async function seedUser(prisma: PrismaClient): Promise<string> {
  const username = `bo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const u = await prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true },
  });
  return u.id;
}

function buildBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

test('resolveBadgeEligibility: returns computed when no override', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    assert.equal(await resolveBadgeEligibility(prisma, userId, true), true);
    assert.equal(await resolveBadgeEligibility(prisma, userId, false), false);
  });
});

test('resolveBadgeEligibility: active override wins over computed', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    await prisma.adminBadgeOverride.create({
      data: { userId, eligible: true, reason: 'comped' },
    });
    assert.equal(await resolveBadgeEligibility(prisma, userId, false), true);
  });
});

test('resolveBadgeEligibility: expired override is ignored', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    await prisma.adminBadgeOverride.create({
      data: {
        userId,
        eligible: true,
        reason: 'expired',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    assert.equal(await resolveBadgeEligibility(prisma, userId, false), false);
  });
});

test('resolveBadgeEligibility: newest row supersedes older row', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    await prisma.adminBadgeOverride.create({
      data: { userId, eligible: true, reason: 'first' },
    });
    // Wait a tick so createdAt differs deterministically.
    await new Promise((r) => setTimeout(r, 5));
    await prisma.adminBadgeOverride.create({
      data: { userId, eligible: false, reason: 'overrule' },
    });
    assert.equal(await resolveBadgeEligibility(prisma, userId, true), false);

    const active = await findActiveBadgeOverride(prisma, userId);
    assert.ok(active);
    assert.equal(active!.reason, 'overrule');
  });
});

test('createBadgeOverride: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, null, buildBody({
        eligible: true, reason: 'x', confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 401);
  });
});

test('createBadgeOverride: 403 for MODERATOR', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true, reason: 'x', confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 403);
  });
});

test('createBadgeOverride: confirm required', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true, reason: 'x',
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'confirm_required');
  });
});

test('createBadgeOverride: eligible must be boolean', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: 'yes', reason: 'x', confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'eligible_required');
  });
});

test('createBadgeOverride: reason required', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true, reason: '   ', confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'reason_required');
  });
});

test('createBadgeOverride: rejects expiresAt in the past', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true,
        reason: 'x',
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'expires_at_in_past');
  });
});

test('createBadgeOverride: rejects malformed expiresAt', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true,
        reason: 'x',
        expiresAt: 'not-a-date',
        confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, 'expires_at_invalid');
  });
});

test('createBadgeOverride: 404 for unknown user', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/missing/badge-override`, session, buildBody({
        eligible: true, reason: 'x', confirm: true,
      })),
      ctx('missing'),
      { prisma },
    );
    assert.equal(res.status, 404);
  });
});

test('createBadgeOverride: persists override + audit row + mirrors verification', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);
    await prisma.userVerification.create({
      data: {
        userId,
        publicBadgeEligible: false,
        githubBillingStatus: 'WARNING' as never,
      },
    });

    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true,
        reason: 'pr cleanup pending',
        expiresAt: expiresAt.toISOString(),
        confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as {
      ok: boolean;
      override: {
        id: string;
        userId: string;
        eligible: boolean;
        reason: string;
        expiresAt: string | null;
      };
    };
    assert.equal(body.ok, true);
    assert.equal(body.override.userId, userId);
    assert.equal(body.override.eligible, true);
    assert.equal(body.override.reason, 'pr cleanup pending');
    assert.equal(body.override.expiresAt, expiresAt.toISOString());

    const stored = await prisma.adminBadgeOverride.findUnique({
      where: { id: body.override.id },
    });
    assert.ok(stored);
    assert.equal(stored!.createdById, session.adminId);

    const updated = await prisma.userVerification.findUnique({ where: { userId } });
    assert.equal(updated!.publicBadgeEligible, true);

    const audit = await prisma.adminActionLog.findFirst({
      where: { action: 'BADGE_OVERRIDE_CREATE', targetId: userId },
    });
    assert.ok(audit);
    assert.deepEqual(audit!.before as object, { publicBadgeEligible: false });
    assert.deepEqual(audit!.after as object, { publicBadgeEligible: true });
  });
});

test('createBadgeOverride: skips verification mirror when row absent', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const userId = await seedUser(prisma);

    const res = await createBadgeOverrideHandler(
      buildAdminRequest(`${URL_BASE}/${userId}/badge-override`, session, buildBody({
        eligible: true, reason: 'no row yet', confirm: true,
      })),
      ctx(userId),
      { prisma },
    );
    assert.equal(res.status, 201);

    const verification = await prisma.userVerification.findUnique({ where: { userId } });
    assert.equal(verification, null);

    // resolveBadgeEligibility still surfaces the override.
    assert.equal(await resolveBadgeEligibility(prisma, userId, false), true);
  });
});
