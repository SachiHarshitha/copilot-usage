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
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'p0-public-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.createMany({
      data: [
        { userId: user.id, repoIdentity: 'github:p0/public-repo', isPublic: true },
        { userId: user.id, repoIdentity: 'github:p0/private-repo', isPublic: false },
      ],
    });

    const now = new Date();
    const olderWithin30 = new Date(now);
    olderWithin30.setDate(olderWithin30.getDate() - 15);
    olderWithin30.setHours(0, 0, 0, 0);
    const olderThan30 = new Date(now);
    olderThan30.setDate(olderThan30.getDate() - 40);
    olderThan30.setHours(0, 0, 0, 0);

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
          repoIdentity: 'github:p0/public-repo',
          trustLevel: 'observed',
          requestCount: 10,
          inputTokens: 40n,
          outputTokens: 10n,
          totalTokens: 50n,
          premiumRequests: 1,
        },
        {
          userId: user.id,
          deviceId: device.id,
          date: olderWithin30,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4',
          repoIdentity: 'github:p0/public-repo',
          trustLevel: 'observed',
          requestCount: 32,
          inputTokens: 60n,
          outputTokens: 140n,
          totalTokens: 200n,
          premiumRequests: 2,
        },
        {
          userId: user.id,
          deviceId: device.id,
          date: olderThan30,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4',
          repoIdentity: 'github:p0/private-repo',
          trustLevel: 'observed',
          requestCount: 0,
          inputTokens: 0n,
          outputTokens: 50n,
          totalTokens: 50n,
          premiumRequests: 2,
        },
      ],
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
    assert.equal(result.repos[0].repoIdentity, 'github:p0/public-repo');
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

test('loadProfileByUsername returns null for a user with PrivacySettings.profilePublic=false', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80002,
        username: 'p0-private',
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: false, leaderboardOptIn: true } },
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
        status: 'SUSPENDED',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
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
        status: 'ACTIVE',
        deletedAt: new Date('2025-01-01T00:00:00Z'),
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const result = await loadProfileByUsername('p0-deleted', prisma);
    assert.equal(result, null, 'soft-deleted user must 404');
  });
});

test('loadProfileByUsername returns stats=null when no canonical usage exists', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 80005,
        username: 'p0-no-stats',
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const result = await loadProfileByUsername('p0-no-stats', prisma);
    assert.ok(result);
    assert.equal(result!.stats, null);
    assert.equal(result!.repos.length, 0);
  });
});
