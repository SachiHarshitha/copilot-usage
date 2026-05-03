import assert from 'node:assert/strict';
import test from 'node:test';

import { canViewProfile } from './profile-policy';

const activeBase = {
  id: 'owner',
  status: 'ACTIVE' as const,
  deletedAt: null,
  profilePublic: true,
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
    profilePublic: false,
    privacySettings: { ...activeBase.privacySettings, profilePublic: false },
  };
  assert.equal(canViewProfile({ user, viewerUserId: 'owner' }), true);
});

test('private profile cannot be viewed by others', () => {
  const user = {
    ...activeBase,
    profilePublic: false,
    privacySettings: { ...activeBase.privacySettings, profilePublic: false },
  };
  assert.equal(canViewProfile({ user, viewerUserId: 'someone-else' }), false);
});

test('legacy bridge: PrivacySettings null falls back to User.profilePublic', () => {
  const user = { ...activeBase, profilePublic: true, privacySettings: null };
  assert.equal(canViewProfile({ user, viewerUserId: null }), true);
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

