import assert from 'node:assert/strict';
import test from 'node:test';

import { canViewProfile } from './profile-policy';

test('public profile can be viewed by anyone', () => {
  assert.equal(
    canViewProfile({
      profilePublic: true,
      ownerUserId: 'owner',
      viewerUserId: null,
    }),
    true
  );
});

test('private profile can be viewed by owner', () => {
  assert.equal(
    canViewProfile({
      profilePublic: false,
      ownerUserId: 'owner',
      viewerUserId: 'owner',
    }),
    true
  );
});

test('private profile cannot be viewed by others', () => {
  assert.equal(
    canViewProfile({
      profilePublic: false,
      ownerUserId: 'owner',
      viewerUserId: 'someone-else',
    }),
    false
  );
});
