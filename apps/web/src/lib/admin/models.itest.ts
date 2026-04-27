import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { Prisma } from '@prisma/client';

import { withTestDb } from '../test/withTestDb';

function uniq(prefix = 'admin'): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

test('AdminUser persists with default READ_ONLY role and unique email', async () => {
  await withTestDb(async ({ prisma }) => {
    const email = `${uniq()}@example.com`;
    const created = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: 'bcrypt$placeholder',
      },
    });
    assert.equal(created.role, 'READ_ONLY');
    assert.equal(created.email, email);
    assert.equal(created.failedLoginCount, 0);
    assert.equal(created.lockedUntil, null);
    assert.equal(created.lastLoginAt, null);
    assert.ok(created.createdAt instanceof Date);

    await assert.rejects(
      () =>
        prisma.adminUser.create({
          data: { email, passwordHash: 'other' },
        }),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    );
  });
});

test('AdminUser supports MODERATOR and ADMIN roles', async () => {
  await withTestDb(async ({ prisma }) => {
    const mod = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h', role: 'MODERATOR' },
    });
    const adm = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h', role: 'ADMIN' },
    });
    assert.equal(mod.role, 'MODERATOR');
    assert.equal(adm.role, 'ADMIN');
  });
});

test('AdminSession requires unique tokenHash and cascades on AdminUser delete', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h' },
    });
    const tokenHash = randomBytes(32).toString('hex');
    await prisma.adminSession.create({
      data: {
        adminUserId: admin.id,
        tokenHash,
        idleExpiresAt: new Date(Date.now() + 30 * 60_000),
        absoluteExpiresAt: new Date(Date.now() + 8 * 3600_000),
        ipHash: 'sha256:example',
        userAgentHash: 'sha256:example',
      },
    });

    await assert.rejects(
      () =>
        prisma.adminSession.create({
          data: {
            adminUserId: admin.id,
            tokenHash,
            idleExpiresAt: new Date(),
            absoluteExpiresAt: new Date(),
          },
        }),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    );

    await prisma.adminUser.delete({ where: { id: admin.id } });
    assert.equal(await prisma.adminSession.count({ where: { adminUserId: admin.id } }), 0);
  });
});

test('AdminTotpSecret enforces one-per-admin and cascades on delete', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h' },
    });
    await prisma.adminTotpSecret.create({
      data: {
        adminUserId: admin.id,
        encryptedSecret: 'v1:iv:tag:ct',
      },
    });

    // 1:1 relation — second create on same adminUserId must fail unique constraint
    await assert.rejects(
      () =>
        prisma.adminTotpSecret.create({
          data: { adminUserId: admin.id, encryptedSecret: 'v1:iv:tag:ct2' },
        }),
      (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002',
    );

    await prisma.adminUser.delete({ where: { id: admin.id } });
    assert.equal(await prisma.adminTotpSecret.count({ where: { adminUserId: admin.id } }), 0);
  });
});

test('AdminRecoveryCode allows many per admin and tracks usedAt', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h' },
    });
    for (let i = 0; i < 10; i += 1) {
      await prisma.adminRecoveryCode.create({
        data: { adminUserId: admin.id, codeHash: `bcrypt$${i}` },
      });
    }
    assert.equal(await prisma.adminRecoveryCode.count({ where: { adminUserId: admin.id } }), 10);

    const first = await prisma.adminRecoveryCode.findFirst({ where: { adminUserId: admin.id } });
    assert.ok(first);
    const consumed = await prisma.adminRecoveryCode.update({
      where: { id: first.id },
      data: { usedAt: new Date() },
    });
    assert.ok(consumed.usedAt instanceof Date);

    await prisma.adminUser.delete({ where: { id: admin.id } });
    assert.equal(await prisma.adminRecoveryCode.count({ where: { adminUserId: admin.id } }), 0);
  });
});

test('AdminActionLog stores append-only entries and survives admin deletion', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: `${uniq()}@example.com`, passwordHash: 'h' },
    });
    const entry = await prisma.adminActionLog.create({
      data: {
        adminUserId: admin.id,
        adminEmailHash: 'sha256:example',
        action: 'user.suspend',
        targetType: 'User',
        targetId: 'user-id',
        ipHash: 'sha256:example',
        userAgentHash: 'sha256:example',
        before: { suspended: false },
        after: { suspended: true },
        metadata: { reason: 'abuse' },
      },
    });
    assert.equal(entry.action, 'user.suspend');
    assert.ok(entry.createdAt instanceof Date);

    // SetNull on admin delete: log row remains but adminUserId becomes null
    await prisma.adminUser.delete({ where: { id: admin.id } });
    const after = await prisma.adminActionLog.findUnique({ where: { id: entry.id } });
    assert.ok(after);
    assert.equal(after.adminUserId, null);
    assert.equal(after.adminEmailHash, 'sha256:example');
  });
});
