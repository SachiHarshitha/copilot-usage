import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isUserActive,
  isUserPubliclyVisible,
  userActiveWhere,
  userPubliclyVisibleSql,
  userPubliclyVisibleWhere,
} from './userLifecycle';

test('isUserActive: ACTIVE + no deletedAt is active', () => {
  assert.equal(isUserActive({ status: 'ACTIVE', deletedAt: null }), true);
});

test('isUserActive: SUSPENDED is not active', () => {
  assert.equal(isUserActive({ status: 'SUSPENDED', deletedAt: null }), false);
});

test('isUserActive: soft-deleted (deletedAt set) is not active even if status ACTIVE', () => {
  assert.equal(
    isUserActive({ status: 'ACTIVE', deletedAt: new Date() }),
    false
  );
});

test('isUserActive: SUSPENDED + deletedAt is not active', () => {
  assert.equal(
    isUserActive({ status: 'SUSPENDED', deletedAt: new Date() }),
    false
  );
});

test('isUserPubliclyVisible: requires lifecycle pass AND profilePublic', () => {
  assert.equal(
    isUserPubliclyVisible({
      status: 'ACTIVE',
      deletedAt: null,
      profilePublic: true,
    }),
    true
  );
});

test('isUserPubliclyVisible: profilePublic=false hides active user', () => {
  assert.equal(
    isUserPubliclyVisible({
      status: 'ACTIVE',
      deletedAt: null,
      profilePublic: false,
    }),
    false
  );
});

test('isUserPubliclyVisible: deleted user with profilePublic=true is hidden', () => {
  assert.equal(
    isUserPubliclyVisible({
      status: 'ACTIVE',
      deletedAt: new Date(),
      profilePublic: true,
    }),
    false
  );
});

test('isUserPubliclyVisible: suspended user with profilePublic=true is hidden', () => {
  assert.equal(
    isUserPubliclyVisible({
      status: 'SUSPENDED',
      deletedAt: null,
      profilePublic: true,
    }),
    false
  );
});

test('userActiveWhere returns lifecycle-only Prisma where fragment', () => {
  assert.deepEqual(userActiveWhere(), { status: 'ACTIVE', deletedAt: null });
});

test('userPubliclyVisibleWhere combines lifecycle + profilePublic', () => {
  assert.deepEqual(userPubliclyVisibleWhere(), {
    status: 'ACTIVE',
    deletedAt: null,
    profilePublic: true,
  });
});

test('userPubliclyVisibleSql renders all three predicates with the given alias', () => {
  const sql = userPubliclyVisibleSql('u');
  // Prisma.Sql exposes `.sql` (parameterized template) and `.strings`.
  // We only assert on the raw column references being present.
  const text = sql.sql;
  assert.ok(text.includes('"u"."status"'));
  assert.ok(text.includes('"u"."deletedAt"'));
  assert.ok(text.includes('"u"."profilePublic"'));
  assert.ok(text.includes("'ACTIVE'"));
  assert.ok(text.includes('IS NULL'));
});

// ---------------------------------------------------------------------------
// Phase 2.1: feature-specific predicates (profile / leaderboard / badges)
// ---------------------------------------------------------------------------
import {
  isUserVisibleForFeature,
  userVisibleForFeatureSql,
  userVisibleForFeatureWhere,
} from './userLifecycle';

const ACTIVE = { status: 'ACTIVE' as const, deletedAt: null };

test('isUserVisibleForFeature(profile): PrivacySettings row wins over legacy', () => {
  // PS says private; legacy says public ⇒ private
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: true, privacySettings: { profilePublic: false, leaderboardOptIn: false, badgesEnabled: false } },
      'profile'
    ),
    false
  );
  // PS says public; legacy says private ⇒ public
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: false, privacySettings: { profilePublic: true, leaderboardOptIn: false, badgesEnabled: false } },
      'profile'
    ),
    true
  );
});

test('isUserVisibleForFeature(profile): bridge fallback to legacy when no PS row', () => {
  assert.equal(
    isUserVisibleForFeature({ ...ACTIVE, profilePublic: true, privacySettings: null }, 'profile'),
    true
  );
  assert.equal(
    isUserVisibleForFeature({ ...ACTIVE, profilePublic: false, privacySettings: null }, 'profile'),
    false
  );
});

test('isUserVisibleForFeature(leaderboard): requires both profilePublic AND leaderboardOptIn', () => {
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: true, privacySettings: { profilePublic: true, leaderboardOptIn: true, badgesEnabled: false } },
      'leaderboard'
    ),
    true
  );
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: true, privacySettings: { profilePublic: true, leaderboardOptIn: false, badgesEnabled: true } },
      'leaderboard'
    ),
    false
  );
});

test('isUserVisibleForFeature(leaderboard): no PS row ⇒ never visible (privacy-first)', () => {
  assert.equal(
    isUserVisibleForFeature({ ...ACTIVE, profilePublic: true, privacySettings: null }, 'leaderboard'),
    false
  );
});

test('isUserVisibleForFeature(badges): requires both profilePublic AND badgesEnabled', () => {
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: true, privacySettings: { profilePublic: true, leaderboardOptIn: false, badgesEnabled: true } },
      'badges'
    ),
    true
  );
  assert.equal(
    isUserVisibleForFeature(
      { ...ACTIVE, profilePublic: true, privacySettings: { profilePublic: true, leaderboardOptIn: true, badgesEnabled: false } },
      'badges'
    ),
    false
  );
});

test('isUserVisibleForFeature: any feature ⇒ false when suspended or soft-deleted', () => {
  const ps = { profilePublic: true, leaderboardOptIn: true, badgesEnabled: true };
  for (const feature of ['profile', 'leaderboard', 'badges'] as const) {
    assert.equal(
      isUserVisibleForFeature({ status: 'SUSPENDED', deletedAt: null, profilePublic: true, privacySettings: ps }, feature),
      false
    );
    assert.equal(
      isUserVisibleForFeature({ status: 'ACTIVE', deletedAt: new Date(), profilePublic: true, privacySettings: ps }, feature),
      false
    );
  }
});

test('userVisibleForFeatureWhere(profile): bridge OR clause references both PS and legacy column', () => {
  const w = userVisibleForFeatureWhere('profile') as { OR: unknown[] };
  assert.equal(w.OR.length, 2);
});

test('userVisibleForFeatureWhere(leaderboard): requires nested PS leaderboardOptIn', () => {
  const w = userVisibleForFeatureWhere('leaderboard') as {
    privacySettings: { is: { profilePublic: boolean; leaderboardOptIn: boolean } };
  };
  assert.equal(w.privacySettings.is.profilePublic, true);
  assert.equal(w.privacySettings.is.leaderboardOptIn, true);
});

test('userVisibleForFeatureWhere(badges): requires nested PS badgesEnabled', () => {
  const w = userVisibleForFeatureWhere('badges') as {
    privacySettings: { is: { profilePublic: boolean; badgesEnabled: boolean } };
  };
  assert.equal(w.privacySettings.is.profilePublic, true);
  assert.equal(w.privacySettings.is.badgesEnabled, true);
});

test('userVisibleForFeatureSql(profile): emits EXISTS on PrivacySettings AND legacy fallback', () => {
  const text = userVisibleForFeatureSql('u', 'profile').sql;
  assert.ok(text.includes('"u"."status"'));
  assert.ok(text.includes('"u"."deletedAt"'));
  assert.ok(text.includes('"PrivacySettings"'));
  assert.ok(text.includes('NOT EXISTS'));
  assert.ok(text.includes('"u"."profilePublic"'));
});

test('userVisibleForFeatureSql(leaderboard): emits EXISTS with leaderboardOptIn, no legacy fallback', () => {
  const text = userVisibleForFeatureSql('u', 'leaderboard').sql;
  assert.ok(text.includes('"leaderboardOptIn"'));
  assert.ok(!text.includes('NOT EXISTS'));
});

test('userVisibleForFeatureSql(badges): emits EXISTS with badgesEnabled, no legacy fallback', () => {
  const text = userVisibleForFeatureSql('u', 'badges').sql;
  assert.ok(text.includes('"badgesEnabled"'));
  assert.ok(!text.includes('NOT EXISTS'));
});