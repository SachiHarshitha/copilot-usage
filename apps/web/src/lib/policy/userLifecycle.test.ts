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
