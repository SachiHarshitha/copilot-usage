import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import {
  listUserDevicesHandler,
  revokeDeviceHandler,
  type DeviceListEntry,
} from './deviceManagement';
import { buildAdminRequest, seedAdminSession } from './test/seedAdminSession';
import { InMemoryMailService } from '@/lib/mail/mailService';

const ADMIN_USERS = 'https://admin.example.com/api/admin/users';
const ADMIN_DEVICES = 'https://admin.example.com/api/admin/devices';

function postReq(
  url: string,
  session: Awaited<ReturnType<typeof seedAdminSession>> | null,
  body: unknown,
) {
  return buildAdminRequest(url, session, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('list devices: 401 without session', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 7001, username: 'dev-list-anon' },
    });
    const res = await listUserDevicesHandler(
      buildAdminRequest(`${ADMIN_USERS}/${u.id}/devices`, null),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 401);
  });
});

test('list devices: 404 for missing user', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const res = await listUserDevicesHandler(
      buildAdminRequest(`${ADMIN_USERS}/missing/devices`, session),
      { params: { id: 'missing' } },
      { prisma },
    );
    assert.equal(res.status, 404);
  });
});

test('list devices: returns active and revoked, never the secretHash', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await prisma.user.create({
      data: { githubId: 7002, username: 'dev-list' },
    });
    await prisma.device.createMany({
      data: [
        { userId: u.id, tokenId: 'tk-active', secretHash: 'AAAAabcd' },
        {
          userId: u.id,
          tokenId: 'tk-revoked',
          secretHash: 'BBBBwxyz',
          revokedAt: new Date(),
        },
      ],
    });

    const res = await listUserDevicesHandler(
      buildAdminRequest(`${ADMIN_USERS}/${u.id}/devices`, session),
      { params: { id: u.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { entries: DeviceListEntry[] };
    assert.equal(body.entries.length, 2);
    const tokenIds = body.entries.map((e) => e.tokenId).sort();
    assert.deepEqual(tokenIds, ['tk-active', 'tk-revoked']);
    // No secretHash field surfaced.
    const raw = JSON.stringify(body);
    assert.equal(raw.includes('secretHash'), false);
    assert.equal(raw.includes('AAAA'), false);
    assert.equal(raw.includes('BBBB'), false);
  });
});

test('revoke device: requires { confirm: true }', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await prisma.user.create({
      data: { githubId: 7003, username: 'dev-confirm' },
    });
    const d = await prisma.device.create({
      data: { userId: u.id, tokenId: 'rk-1', secretHash: 'hashAAAA' },
    });
    const res = await revokeDeviceHandler(
      postReq(`${ADMIN_DEVICES}/${d.id}/revoke`, session, {}),
      { params: { deviceId: d.id } },
      { prisma },
    );
    assert.equal(res.status, 400);
  });
});

test('revoke device: READ_ONLY admin → 403', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'READ_ONLY' });
    const u = await prisma.user.create({
      data: { githubId: 7004, username: 'dev-readonly' },
    });
    const d = await prisma.device.create({
      data: { userId: u.id, tokenId: 'rk-2', secretHash: 'hashBBBB' },
    });
    const res = await revokeDeviceHandler(
      postReq(`${ADMIN_DEVICES}/${d.id}/revoke`, session, { confirm: true }),
      { params: { deviceId: d.id } },
      { prisma },
    );
    assert.equal(res.status, 403);
  });
});

test('revoke device: success sets revokedAt, audits last-four of secretHash, mail call attempted', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma, { role: 'MODERATOR' });
    const mail = new InMemoryMailService();
    const u = await prisma.user.create({
      data: { githubId: 7005, username: 'dev-go' },
    });
    const secretHash = 'verylonghashtail9X3z';
    const d = await prisma.device.create({
      data: { userId: u.id, tokenId: 'rk-3', secretHash },
    });
    const res = await revokeDeviceHandler(
      postReq(`${ADMIN_DEVICES}/${d.id}/revoke`, session, { confirm: true }),
      { params: { deviceId: d.id } },
      { prisma, mail },
    );
    assert.equal(res.status, 200);

    const after = await prisma.device.findUniqueOrThrow({ where: { id: d.id } });
    assert.notEqual(after.revokedAt, null);

    const audit = await prisma.adminActionLog.findMany({
      where: { action: 'DEVICE_REVOKE', targetId: d.id },
    });
    assert.equal(audit.length, 1);
    const meta = audit[0].metadata as {
      status: string;
      secretHashLastFour: string;
      tokenId: string;
    };
    assert.equal(meta.status, 'SUCCEEDED');
    assert.equal(meta.secretHashLastFour, secretHash.slice(-4));
    assert.equal(meta.tokenId, 'rk-3');
    // The full hash must not appear in audit metadata.
    assert.equal(JSON.stringify(audit[0].metadata).includes(secretHash), false);

    // mail.send was invoked with empty `to` so InMemoryMailService records nothing.
    assert.equal(mail.sent.length, 0);
  });
});

test('revoke device: idempotent on already-revoked', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const u = await prisma.user.create({
      data: { githubId: 7006, username: 'dev-idem' },
    });
    const d = await prisma.device.create({
      data: {
        userId: u.id,
        tokenId: 'rk-4',
        secretHash: 'hashCCCC',
        revokedAt: new Date(),
      },
    });
    const res = await revokeDeviceHandler(
      postReq(`${ADMIN_DEVICES}/${d.id}/revoke`, session, { confirm: true }),
      { params: { deviceId: d.id } },
      { prisma },
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; noop?: boolean };
    assert.equal(body.noop, true);
  });
});

test('revoke device: 404 for missing device', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    const res = await revokeDeviceHandler(
      postReq(`${ADMIN_DEVICES}/nope/revoke`, session, { confirm: true }),
      { params: { deviceId: 'nope' } },
      { prisma },
    );
    assert.equal(res.status, 404);
  });
});
