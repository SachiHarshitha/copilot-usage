import assert from 'node:assert/strict';
import test from 'node:test';

import { getAllowedAvatarUrl, getProfileAvatarInitial } from './profile-menu';

test('getProfileAvatarInitial returns uppercase first character for valid usernames', () => {
  assert.equal(getProfileAvatarInitial('localtest'), 'L');
  assert.equal(getProfileAvatarInitial('Alice'), 'A');
});

test('getProfileAvatarInitial returns fallback for empty input', () => {
  assert.equal(getProfileAvatarInitial(''), '?');
  assert.equal(getProfileAvatarInitial('   '), '?');
});

test('getAllowedAvatarUrl accepts only https avatars.githubusercontent.com URLs', () => {
  assert.equal(
    getAllowedAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4'),
    'https://avatars.githubusercontent.com/u/1?v=4'
  );
  assert.equal(getAllowedAvatarUrl('  https://avatars.githubusercontent.com/u/2?v=4  '), 'https://avatars.githubusercontent.com/u/2?v=4');
  assert.equal(getAllowedAvatarUrl('http://avatars.githubusercontent.com/u/1?v=4'), null);
  assert.equal(getAllowedAvatarUrl('https://example.com/avatar.png'), null);
  assert.equal(getAllowedAvatarUrl('not-a-url'), null);
  assert.equal(getAllowedAvatarUrl(null), null);
});
