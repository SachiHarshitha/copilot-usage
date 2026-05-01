import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { getRepoLeaderboardEntries } from './repo-leaderboard-data';

/**
 * Phase 0 baseline characterization for GET /api/leaderboard/repos.
 *
 * Locks in the privacy filter applied to the repo leaderboard:
 *   - private repos (RepoStat.isPublic=false) MUST NOT appear
 *   - repos owned by deleted/suspended/non-public users MUST NOT appear
 *   - top contributor of each repo MUST be a public ACTIVE user
 *
 * Phase 1+ schema changes that touch User or RepoStat must keep these
 * invariants green or update the tests intentionally.
 */

test('getRepoLeaderboardEntries hides private repos and repos owned by hidden users', async () => {
  await withTestDb(async ({ prisma }) => {
    // Public user with one public + one private repo.
    await prisma.user.create({
      data: {
        githubId: 70001,
        username: 'rl-public-owner',
        profilePublic: true,
        status: 'ACTIVE',
        avatarUrl: 'https://avatars/owner',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
        repoStats: {
          create: [
            {
              repoIdentity: 'rl/visible',
              displayMode: 'github',
              githubRepo: 'rl/visible',
              isPublic: true,
              totalTokens: 1_000n,
              tokens30d: 500n,
              requests: 10,
              premiumReqs: 1,
            },
            {
              repoIdentity: 'rl/owner-private',
              displayMode: 'github',
              githubRepo: 'rl/owner-private',
              isPublic: false,
              totalTokens: 9_999n,
              tokens30d: 9_999n,
              requests: 99,
              premiumReqs: 9,
            },
          ],
        },
      },
    });

    // Suspended user with a public repo — repo must NOT surface.
    await prisma.user.create({
      data: {
        githubId: 70002,
        username: 'rl-suspended-owner',
        profilePublic: true,
        status: 'SUSPENDED',
        repoStats: {
          create: {
            repoIdentity: 'rl/suspended-repo',
            displayMode: 'github',
            githubRepo: 'rl/suspended-repo',
            isPublic: true,
            totalTokens: 9_999n,
            tokens30d: 9_999n,
            requests: 99,
            premiumReqs: 9,
          },
        },
      },
    });

    // Soft-deleted user with a public repo — repo must NOT surface.
    await prisma.user.create({
      data: {
        githubId: 70003,
        username: 'rl-deleted-owner',
        profilePublic: true,
        status: 'ACTIVE',
        deletedAt: new Date('2025-01-01T00:00:00Z'),
        repoStats: {
          create: {
            repoIdentity: 'rl/deleted-repo',
            displayMode: 'github',
            githubRepo: 'rl/deleted-repo',
            isPublic: true,
            totalTokens: 9_999n,
            tokens30d: 9_999n,
            requests: 99,
            premiumReqs: 9,
          },
        },
      },
    });

    // Private profile with a public repo — repo must NOT surface (cascade).
    await prisma.user.create({
      data: {
        githubId: 70004,
        username: 'rl-private-owner',
        profilePublic: false,
        status: 'ACTIVE',
        repoStats: {
          create: {
            repoIdentity: 'rl/private-owner-repo',
            displayMode: 'github',
            githubRepo: 'rl/private-owner-repo',
            isPublic: true,
            totalTokens: 9_999n,
            tokens30d: 9_999n,
            requests: 99,
            premiumReqs: 9,
          },
        },
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
        profilePublic: true,
        status: 'ACTIVE',
        privacySettings: { create: { profilePublic: true, leaderboardOptIn: true } },
        repoStats: {
          create: {
            repoIdentity: 'rl/shape',
            displayMode: 'github',
            githubRepo: 'rl/shape',
            isPublic: true,
            totalTokens: 1n,
            tokens30d: 1n,
            requests: 1,
            premiumReqs: 1,
          },
        },
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
