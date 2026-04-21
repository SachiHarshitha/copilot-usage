import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLifetimeTier,
  getRankTier,
  getRepoLeaderboardBadge,
  getRepoModelsBadge,
  getRepoSummaryBadge,
  getStreakTier,
  getUnlockedLifetimeBadges,
  getUnlockedStreakBadges,
} from './compute';

test('tier selectors handle boundary values', () => {
  assert.equal(getLifetimeTier(0).key, 'new');
  assert.equal(getLifetimeTier(50_000_000).key, 'legend');
  assert.equal(getRankTier(0).key, 'bronze');
  assert.equal(getRankTier(12_000_000).key, 'grandmaster');
  assert.equal(getStreakTier(0).key, 'new');
  assert.equal(getStreakTier(365).key, 'immortal');
});

test('unlock helpers include exact-threshold badges', () => {
  assert.deepEqual(getUnlockedLifetimeBadges(100_000), ['100k']);
  assert.deepEqual(getUnlockedLifetimeBadges(1_000_000), ['100k', '500k', '1m']);
  assert.deepEqual(getUnlockedStreakBadges(14), ['3d', '7d', '14d']);
});

test('repo badge helpers cover missing and known values', () => {
  const leaderboardKnown = getRepoLeaderboardBadge(3, 98.4);
  const leaderboardMissing = getRepoLeaderboardBadge(null, null);

  assert.equal(leaderboardKnown.label, 'REPO RANK');
  assert.equal(leaderboardKnown.value.startsWith('#3'), true);
  assert.equal(leaderboardMissing.value, 'UNRANKED');

  const unknownModels = getRepoModelsBadge([]);
  const namedModels = getRepoModelsBadge(['gpt-4o', 'claude-3.7']);

  assert.equal(unknownModels.value, 'UNKNOWN');
  assert.equal(namedModels.value, 'GPT-4O · CLAUDE-3.7');

  const summary = getRepoSummaryBadge({
    repoSlug: 'octo/repo',
    totalTokens: BigInt(50_000_000),
    tokens30d: BigInt(1_000_000),
    requests: 10,
    premiumRequests: 2,
    rank: 7,
    percentile: 96,
    models: ['gpt-4o', 'claude-3.7'],
    primaryModel: 'gpt-4o',
  });

  assert.equal(summary.value.includes('#7'), true);
  assert.equal(summary.value.includes('50.0M'), true);
  assert.equal(summary.value.includes('GPT-4O'), true);
});
