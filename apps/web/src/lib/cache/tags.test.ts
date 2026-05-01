import assert from 'node:assert/strict';
import test from 'node:test';

import {
  leaderboardTag,
  repoSlugTag,
  repoTag,
  tagsForUserChange,
  userBadgesByUsernameTag,
  userBadgesTag,
  userTag,
} from './tags';

test('userTag is namespaced and stable per id', () => {
  assert.equal(userTag('abc'), 'user:abc');
});

test('userBadgesTag extends userTag namespace', () => {
  assert.equal(userBadgesTag('abc'), 'user:abc:badges');
});

test('userBadgesByUsernameTag uses username namespace', () => {
  assert.equal(userBadgesByUsernameTag('octocat'), 'username:octocat:badges');
});

test('repoTag combines user id and repo slug', () => {
  assert.equal(repoTag('uid', 'owner/repo'), 'user:uid:repo:owner/repo');
});

test('repoSlugTag is keyed only on slug', () => {
  assert.equal(repoSlugTag('owner/repo'), 'repo:owner/repo');
});

test('leaderboardTag is the global leaderboard key', () => {
  assert.equal(leaderboardTag(), 'leaderboard:global');
});

test('tagsForUserChange returns user + badge + username-badge + leaderboard tags', () => {
  const tags = tagsForUserChange('uid', 'octocat');
  assert.deepEqual(tags, [
    'user:uid',
    'user:uid:badges',
    'username:octocat:badges',
    'leaderboard:global',
  ]);
});
