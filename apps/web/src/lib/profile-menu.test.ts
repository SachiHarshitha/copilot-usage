import assert from 'node:assert/strict';
import test from 'node:test';

import { getProfileAvatarInitial } from './profile-menu';

test('getProfileAvatarInitial returns uppercase first character for valid usernames', () => {
  assert.equal(getProfileAvatarInitial('localtest'), 'L');
  assert.equal(getProfileAvatarInitial('Alice'), 'A');
});

test('getProfileAvatarInitial returns fallback for empty input', () => {
  assert.equal(getProfileAvatarInitial(''), '?');
  assert.equal(getProfileAvatarInitial('   '), '?');
});
