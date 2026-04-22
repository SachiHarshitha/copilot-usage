import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIdeLeaderboardHref,
  formatSurfaceLabel,
  normalizeIdeLeaderboardPage,
  normalizeIdeLeaderboardSort,
} from './ide-leaderboard';

test('normalizers provide safe defaults for ide leaderboard', () => {
  assert.equal(normalizeIdeLeaderboardSort(undefined), 'tokens');
  assert.equal(normalizeIdeLeaderboardSort('premium'), 'premium');
  assert.equal(normalizeIdeLeaderboardSort('invalid'), 'tokens');

  assert.equal(normalizeIdeLeaderboardPage(undefined), 1);
  assert.equal(normalizeIdeLeaderboardPage('2'), 2);
  assert.equal(normalizeIdeLeaderboardPage('0'), 1);
});

test('href builder and surface formatter produce expected output', () => {
  assert.equal(buildIdeLeaderboardHref({ page: 1, sort: 'tokens' }), '/leaderboard/ides');
  assert.equal(buildIdeLeaderboardHref({ page: 3, sort: 'premium' }), '/leaderboard/ides?page=3&sort=premium');

  assert.equal(formatSurfaceLabel('vscode'), 'VS Code');
  assert.equal(formatSurfaceLabel('jetbrains'), 'JetBrains');
  assert.equal(formatSurfaceLabel('terminal'), 'Terminal');
  assert.equal(formatSurfaceLabel('other'), 'Other');
});
