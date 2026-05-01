import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { loadProfileByUsername } from './loadProfileByUsername';

/**
 * Phase 0 baseline characterization for GET /api/profile/[username].
 *
 * These tests lock in the CURRENT public-profile contract:
 *   - which user states return data vs. null (= 404 at the route)
 *   - exact response field set
 *   - that only public repos are included
 *
 * Phase 1+ schema changes that intentionally alter privacy semantics MUST
 * update these tests in the same commit. A surprise diff here means a
 * privacy regression.
 */

test('loadProfileByUsername returns the documented response shape for a public user', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: {
        githubId: 80001,
        username: 'p0-public',
        displayName: 'P0 Public',
        avatarUrl: 'https://avatars.githubusercontent.com/u/80001',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: {
          create: {
            totalRequests: 42,
            promptTokens: 100n,
            outputTokens: 200n,
            totalTokens: 300n,
            weeklyTokens: 50n,
            rolling30DayTokens: 250n,
            premiumRequests: 5,
            currentStreakDays: 3,
            bestStreakDays: 7,
            workspaceCount: 2,
            sessionCount: 9,
            topModel: 'gpt-4',
          },
        },
        repoStats: {
          create: [
            {
              repoIdentity: 'p0/public-repo',
              displayMode: 'github',
              githubRepo: 'p0/public-repo',
              aliasLabel: null,
              isPublic: true,
              requests: 10,
              totalTokens: 200n,
              premiumReqs: 1,
              topModel: 'gpt-4',
            },
            {
              repoIdentity: 'p0/private-repo',
              displayMode: 'github',
              githubRepo: 'p0/private-repo',
              aliasLabel: null,
              isPublic: false,
              requests: 99,
              totalTokens: 999n,
              premiumReqs: 9,
              topModel: 'gpt-4',
            },
          ],
        },
      },
    });

    const result = await loadProfileByUsername('p0-public', prisma);
    assert.ok(result, 'expected profile payload for a public user');

    // Top-level keys (locks the contract).
    assert.deepEqual(
      Object.keys(result).sort(),
      ['avatarUrl', 'createdAt', 'displayName', 'repos', 'stats', 'username'],
    );
    assert.equal(result.username, 'p0-public');
    assert.equal(result.displayName, 'P0 Public');
    assert.equal(result.avatarUrl, 'https://avatars.githubusercontent.com/u/80001');
    assert.ok(result.createdAt instanceof Date);

    // Stat keys + types (BigInt fields are stringified).
    assert.ok(result.stats);
    assert.deepEqual(
      Object.keys(result.stats!).sort(),
      [
        'bestStreakDays',
        'currentStreakDays',
        'lastSyncedAt',
        'outputTokens',
        'premiumRequests',
        'promptTokens',
        'rolling30DayTokens',
        'sessionCount',
        'topModel',
        'totalRequests',
        'totalTokens',
        'weeklyTokens',
        'workspaceCount',
      ],
    );
    assert.equal(result.stats!.totalTokens, '300');
    assert.equal(result.stats!.promptTokens, '100');
    assert.equal(result.stats!.outputTokens, '200');
    assert.equal(result.stats!.weeklyTokens, '50');
    assert.equal(result.stats!.rolling30DayTokens, '250');
    assert.equal(result.stats!.totalRequests, 42);
    assert.equal(result.stats!.premiumRequests, 5);

    // Only the public repo is returned. Private repo MUST NOT leak.
    assert.equal(result.repos.length, 1, 'private repos must be hidden');
    assert.equal(result.repos[0].repoIdentity, 'p0/public-repo');
    assert.equal(result.repos[0].totalTokens, '200');
    assert.deepEqual(
      Object.keys(result.repos[0]).sort(),
      [
        'aliasLabel',
        'displayMode',
        'githubRepo',
        'premiumReqs',
        'repoIdentity',
        'topModel',
        'totalTokens',
        'requests',
      ].sort(),
    );

    void user;
  });
});

test('loadProfileByUsername returns null for an unknown username', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await loadProfileByUsername('does-not-exist', prisma);
    assert.equal(result, null);
  });
});

test('loadProfileByUsername returns null for a user with profilePublic=false', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80002,
        username: 'p0-private',
        profilePublic: false,
        status: 'ACTIVE',
      },
    });
    const result = await loadProfileByUsername('p0-private', prisma);
    assert.equal(result, null, 'private profile must not be exposed');
  });
});

test('loadProfileByUsername returns null for a SUSPENDED user even if profilePublic=true', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80003,
        username: 'p0-suspended',
        profilePublic: true,
        status: 'SUSPENDED',
      },
    });
    const result = await loadProfileByUsername('p0-suspended', prisma);
    assert.equal(result, null, 'suspended user must 404');
  });
});

test('loadProfileByUsername returns null for a soft-deleted user even if profilePublic=true', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80004,
        username: 'p0-deleted',
        profilePublic: true,
        status: 'ACTIVE',
        deletedAt: new Date('2025-01-01T00:00:00Z'),
      },
    });
    const result = await loadProfileByUsername('p0-deleted', prisma);
    assert.equal(result, null, 'soft-deleted user must 404');
  });
});

test('loadProfileByUsername returns stats=null when UserStat row is missing', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80005,
        username: 'p0-no-stats',
        profilePublic: true,
        status: 'ACTIVE',
      },
    });
    const result = await loadProfileByUsername('p0-no-stats', prisma);
    assert.ok(result);
    assert.equal(result!.stats, null);
    assert.equal(result!.repos.length, 0);
  });
});
