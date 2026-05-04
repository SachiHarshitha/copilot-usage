import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { getRepoLeaderboardEntries } from './repo-leaderboard-data';

/**
 * Phase 0 baseline characterization for GET /api/leaderboard/repos.
 *
 * Locks in the privacy filter applied to the repo leaderboard:
 *   - private repos (RepoVisibilitySettings.isPublic=false) MUST NOT appear
 *   - repos owned by deleted/suspended/non-public users MUST NOT appear
 *   - top contributor of each repo MUST be a public ACTIVE user
 *
 * Phase 1+ schema changes that touch User or canonical usage tables must keep these
 * invariants green or update the tests intentionally.
 */

test('getRepoLeaderboardEntries hides private repos and repos owned by hidden users', async () => {
  await withTestDb(async ({ prisma }) => {
    // Public user with one public + one private repo.
    await prisma.user.create({
      data: {
        githubId: 70001,
        username: 'rl-public-owner',
        status: 'ACTIVE',
        avatarUrl: 'https://avatars/owner',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const publicOwner = await prisma.user.findUniqueOrThrow({
      where: { githubId: 70001 },
      select: { id: true },
    });
    const publicOwnerDevice = await prisma.device.create({
      data: { userId: publicOwner.id, tokenId: 'rl-public-owner-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.createMany({
      data: [
        { userId: publicOwner.id, repoIdentity: 'github:rl/visible', isPublic: true },
        { userId: publicOwner.id, repoIdentity: 'github:rl/owner-private', isPublic: false },
      ],
    });
    const now = new Date();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    oldDate.setHours(0, 0, 0, 0);
    await prisma.modelUsageDaily.createMany({
      data: [
        {
          userId: publicOwner.id,
          deviceId: publicOwnerDevice.id,
          date: now,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4o',
          repoIdentity: 'github:rl/visible',
          trustLevel: 'observed',
          requestCount: 6,
          inputTokens: 200n,
          outputTokens: 300n,
          totalTokens: 500n,
          premiumRequests: 0.6,
        },
        {
          userId: publicOwner.id,
          deviceId: publicOwnerDevice.id,
          date: oldDate,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4o',
          repoIdentity: 'github:rl/visible',
          trustLevel: 'observed',
          requestCount: 4,
          inputTokens: 250n,
          outputTokens: 250n,
          totalTokens: 500n,
          premiumRequests: 0.4,
        },
        {
          userId: publicOwner.id,
          deviceId: publicOwnerDevice.id,
          date: now,
          provider: 'openai',
          product: 'copilot',
          surface: 'vscode',
          modelId: 'gpt-4o',
          repoIdentity: 'github:rl/owner-private',
          trustLevel: 'observed',
          requestCount: 99,
          inputTokens: 5_000n,
          outputTokens: 4_999n,
          totalTokens: 9_999n,
          premiumRequests: 9,
        },
      ],
    });

    // Suspended user with a public repo — repo must NOT surface.
    const suspended = await prisma.user.create({
      data: {
        githubId: 70002,
        username: 'rl-suspended-owner',
        status: 'SUSPENDED',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const suspendedDevice = await prisma.device.create({
      data: { userId: suspended.id, tokenId: 'rl-suspended-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.create({
      data: { userId: suspended.id, repoIdentity: 'github:rl/suspended-repo', isPublic: true },
    });
    await prisma.modelUsageDaily.create({
      data: {
        userId: suspended.id,
        deviceId: suspendedDevice.id,
        date: now,
        provider: 'openai',
        product: 'copilot',
        surface: 'vscode',
        modelId: 'gpt-4o',
        repoIdentity: 'github:rl/suspended-repo',
        trustLevel: 'observed',
        requestCount: 99,
        inputTokens: 5_000n,
        outputTokens: 4_999n,
        totalTokens: 9_999n,
        premiumRequests: 9,
      },
    });

    // Soft-deleted user with a public repo — repo must NOT surface.
    const deleted = await prisma.user.create({
      data: {
        githubId: 70003,
        username: 'rl-deleted-owner',
        status: 'ACTIVE',
        deletedAt: new Date('2025-01-01T00:00:00Z'),
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const deletedDevice = await prisma.device.create({
      data: { userId: deleted.id, tokenId: 'rl-deleted-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.create({
      data: { userId: deleted.id, repoIdentity: 'github:rl/deleted-repo', isPublic: true },
    });
    await prisma.modelUsageDaily.create({
      data: {
        userId: deleted.id,
        deviceId: deletedDevice.id,
        date: now,
        provider: 'openai',
        product: 'copilot',
        surface: 'vscode',
        modelId: 'gpt-4o',
        repoIdentity: 'github:rl/deleted-repo',
        trustLevel: 'observed',
        requestCount: 99,
        inputTokens: 5_000n,
        outputTokens: 4_999n,
        totalTokens: 9_999n,
        premiumRequests: 9,
      },
    });

    // Private profile with a public repo — repo must NOT surface (cascade).
    const privateOwner = await prisma.user.create({
      data: {
        githubId: 70004,
        username: 'rl-private-owner',
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: false, leaderboardOptIn: true } },
      },
    });
    const privateOwnerDevice = await prisma.device.create({
      data: { userId: privateOwner.id, tokenId: 'rl-private-owner-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.create({
      data: { userId: privateOwner.id, repoIdentity: 'github:rl/private-owner-repo', isPublic: true },
    });
    await prisma.modelUsageDaily.create({
      data: {
        userId: privateOwner.id,
        deviceId: privateOwnerDevice.id,
        date: now,
        provider: 'openai',
        product: 'copilot',
        surface: 'vscode',
        modelId: 'gpt-4o',
        repoIdentity: 'github:rl/private-owner-repo',
        trustLevel: 'observed',
        requestCount: 99,
        inputTokens: 5_000n,
        outputTokens: 4_999n,
        totalTokens: 9_999n,
        premiumRequests: 9,
      },
    });

    const entries = await getRepoLeaderboardEntries({ sort: 'tokens', page: 1 }, prisma);
    const slugs = entries.map((e) => e.repoSlug);
    assert.deepEqual(slugs, ['rl/visible'], 'only the public repo of the public ACTIVE user');

    const [entry] = entries;
    assert.equal(entry.rank, 1);
    assert.equal(entry.totalTokens, 1_000n);
    assert.equal(entry.tokens30d, 500n);
    assert.equal(entry.totalRequests, 10);
    assert.equal(entry.contributorCount, 1);
    assert.equal(entry.topUsername, 'rl-public-owner');
    assert.equal(entry.topAvatarUrl, 'https://avatars/owner');
  });
});

test('getRepoLeaderboardEntries entry shape is the documented contract', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 70010,
        username: 'rl-shape',
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { githubId: 70010 }, select: { id: true } });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'rl-shape-dev', secretHash: 'h' },
    });
    await prisma.repoVisibilitySettings.create({
      data: { userId: user.id, repoIdentity: 'github:rl/shape', isPublic: true },
    });
    await prisma.modelUsageDaily.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        date: new Date(),
        provider: 'openai',
        product: 'copilot',
        surface: 'vscode',
        modelId: 'gpt-4o',
        repoIdentity: 'github:rl/shape',
        trustLevel: 'observed',
        requestCount: 1,
        inputTokens: 1n,
        outputTokens: 0n,
        totalTokens: 1n,
        premiumRequests: 1,
      },
    });

    const [entry] = await getRepoLeaderboardEntries({ sort: 'tokens', page: 1 }, prisma);
    assert.deepEqual(
      Object.keys(entry).sort(),
      [
        'contributorCount',
        'premiumRequests',
        'rank',
        'repoSlug',
        'tokens30d',
        'topAvatarUrl',
        'topUsername',
        'totalRequests',
        'totalTokens',
      ],
    );
  });
});
