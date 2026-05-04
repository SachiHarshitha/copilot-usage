import assert from 'node:assert/strict';
import test from 'node:test';

import { canViewProfile } from './profile-policy';

const activeBase = {
  id: 'owner',
  status: 'ACTIVE' as const,
  deletedAt: null,
  privacySettings: {
    profilePublic: true,
    leaderboardOptIn: false,
    badgesEnabled: false,
  },
};

test('public profile (PrivacySettings.profilePublic=true) can be viewed by anyone', () => {
  assert.equal(canViewProfile({ user: activeBase, viewerUserId: null }), true);
});

test('private profile can be viewed by its owner', () => {
  const user = {
    ...activeBase,
    privacySettings: { ...activeBase.privacySettings, profilePublic: false },
  };
  assert.equal(canViewProfile({ user, viewerUserId: 'owner' }), true);
});

test('private profile cannot be viewed by others', () => {
  const user = {
    ...activeBase,
    privacySettings: { ...activeBase.privacySettings, profilePublic: false },
  };
  assert.equal(canViewProfile({ user, viewerUserId: 'someone-else' }), false);
});

test('no PrivacySettings row is hidden publicly but still owner-viewable', () => {
  const user = { ...activeBase, privacySettings: null };
  assert.equal(canViewProfile({ user, viewerUserId: null }), false);
  assert.equal(canViewProfile({ user, viewerUserId: 'owner' }), true);
});

test('suspended user is not publicly visible but owner can still view', () => {
  const user = { ...activeBase, status: 'SUSPENDED' as const };
  assert.equal(canViewProfile({ user, viewerUserId: null }), false);
  assert.equal(canViewProfile({ user, viewerUserId: 'owner' }), true);
});

test('soft-deleted user is hidden from everyone, including the owner', () => {
  const user = { ...activeBase, deletedAt: new Date() };
  assert.equal(canViewProfile({ user, viewerUserId: 'owner' }), false);
  assert.equal(canViewProfile({ user, viewerUserId: null }), false);
});

