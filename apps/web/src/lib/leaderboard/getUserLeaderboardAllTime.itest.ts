import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import {
  USER_LEADERBOARD_PAGE_SIZE,
  getUserLeaderboardAllTime,
} from './getUserLeaderboardAllTime';

async function seedUserUsage(
  prisma: Parameters<Parameters<typeof withTestDb>[0]>[0]['prisma'],
  params: {
    githubId: number;
    username: string;
    status?: 'ACTIVE' | 'SUSPENDED';
    deletedAt?: Date;
    avatarUrl?: string;
    profilePublic?: boolean;
    leaderboardOptIn?: boolean;
    rows: Array<{
      date?: Date;
      totalTokens: bigint;
      requestCount: number;
      premiumRequests?: number;
      modelId?: string;
      repoIdentity?: string;
    }>;
  },
) {
  const user = await prisma.user.create({
    data: {
      githubId: params.githubId,
      username: params.username,
      status: params.status ?? 'ACTIVE',
      deletedAt: params.deletedAt,
      avatarUrl: params.avatarUrl,
      privacySettings:
        params.profilePublic === undefined && params.leaderboardOptIn === undefined
          ? undefined
          : {
              create: {
                profilePublic: params.profilePublic ?? false,
                leaderboardOptIn: params.leaderboardOptIn ?? false,
              },
            },
    },
  });
  const device = await prisma.device.create({
    data: { userId: user.id, tokenId: `${params.username}-dev`, secretHash: 'h' },
  });

  for (const row of params.rows) {
    await prisma.modelUsageDaily.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        date: row.date ?? new Date(),
        provider: 'openai',
        product: 'copilot',
        surface: 'vscode',
        modelId: row.modelId ?? 'gpt-4o',
        repoIdentity: row.repoIdentity ?? null,
        trustLevel: 'observed',
        requestCount: row.requestCount,
        inputTokens: row.totalTokens,
        outputTokens: 0n,
        totalTokens: row.totalTokens,
        premiumRequests: row.premiumRequests ?? 0,
      },
    });
  }
}

/**
 * Phase 0 baseline characterization for GET /api/leaderboard (all-time path).
 *
 * Locks in the current privacy filter (`userPubliclyVisibleWhere()`) so any
 * Phase 1+ schema change that accidentally exposes deleted, suspended, or
 * non-public users in the leaderboard makes these tests fail loudly.
 */

test('getUserLeaderboardAllTime returns only ACTIVE + non-deleted + public+leaderboard-opted users, ordered by tokens desc', async () => {
  await withTestDb(async ({ prisma }) => {
    // Public user — must appear.
    await seedUserUsage(prisma, {
      githubId: 90001,
      username: 'lb-public-1',
      avatarUrl: 'https://avatars/1',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 1000n, requestCount: 10, premiumRequests: 10 }],
    });
    // Public user with smaller totals — must appear after the first.
    await seedUserUsage(prisma, {
      githubId: 90002,
      username: 'lb-public-2',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 500n, requestCount: 5, premiumRequests: 50 }],
    });
    // Private profile — MUST be hidden.
    await seedUserUsage(prisma, {
      githubId: 90003,
      username: 'lb-private',
      profilePublic: false,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 9_999n, requestCount: 99, premiumRequests: 0 }],
    });
    // Suspended — MUST be hidden.
    await seedUserUsage(prisma, {
      githubId: 90004,
      username: 'lb-suspended',
      status: 'SUSPENDED',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 9_999n, requestCount: 99, premiumRequests: 0 }],
    });
    // Soft-deleted — MUST be hidden.
    await seedUserUsage(prisma, {
      githubId: 90005,
      username: 'lb-deleted',
      deletedAt: new Date('2025-01-01T00:00:00Z'),
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 9_999n, requestCount: 99, premiumRequests: 0 }],
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

test('getUserLeaderboardAllTime includes public opted-in users with zero usage totals', async () => {
  await withTestDb(async ({ prisma }) => {
    await seedUserUsage(prisma, {
      githubId: 90030,
      username: 'lb-with-usage',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 100n, requestCount: 2, premiumRequests: 1 }],
    });

    await prisma.user.create({
      data: {
        githubId: 90031,
        username: 'lb-zero-usage',
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });

    const entries = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    const zeroUsageEntry = entries.find((entry) => entry.username === 'lb-zero-usage');

    assert.ok(zeroUsageEntry, 'public opted-in users should not be omitted when totals are zero');
    assert.equal(zeroUsageEntry?.totalTokens, '0');
    assert.equal(zeroUsageEntry?.totalRequests, 0);
    assert.equal(zeroUsageEntry?.premiumRequests, 0);
  });
});

test('getUserLeaderboardAllTime entry shape is the documented contract', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 90010,
        username: 'lb-shape',
        status: 'ACTIVE',
        avatarUrl: 'https://avatars/lb-shape',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { githubId: 90010 }, select: { id: true } });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'lb-shape-dev', secretHash: 'h' },
    });
    const now = new Date();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    oldDate.setHours(0, 0, 0, 0);
    await prisma.modelUsageDaily.createMany({
      data: [
        {
          userId: user.id,
          deviceId: device.id,
          date: now,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4',
          repoIdentity: 'github:lb/shape-repo',
          trustLevel: 'observed',
          requestCount: 1,
          inputTokens: 4n,
          outputTokens: 0n,
          totalTokens: 4n,
          premiumRequests: 1,
        },
        {
          userId: user.id,
          deviceId: device.id,
          date: oldDate,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4',
          repoIdentity: 'github:lb/shape-repo',
          trustLevel: 'observed',
          requestCount: 1,
          inputTokens: 3n,
          outputTokens: 0n,
          totalTokens: 3n,
          premiumRequests: 0,
        },
      ],
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
    await seedUserUsage(prisma, {
      githubId: 90020,
      username: 'lb-prem-low',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 100n, requestCount: 10, premiumRequests: 1 }],
    });
    await seedUserUsage(prisma, {
      githubId: 90021,
      username: 'lb-prem-high',
      profilePublic: true,
      leaderboardOptIn: true,
      rows: [{ totalTokens: 1n, requestCount: 1, premiumRequests: 99 }],
    });

    const entries = await getUserLeaderboardAllTime({ sort: 'premium', page: 1 }, prisma);
    assert.equal(entries[0].username, 'lb-prem-high');
    assert.equal(entries[1].username, 'lb-prem-low');
  });
});

test('getUserLeaderboardAllTime page size constant matches existing /api/leaderboard contract', () => {
  assert.equal(USER_LEADERBOARD_PAGE_SIZE, 25);
});
