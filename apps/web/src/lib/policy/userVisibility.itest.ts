import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { getUserLeaderboardAllTime } from '@/lib/leaderboard/getUserLeaderboardAllTime';
import { loadProfileByUsername } from '@/lib/profile/loadProfileByUsername';
import { userVisibleForFeatureWhere } from '@/lib/policy/userLifecycle';

/**
 * Phase 2.1 — verifies the strict feature-specific opt-in model:
 *   - profile: bridge fallback to legacy User.profilePublic when no PS row
 *   - leaderboard: requires PrivacySettings.leaderboardOptIn = true
 *   - badges: requires PrivacySettings.badgesEnabled = true
 *
 * Existing tests cover the happy paths; this file locks in the negative
 * case: a user with profilePublic but NO leaderboard/badges opt-in is
 * visible on profile but absent from leaderboards and badges.
 */

test('Phase 2.1: opt-in cascade — profile-public-only user is on profile but NOT leaderboard or badges', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 250001,
        username: 'p21-profile-only',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 1234n, premiumRequests: 5 } },
        privacySettings: {
          create: {
            profilePublic: true,
            leaderboardOptIn: false,
            badgesEnabled: false,
          },
        },
      },
    });

    const profile = await loadProfileByUsername('p21-profile-only', prisma);
    assert.ok(profile, 'profile-only user IS visible on profile');
    assert.equal(profile?.username, 'p21-profile-only');

    const leaderboard = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    assert.equal(
      leaderboard.find((e) => e.username === 'p21-profile-only'),
      undefined,
      'profile-only user is NOT on leaderboard'
    );

    const badgeVisible = await prisma.user.findFirst({
      where: {
        ...userVisibleForFeatureWhere('badges'),
        username: 'p21-profile-only',
      },
      select: { id: true },
    });
    assert.equal(badgeVisible, null, 'profile-only user is NOT badge-visible');
  });
});

test('Phase 2.1: leaderboard opt-in alone is not enough when profilePublic in PS is false', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 250002,
        username: 'p21-lb-without-pp',
        profilePublic: true, // legacy says public
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 99_999n } },
        privacySettings: {
          create: {
            profilePublic: false, // PS says private — wins over legacy
            leaderboardOptIn: true,
            badgesEnabled: true,
          },
        },
      },
    });

    const leaderboard = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    assert.equal(
      leaderboard.find((e) => e.username === 'p21-lb-without-pp'),
      undefined,
      'PS.profilePublic=false hides user from leaderboard even with leaderboardOptIn=true'
    );

    const profile = await loadProfileByUsername('p21-lb-without-pp', prisma);
    assert.equal(profile, null, 'PS.profilePublic=false hides user from profile too');
  });
});

test('Phase 2.1: profile bridge fallback — legacy profilePublic=true with no PS row IS visible', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 250003,
        username: 'p21-bridge',
        profilePublic: true,
        status: 'ACTIVE',
        userStat: { create: { totalTokens: 10n } },
        // intentionally NO privacySettings row
      },
    });

    const profile = await loadProfileByUsername('p21-bridge', prisma);
    assert.ok(profile, 'legacy-only user with profilePublic=true is still visible on profile');

    const leaderboard = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    assert.equal(
      leaderboard.find((e) => e.username === 'p21-bridge'),
      undefined,
      'legacy-only user is NOT on leaderboard (privacy-first opt-in required)'
    );
  });
});
