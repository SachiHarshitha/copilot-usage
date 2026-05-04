import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import { getUserLeaderboardAllTime } from '@/lib/leaderboard/getUserLeaderboardAllTime';
import { loadProfileByUsername } from '@/lib/profile/loadProfileByUsername';
import { userVisibleForFeatureWhere } from '@/lib/policy/userLifecycle';

/**
 * Phase 2.1 — verifies the strict feature-specific opt-in model:
 *   - profile: requires PrivacySettings.profilePublic = true
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
        status: 'ACTIVE',
        privacySettings: {
          create: {
            profilePublic: true,
            leaderboardOptIn: false,
            badgesEnabled: false,
          },
        },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { githubId: 250001 },
      select: { id: true },
    });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'p21-profile-only-dev', secretHash: 'h' },
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
        repoIdentity: null,
        trustLevel: 'observed',
        requestCount: 10,
        inputTokens: 900n,
        outputTokens: 334n,
        totalTokens: 1234n,
        premiumRequests: 5,
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
        status: 'ACTIVE',
        privacySettings: {
          create: {
            profilePublic: false,
            leaderboardOptIn: true,
            badgesEnabled: true,
          },
        },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { githubId: 250002 },
      select: { id: true },
    });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'p21-lb-without-pp-dev', secretHash: 'h' },
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
        repoIdentity: null,
        trustLevel: 'observed',
        requestCount: 99,
        inputTokens: 50_000n,
        outputTokens: 49_999n,
        totalTokens: 99_999n,
        premiumRequests: 0,
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

test('Phase 2.1: privacy-first fallback — no PrivacySettings row is hidden from profile/leaderboard', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 250003,
        username: 'p21-bridge',
        status: 'ACTIVE',
        // intentionally NO privacySettings row
      },
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: { githubId: 250003 },
      select: { id: true },
    });
    const device = await prisma.device.create({
      data: { userId: user.id, tokenId: 'p21-bridge-dev', secretHash: 'h' },
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
        repoIdentity: null,
        trustLevel: 'observed',
        requestCount: 1,
        inputTokens: 10n,
        outputTokens: 0n,
        totalTokens: 10n,
        premiumRequests: 0,
      },
    });

    const profile = await loadProfileByUsername('p21-bridge', prisma);
    assert.equal(profile, null, 'privacy-first: no PS row means profile is hidden');

    const leaderboard = await getUserLeaderboardAllTime({ sort: 'tokens', page: 1 }, prisma);
    assert.equal(
      leaderboard.find((e) => e.username === 'p21-bridge'),
      undefined,
      'no-PS user is NOT on leaderboard (privacy-first opt-in required)'
    );
  });
});
