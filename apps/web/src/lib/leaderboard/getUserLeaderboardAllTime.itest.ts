import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import {
  USER_LEADERBOARD_PAGE_SIZE,
  getUserLeaderboardAllTime,
} from './getUserLeaderboardAllTime';

/**
 * Phase 0 baseline characterization for GET /api/leaderboard (all-time path).
 *
 * Locks in the current privacy filter (`userPubliclyVisibleWhere()`) so any
 * Phase 1+ schema change that accidentally exposes deleted, suspended, or
 * non-public users in the leaderboard makes these tests fail loudly.
 */

test('getUserLeaderboardAllTime returns only ACTIVE + non-deleted + profilePublic users, ordered by tokens desc', async () => {
  await withTestDb(async ({ prisma }) => {
    // Public user — must appear.
    await prisma.user.create({
      data: {
        githubId: 90001,
        username: 'lb-public-1',
        profilePublic: true,
        status: 'ACTIVE',
        avatarUrl: 'https://avatars/1',
        userStat: { create: { totalTokens: 1000n, premiumRequests: 10 } },
      },
    });
    // Public user with smaller totals — must appear after the first.
    await prisma.user.create({
      data: {
        githubId: 90002,
        username: 'lb-public-2',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 500n, premiumRequests: 50 } },
      },
    });
    // Private profile — MUST be hidden.
    await prisma.user.create({
      data: {
        githubId: 90003,
        username: 'lb-private',
        profilePublic: false,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 9_999n } },
      },
    });
    // Suspended — MUST be hidden.
    await prisma.user.create({
      data: {
        githubId: 90004,
        username: 'lb-suspended',
        profilePublic: true,
        status: 'SUSPENDED',
        userStat: { create: { totalTokens: 9_999n } },
      },
    });
    // Soft-deleted — MUST be hidden.
    await prisma.user.create({
      data: {
        githubId: 90005,
        username: 'lb-deleted',
        profilePublic: true,
        status: 'ACTIVE',
        deletedAt: new Date('2025-01-01T00:00:00Z'),
        userStat: { create: { totalTokens: 9_999n } },
      },
    });

    const entries = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    const usernames = entries.map((e) => e.username);
    assert.deepEqual(usernames, ['lb-public-1', 'lb-public-2'], 'only public ACTIVE users');
    assert.equal(entries[0].rank, 1);
    assert.equal(entries[0].totalTokens, '1000');
    assert.equal(entries[1].rank, 2);
    assert.equal(entries[1].totalTokens, '500');
  });
});

test('getUserLeaderboardAllTime entry shape is the documented contract', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 90010,
        username: 'lb-shape',
        profilePublic: true,
        status: 'ACTIVE',
        avatarUrl: 'https://avatars/lb-shape',
        userStat: {
          create: {
            totalTokens: 7n,
            premiumRequests: 1,
            totalRequests: 2,
            currentStreakDays: 3,
            rolling30DayTokens: 4n,
            topModel: 'gpt-4',
            workspaceCount: 5,
          },
        },
      },
    });

    const [entry] = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    assert.deepEqual(
      Object.keys(entry).sort(),
      [
        'avatarUrl',
        'currentStreakDays',
        'premiumRequests',
        'rank',
        'rolling30DayTokens',
        'topModel',
        'totalRequests',
        'totalTokens',
        'username',
        'workspaceCount',
      ],
    );
    assert.equal(entry.totalTokens, '7');
    assert.equal(entry.rolling30DayTokens, '4');
    assert.equal(entry.avatarUrl, 'https://avatars/lb-shape');
  });
});

test('getUserLeaderboardAllTime sort=premium orders by premiumRequests desc', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 90020,
        username: 'lb-prem-low',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 100n, premiumRequests: 1 } },
      },
    });
    await prisma.user.create({
      data: {
        githubId: 90021,
        username: 'lb-prem-high',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 1n, premiumRequests: 99 } },
      },
    });

    const entries = await getUserLeaderboardAllTime({ sort: 'premium', page: 1 }, prisma);
    assert.equal(entries[0].username, 'lb-prem-high');
    assert.equal(entries[1].username, 'lb-prem-low');
  });
});

test('getUserLeaderboardAllTime page size constant matches existing /api/leaderboard contract', () => {
  assert.equal(USER_LEADERBOARD_PAGE_SIZE, 25);
});
