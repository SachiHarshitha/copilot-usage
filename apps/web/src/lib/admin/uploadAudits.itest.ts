import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';
import {
  listUploadAuditsHandler,
  type ListUploadAuditsResponse,
} from './uploadAudits';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';

const LIST = 'https://admin.example.com/api/admin/upload-audits';

let nextGithubId = 3_000_000;
async function seedUser(prisma: PrismaClient) {
  const username = `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const u = await prisma.user.create({
    data: { username, displayName: username, githubId: nextGithubId++ },
    select: { id: true },
  });
  return u.id;
}

async function seedAudit(
  prisma: PrismaClient,
  opts: {
    userId: string;
    tokenId?: string | null;
    deviceId?: string | null;
    receivedAt?: Date;
    signatureStatus?: string;
    accepted?: boolean;
    rejectionCode?: string | null;
  },
) {
  return prisma.uploadAudit.create({
    data: {
      userId: opts.userId,
      tokenId: opts.tokenId ?? null,
      deviceId: opts.deviceId ?? null,
      receivedAt: opts.receivedAt ?? new Date(),
      signatureStatus: (opts.signatureStatus ?? 'VALID') as never,
      accepted: opts.accepted ?? true,
      rejectionCode: opts.rejectionCode ?? null,
    },
    select: { id: true },
  });
}

test('upload-audits list: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const res = await listUploadAuditsHandler(buildAdminRequest(LIST, null), { prisma });
    assert.equal(res.status, 401);
  });
});

test('upload-audits list: returns rows newest-first by receivedAt', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const userId = await seedUser(prisma);
    const t0 = new Date('2026-04-01T00:00:00Z');
    await seedAudit(prisma, { userId, receivedAt: t0, tokenId: 'old' });
    await seedAudit(prisma, {
      userId,
      receivedAt: new Date(t0.getTime() + 60_000),
      tokenId: 'mid',
    });
    await seedAudit(prisma, {
      userId,
      receivedAt: new Date(t0.getTime() + 120_000),
      tokenId: 'new',
    });

    const res = await listUploadAuditsHandler(buildAdminRequest(LIST, session), { prisma });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListUploadAuditsResponse;
    assert.equal(body.entries.length, 3);
    assert.equal(body.entries[0].tokenId, 'new');
    assert.equal(body.entries[2].tokenId, 'old');
  });
});

test('upload-audits list: filters by signatureStatus and accepted=false', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    await seedAudit(prisma, { userId, signatureStatus: 'VALID', accepted: true });
    await seedAudit(prisma, {
      userId,
      signatureStatus: 'INVALID',
      accepted: false,
      rejectionCode: 'BAD_SIG',
    });
    await seedAudit(prisma, {
      userId,
      signatureStatus: 'REPLAYED_NONCE',
      accepted: false,
      rejectionCode: 'REPLAY',
    });

    const url = `${LIST}?signatureStatus=INVALID&accepted=false`;
    const res = await listUploadAuditsHandler(buildAdminRequest(url, session), { prisma });
    assert.equal(res.status, 200);
    const body = (await res.json()) as ListUploadAuditsResponse;
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].signatureStatus, 'INVALID');
    assert.equal(body.entries[0].accepted, false);
    assert.equal(body.entries[0].rejectionCode, 'BAD_SIG');
  });
});

test('upload-audits list: filters by tokenId scope', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    await seedAudit(prisma, { userId, tokenId: 'tok-A' });
    await seedAudit(prisma, { userId, tokenId: 'tok-A' });
    await seedAudit(prisma, { userId, tokenId: 'tok-B' });

    const res = await listUploadAuditsHandler(
      buildAdminRequest(`${LIST}?tokenId=tok-A`, session),
      { prisma },
    );
    const body = (await res.json()) as ListUploadAuditsResponse;
    assert.equal(body.entries.length, 2);
    assert.ok(body.entries.every((e) => e.tokenId === 'tok-A'));
  });
});

test('upload-audits list: from/to bounds receivedAt', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-01-01T00:00:00Z'), tokenId: 'before' });
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-02-15T00:00:00Z'), tokenId: 'inside' });
    await seedAudit(prisma, { userId, receivedAt: new Date('2026-03-01T00:00:00Z'), tokenId: 'after' });

    const url = `${LIST}?from=2026-02-01T00:00:00Z&to=2026-03-01T00:00:00Z`;
    const res = await listUploadAuditsHandler(buildAdminRequest(url, session), { prisma });
    const body = (await res.json()) as ListUploadAuditsResponse;
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].tokenId, 'inside');
  });
});

test('upload-audits list: cursor pagination walks rows', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const userId = await seedUser(prisma);
    const t0 = new Date('2026-04-01T00:00:00Z');
    for (let i = 0; i < 5; i++) {
      await seedAudit(prisma, {
        userId,
        receivedAt: new Date(t0.getTime() + i * 60_000),
        tokenId: `t-${i}`,
      });
    }

    const page1Res = await listUploadAuditsHandler(
      buildAdminRequest(`${LIST}?limit=2`, session),
      { prisma },
    );
    const page1 = (await page1Res.json()) as ListUploadAuditsResponse;
    assert.equal(page1.entries.length, 2);
    assert.ok(page1.nextCursor);

    const page2Res = await listUploadAuditsHandler(
      buildAdminRequest(`${LIST}?limit=2&cursor=${page1.nextCursor}`, session),
      { prisma },
    );
    const page2 = (await page2Res.json()) as ListUploadAuditsResponse;
    assert.equal(page2.entries.length, 2);
    const allIds = [...page1.entries, ...page2.entries].map((e) => e.id);
    assert.equal(new Set(allIds).size, 4, 'cursor pages must not overlap');
  });
});
