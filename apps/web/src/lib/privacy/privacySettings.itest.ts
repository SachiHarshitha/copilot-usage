import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';
import {
  loadPrivacySettings,
  updatePrivacySettings,
} from './privacySettings';

/**
 * Phase 2 — privacy settings writer + symmetric consent.
 *
 * Acceptance properties locked in by these tests:
 *  - New users are private by default.
 *  - Every grant writes a consent event with granted=true.
 *  - Every withdrawal writes a consent event with granted=false.
 *  - Withdrawal is exactly as easy as grant (same shape, same path).
 *  - No-op writes do not pollute the consent log.
 *  - Consent events do not carry plaintext secrets — only the boolean,
 *    request context, and stable enum kinds.
 *  - Per-field changes are independently audited (turning on `profilePublic`
 *    must not retroactively log `leaderboardOptIn`).
 */

test('loadPrivacySettings: auto-creates a privacy-first row for new users', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220001, username: 'p2-defaults' },
    });
    const view = await loadPrivacySettings(prisma, u.id);
    assert.equal(view.profilePublic, false);
    assert.equal(view.leaderboardOptIn, false);
    assert.equal(view.badgesEnabled, false);
    assert.equal(view.policyVersion, null);

    const events = await prisma.consentEvent.findMany({ where: { userId: u.id } });
    assert.equal(events.length, 0, 'auto-create must not log a consent event');
  });
});

test('updatePrivacySettings: granting profilePublic logs PROFILE_PUBLIC=true', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220010, username: 'p2-grant' },
    });
    const result = await updatePrivacySettings(
      prisma,
      u.id,
      { profilePublic: true },
      { ipHash: 'iphash-xyz', userAgent: 'curl/test' },
    );
    assert.deepEqual(result.changedKinds, ['PROFILE_PUBLIC']);
    assert.equal(result.before.profilePublic, false);
    assert.equal(result.after.profilePublic, true);

    const events = await prisma.consentEvent.findMany({ where: { userId: u.id } });
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'PROFILE_PUBLIC');
    assert.equal(events[0].granted, true);
    assert.equal(events[0].source, 'USER_SETTING');
    assert.equal(events[0].ipHash, 'iphash-xyz');
    assert.equal(events[0].userAgent, 'curl/test');
  });
});

test('updatePrivacySettings: withdrawal is symmetric and writes granted=false', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220020, username: 'p2-withdraw' },
    });
    await updatePrivacySettings(prisma, u.id, { leaderboardOptIn: true });
    const result = await updatePrivacySettings(prisma, u.id, { leaderboardOptIn: false });
    assert.deepEqual(result.changedKinds, ['LEADERBOARD_OPT_IN']);
    assert.equal(result.after.leaderboardOptIn, false);

    const events = await prisma.consentEvent.findMany({
      where: { userId: u.id, kind: 'LEADERBOARD_OPT_IN' },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(events.length, 2, 'one grant + one withdrawal');
    assert.deepEqual(
      events.map((e) => e.granted),
      [true, false],
    );
  });
});

test('updatePrivacySettings: no-op write does not pollute the consent log', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220030, username: 'p2-noop' },
    });
    await updatePrivacySettings(prisma, u.id, { badgesEnabled: true });
    const before = await prisma.consentEvent.count({ where: { userId: u.id } });

    const result = await updatePrivacySettings(prisma, u.id, { badgesEnabled: true });
    assert.deepEqual(result.changedKinds, []);
    assert.equal(result.before.badgesEnabled, true);
    assert.equal(result.after.badgesEnabled, true);

    const after = await prisma.consentEvent.count({ where: { userId: u.id } });
    assert.equal(after, before, 'no consent event for unchanged value');
  });
});

test('updatePrivacySettings: only changed fields are logged', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220040, username: 'p2-partial' },
    });
    // Pre-state: profilePublic=true, others false
    await updatePrivacySettings(prisma, u.id, { profilePublic: true });

    const result = await updatePrivacySettings(prisma, u.id, {
      profilePublic: true, // unchanged
      leaderboardOptIn: true, // changed
      badgesEnabled: false, // unchanged (still default)
    });
    assert.deepEqual(result.changedKinds, ['LEADERBOARD_OPT_IN']);

    const kinds = (
      await prisma.consentEvent.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((e) => e.kind);
    assert.deepEqual(kinds, ['PROFILE_PUBLIC', 'LEADERBOARD_OPT_IN']);
  });
});

test('updatePrivacySettings: ignores fields with non-boolean values (sanitization)', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220050, username: 'p2-sanitize' },
    });
    const result = await updatePrivacySettings(prisma, u.id, {
      profilePublic: 'yes' as unknown as boolean,
      badgesEnabled: 1 as unknown as boolean,
    });
    assert.deepEqual(result.changedKinds, []);
    assert.equal(result.after.profilePublic, false);
    assert.equal(result.after.badgesEnabled, false);
  });
});

test('consent log never carries plaintext credentials, only boolean + request context', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220060, username: 'p2-no-secrets' },
    });
    await updatePrivacySettings(
      prisma,
      u.id,
      { profilePublic: true },
      { ipHash: 'sha256-of-ip', userAgent: 'Mozilla/5.0' },
    );
    const event = await prisma.consentEvent.findFirstOrThrow({ where: { userId: u.id } });
    const dump = JSON.stringify(event);
    // Sanity: nothing that looks like a token, key, or password leaked.
    for (const forbidden of ['password', 'secret', 'token', 'cookie', 'authorization', 'bearer']) {
      assert.equal(dump.toLowerCase().includes(forbidden), false, `consent event leaked "${forbidden}"`);
    }
    // Positive: the boolean and request context are present.
    assert.equal(event.granted, true);
    assert.equal(event.ipHash, 'sha256-of-ip');
    assert.equal(event.userAgent, 'Mozilla/5.0');
  });
});

test('updatePrivacySettings: defaults source to USER_SETTING when not provided', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220070, username: 'p2-default-source' },
    });
    await updatePrivacySettings(prisma, u.id, { profilePublic: true });
    const e = await prisma.consentEvent.findFirstOrThrow({ where: { userId: u.id } });
    assert.equal(e.source, 'USER_SETTING');
  });
});

test('updatePrivacySettings: respects an explicit ADMIN_OVERRIDE source', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220080, username: 'p2-admin-source' },
    });
    await updatePrivacySettings(
      prisma,
      u.id,
      { profilePublic: true },
      { source: 'ADMIN_OVERRIDE' },
    );
    const e = await prisma.consentEvent.findFirstOrThrow({ where: { userId: u.id } });
    assert.equal(e.source, 'ADMIN_OVERRIDE');
  });
});

test('updatePrivacySettings: mirrors profilePublic to legacy User column (bridge)', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220090, username: 'p2-bridge' },
    });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).profilePublic, false);

    await updatePrivacySettings(prisma, u.id, { profilePublic: true });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).profilePublic,
      true,
      'legacy column mirrors grant',
    );

    await updatePrivacySettings(prisma, u.id, { profilePublic: false });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).profilePublic,
      false,
      'legacy column mirrors withdrawal',
    );
  });
});

test('updatePrivacySettings: changing only leaderboardOptIn does not touch User.profilePublic', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 220091, username: 'p2-bridge-isolated', profilePublic: true },
    });
    await updatePrivacySettings(prisma, u.id, { leaderboardOptIn: true });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).profilePublic,
      true,
      'legacy column untouched when only leaderboardOptIn changes',
    );
  });
});
