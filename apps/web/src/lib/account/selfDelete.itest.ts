import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { softDeleteSelfCore } from './selfDelete';

test('softDeleteSelfCore anonymizes the user, revokes devices, invalidates cache tags', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: {
        githubId: 9101,
        username: 'self-del-1',
        displayName: 'Self Del',
        avatarUrl: 'https://avatars.githubusercontent.com/x',
      },
    });
    await prisma.device.create({
      data: { userId: user.id, tokenId: 'self-del-1-tok', secretHash: 'h' },
    });

    const invalidated: string[] = [];
    const result = await softDeleteSelfCore(prisma, user.id, {
      revalidate: (tag) => invalidated.push(tag),
    });

    assert.equal(result.ok, true);
    assert.equal(result.noop, undefined);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.notEqual(after.deletedAt, null);
    assert.equal(after.username, `deleted-${user.id}`);
    assert.equal(after.displayName, null);
    assert.equal(after.avatarUrl, null);

    const privacy = await prisma.privacySettings.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(privacy.profilePublic, false);
    assert.equal(privacy.leaderboardOptIn, false);
    assert.equal(privacy.badgesEnabled, false);

    const dev = await prisma.device.findFirstOrThrow({ where: { userId: user.id } });
    assert.notEqual(dev.revokedAt, null);

    // Cache tags: per-user id, per-user badges, per-username badges, leaderboard
    assert.deepEqual(invalidated, [
      `user:${user.id}`,
      `user:${user.id}:badges`,
      `username:self-del-1:badges`,
      'leaderboard:global',
    ]);

    // Audit row written with adminUserId=null and action=USER_SELF_DELETE
    const audit = await prisma.adminActionLog.findMany({
      where: { targetId: user.id, action: 'USER_SELF_DELETE' },
      orderBy: { createdAt: 'asc' },
    });
    assert.ok(audit.length >= 1);
    for (const row of audit) {
      assert.equal(row.adminUserId, null);
    }
  });
});

test('softDeleteSelfCore is idempotent (no-op on already-deleted user)', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: { githubId: 9102, username: 'self-del-2' },
    });

    const r1 = await softDeleteSelfCore(prisma, user.id, { revalidate: () => {} });
    assert.equal(r1.ok, true);

    const r2 = await softDeleteSelfCore(prisma, user.id, { revalidate: () => {} });
    assert.equal(r2.ok, true);
    assert.equal(r2.noop, true);
  });
});

test('softDeleteSelfCore throws user_not_found for unknown id', async () => {
  await withTestDb(async ({ prisma }) => {
    await assert.rejects(
      () => softDeleteSelfCore(prisma, 'no-such-user', { revalidate: () => {} }),
      /user_not_found/
    );
  });
});
