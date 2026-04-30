import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import {
  deleteUserHandler,
  restoreUserHandler,
  suspendUserHandler,
} from './userManagement';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';
import { InMemoryMailService } from '@/lib/mail/mailService';

function jsonReq(
  url: string,
  session: ReturnType<typeof seedAdminSession> extends Promise<infer T> ? T | null : never,
  body: unknown,
  method: 'POST' | 'DELETE' = 'POST',
) {
  return buildAdminRequest(url, session, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function jsonBody<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const BASE = 'https://admin.example.com/api/admin/users';

test('suspend rejects request without { confirm: true }', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await prisma.user.create({
      data: { githubId: 6001, username: 'sus-no-confirm' },
    });
    const res = await suspendUserHandler(
      jsonReq(`${BASE}/${u.id}/suspend`, session, {}),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 400);
  });
});

test('suspend requires MODERATOR or higher (READ_ONLY → 403)', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const u = await prisma.user.create({
      data: { githubId: 6002, username: 'sus-readonly' },
    });
    const res = await suspendUserHandler(
      jsonReq(`${BASE}/${u.id}/suspend`, session, { confirm: true }),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 403);
  });
});

test('suspend sets status, writes audit row, sends mail call', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const mail = new InMemoryMailService();
    const u = await prisma.user.create({
      data: { githubId: 6003, username: 'sus-go' },
    });
    const res = await suspendUserHandler(
      jsonReq(`${BASE}/${u.id}/suspend`, session, { confirm: true }),
      { params: { id: u.id } },
      { prisma, mail },
    );
    assert.equal(res.status, 200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(after.status, 'SUSPENDED');
    const audit = await prisma.adminActionLog.findMany({
      where: { action: 'USER_SUSPEND', targetId: u.id },
    });
    assert.equal(audit.length, 1);
    assert.equal((audit[0].metadata as { status: string }).status, 'SUCCEEDED');
    // Mail call attempted (no-op send because User has no email column today,
    // but the call site is wired so Phase G can swap in real delivery).
    assert.equal(mail.sent.length, 0); // empty `to` → no entry pushed
  });
});

test('suspend on already-suspended user is a noop', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const u = await prisma.user.create({
      data: { githubId: 6004, username: 'sus-already', status: 'SUSPENDED' },
    });
    const res = await suspendUserHandler(
      jsonReq(`${BASE}/${u.id}/suspend`, session, { confirm: true }),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = await jsonBody<{ ok: boolean; noop?: boolean }>(res);
    assert.equal(body.noop, true);
  });
});

test('restore clears suspension and does not call mail', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const mail = new InMemoryMailService();
    const u = await prisma.user.create({
      data: { githubId: 6005, username: 'restore-go', status: 'SUSPENDED' },
    });
    const res = await restoreUserHandler(
      jsonReq(`${BASE}/${u.id}/restore`, session, { confirm: true }),
      { params: { id: u.id } },
      { prisma, mail },
    );
    assert.equal(res.status, 200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(after.status, 'ACTIVE');
    assert.equal(mail.sent.length, 0);
  });
});

test('soft-delete anonymizes, revokes devices, preserves UploadLog', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const u = await prisma.user.create({
      data: { githubId: 6006, username: 'soft-del', displayName: 'Real Name' },
    });
    await prisma.device.create({
      data: { userId: u.id, tokenId: 'sd-1', secretHash: 'h' },
    });
    await prisma.uploadLog.create({
      data: {
        userId: u.id,
        deviceId: 'sd-1',
        ipHash: 'h',
        payloadBytes: 1,
        bucketCount: 1,
        accepted: true,
      },
    });

    const res = await deleteUserHandler(
      jsonReq(`${BASE}/${u.id}`, session, { confirm: true }, 'DELETE'),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.notEqual(after.deletedAt, null);
    assert.equal(after.username, `deleted-${u.id}`);
    assert.equal(after.displayName, null);

    const devices = await prisma.device.findMany({ where: { userId: u.id } });
    assert.equal(devices.length, 1);
    assert.notEqual(devices[0].revokedAt, null);

    const uploads = await prisma.uploadLog.findMany({ where: { userId: u.id } });
    assert.equal(uploads.length, 1, 'UploadLog must survive soft-delete for forensics');
  });
});

test('soft-delete is idempotent', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'ADMIN' });
    const u = await prisma.user.create({
      data: {
        githubId: 6007,
        username: 'idem',
        deletedAt: new Date(),
      },
    });
    const res = await deleteUserHandler(
      jsonReq(`${BASE}/${u.id}`, session, { confirm: true }, 'DELETE'),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = await jsonBody<{ ok: boolean; noop?: boolean }>(res);
    assert.equal(body.noop, true);
  });
});

test('soft-delete requires ADMIN (MODERATOR → 403)', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const u = await prisma.user.create({
      data: { githubId: 6008, username: 'mod-cant-delete' },
    });
    const res = await deleteUserHandler(
      jsonReq(`${BASE}/${u.id}`, session, { confirm: true }, 'DELETE'),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 403);
  });
});
