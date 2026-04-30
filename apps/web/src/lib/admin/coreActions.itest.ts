import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import {
  restoreUserCore,
  softDeleteUserCore,
  suspendUserCore,
  type AdminActor,
} from './userManagement';
import { revokeDeviceCore } from './deviceManagement';
import { InMemoryMailService } from '@/lib/mail/mailService';

const actor: AdminActor = {
  id: 'admin-core-1',
  email: 'core@example.test',
  role: 'ADMIN',
};

test('suspendUserCore + restoreUserCore round-trip with audit rows', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: {
        id: actor.id,
        email: actor.email,
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    const u = await prisma.user.create({
      data: { githubId: 8001, username: 'core-suspend' },
    });

    const mail = new InMemoryMailService();
    const r1 = await suspendUserCore(prisma, actor, u.id, mail);
    assert.equal(r1.ok, true);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status, 'SUSPENDED');

    const r2 = await suspendUserCore(prisma, actor, u.id, mail);
    assert.equal(r2.noop, true);

    const r3 = await restoreUserCore(prisma, actor, u.id);
    assert.equal(r3.ok, true);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).status, 'ACTIVE');

    const audit = await prisma.adminActionLog.findMany({
      where: { targetId: u.id, metadata: { path: ['status'], equals: 'SUCCEEDED' } },
      orderBy: { createdAt: 'asc' },
    });
    const actions = audit.map((a) => a.action);
    assert.deepEqual(actions, ['USER_SUSPEND', 'USER_RESTORE']);
  });
});

test('softDeleteUserCore is idempotent and revokes devices', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: {
        id: 'admin-core-del',
        email: 'del@example.test',
        passwordHash: 'x',
        role: 'ADMIN',
      },
    });
    const u = await prisma.user.create({
      data: { githubId: 8002, username: 'core-del' },
    });
    await prisma.device.create({
      data: { userId: u.id, tokenId: 'core-del-1', secretHash: 'h' },
    });

    const r1 = await softDeleteUserCore(
      prisma,
      { id: 'admin-core-del', email: 'del@example.test', role: 'ADMIN' },
      u.id,
    );
    assert.equal(r1.ok, true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.notEqual(after.deletedAt, null);
    assert.equal(after.username, `deleted-${u.id}`);

    const dev = await prisma.device.findFirstOrThrow({ where: { userId: u.id } });
    assert.notEqual(dev.revokedAt, null);

    const r2 = await softDeleteUserCore(
      prisma,
      { id: 'admin-core-del', email: 'del@example.test', role: 'ADMIN' },
      u.id,
    );
    assert.equal(r2.noop, true);
  });
});

test('suspendUserCore throws on missing user; restoreUserCore throws on deleted', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: { id: 'a-throw', email: 't@example.test', passwordHash: 'x', role: 'ADMIN' },
    });
    const a: AdminActor = { id: 'a-throw', email: 't@example.test', role: 'ADMIN' };

    await assert.rejects(
      () => suspendUserCore(prisma, a, 'no-such-id'),
      /user_not_found/,
    );

    const u = await prisma.user.create({
      data: { githubId: 8003, username: 'core-deleted', deletedAt: new Date() },
    });
    await assert.rejects(() => restoreUserCore(prisma, a, u.id), /user_deleted/);
  });
});

test('revokeDeviceCore revokes and audits last-four; idempotent', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.adminUser.create({
      data: { id: 'a-rev', email: 'rv@example.test', passwordHash: 'x', role: 'MODERATOR' },
    });
    const a: AdminActor = { id: 'a-rev', email: 'rv@example.test', role: 'MODERATOR' };
    const u = await prisma.user.create({ data: { githubId: 8004, username: 'core-rev' } });
    const secretHash = 'fullhashabcdEFGH';
    const d = await prisma.device.create({
      data: { userId: u.id, tokenId: 'core-rev-1', secretHash },
    });

    const mail = new InMemoryMailService();
    const r1 = await revokeDeviceCore(prisma, a, d.id, mail);
    assert.equal(r1.ok, true);
    assert.notEqual(
      (await prisma.device.findUniqueOrThrow({ where: { id: d.id } })).revokedAt,
      null,
    );
    const audit = await prisma.adminActionLog.findFirstOrThrow({
      where: { action: 'DEVICE_REVOKE', targetId: d.id },
    });
    const meta = audit.metadata as { secretHashLastFour: string };
    assert.equal(meta.secretHashLastFour, 'EFGH');
    assert.equal(JSON.stringify(audit.metadata).includes(secretHash), false);

    const r2 = await revokeDeviceCore(prisma, a, d.id, mail);
    assert.equal(r2.noop, true);
  });
});
