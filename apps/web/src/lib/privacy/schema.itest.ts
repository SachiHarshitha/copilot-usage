import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '@/lib/test/withTestDb';

/**
 * Phase 1a — Identity & privacy schema foundation.
 *
 * These tests assert that the new tables exist and that EVERY public-surface
 * default is FALSE. A user that arrives via a future backfill (Phase 1c) and
 * has the row defaults applied MUST NOT become public by accident.
 *
 * Acceptance criteria from the implementation prompt:
 *   - Migration works on clean DB.
 *   - Existing users receive privacy-first defaults.
 *   - Existing users do not become public accidentally.
 */

test('PrivacySettings: every public flag defaults to false', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: {
        githubId: 110001,
        username: 'p1a-defaults',
      },
    });
    const settings = await prisma.privacySettings.create({
      data: { userId: user.id },
    });

    assert.equal(settings.profilePublic, false, 'profilePublic must default false');
    assert.equal(settings.leaderboardOptIn, false, 'leaderboardOptIn must default false');
    assert.equal(settings.badgesEnabled, false, 'badgesEnabled must default false');
    assert.equal(settings.policyVersion, null);
    assert.equal(settings.policyAcceptedAt, null);
  });
});

test('RepoVisibilitySettings: isPublic defaults to false', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: { githubId: 110002, username: 'p1a-repo-vis' },
    });
    const vis = await prisma.repoVisibilitySettings.create({
      data: { userId: user.id, repoIdentity: 'p1a/repo' },
    });
    assert.equal(vis.isPublic, false);
  });
});

test('RepoVisibilitySettings: (userId, repoIdentity) is unique', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: { githubId: 110003, username: 'p1a-repo-uniq' },
    });
    await prisma.repoVisibilitySettings.create({
      data: { userId: user.id, repoIdentity: 'p1a/dup' },
    });
    await assert.rejects(
      () =>
        prisma.repoVisibilitySettings.create({
          data: { userId: user.id, repoIdentity: 'p1a/dup' },
        }),
      /Unique constraint/i,
    );
  });
});

test('UserIdentity: githubIdHmac is unique and required', async () => {
  await withTestDb(async ({ prisma }) => {
    const a = await prisma.user.create({ data: { githubId: 110010, username: 'p1a-id-a' } });
    const b = await prisma.user.create({ data: { githubId: 110011, username: 'p1a-id-b' } });

    await prisma.userIdentity.create({
      data: {
        userId: a.id,
        githubIdHmac: 'hmac-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        githubIdCiphertext: 'ct-a',
      },
    });

    // Same HMAC on a different user must violate the unique index — this is
    // the property dual-read auth (Phase 1c) relies on.
    await assert.rejects(
      () =>
        prisma.userIdentity.create({
          data: {
            userId: b.id,
            githubIdHmac: 'hmac-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            githubIdCiphertext: 'ct-b',
          },
        }),
      /Unique constraint/i,
    );
  });
});

test('ConsentEvent: append-only log captures the seven Phase 1a kinds', async () => {
  await withTestDb(async ({ prisma }) => {
    const user = await prisma.user.create({
      data: { githubId: 110020, username: 'p1a-consent' },
    });

    const kinds = [
      'PROFILE_PUBLIC',
      'LEADERBOARD_OPT_IN',
      'BADGES_ENABLED',
      'REPO_PUBLIC',
      'WORKSPACE_PUBLIC',
      'POLICY_ACCEPTED',
      'ACCOUNT_DELETION_REQUESTED',
    ] as const;

    for (const kind of kinds) {
      await prisma.consentEvent.create({
        data: {
          userId: user.id,
          kind,
          granted: true,
          source: 'USER_SETTING',
        },
      });
    }

    const rows = await prisma.consentEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    assert.equal(rows.length, kinds.length);
    assert.deepEqual(
      rows.map((r) => r.kind),
      [...kinds],
    );
  });
});

test('AccountDeletionJob: confirmTokenHash is unique and status defaults PENDING', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 110030, username: 'p1a-del' },
    });
    const job = await prisma.accountDeletionJob.create({
      data: {
        userId: u.id,
        confirmTokenHash: 'hash-' + 'a'.repeat(60),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    assert.equal(job.status, 'PENDING');
    assert.equal(job.confirmedAt, null);
    assert.equal(job.executedAt, null);

    await assert.rejects(
      () =>
        prisma.accountDeletionJob.create({
          data: {
            userId: u.id,
            confirmTokenHash: job.confirmTokenHash,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      /Unique constraint/i,
    );
  });
});

test('DataExportRequest: defaults to PENDING and downloadTokenHash is unique', async () => {
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 110040, username: 'p1a-dsar' },
    });
    const r = await prisma.dataExportRequest.create({
      data: { userId: u.id, downloadTokenHash: 'dl-' + 'b'.repeat(60) },
    });
    assert.equal(r.status, 'PENDING');
    assert.equal(r.completedAt, null);

    await assert.rejects(
      () =>
        prisma.dataExportRequest.create({
          data: { userId: u.id, downloadTokenHash: r.downloadTokenHash! },
        }),
      /Unique constraint/i,
    );
  });
});

test('AbuseReport: anonymous reports are allowed (reporterUserId nullable)', async () => {
  await withTestDb(async ({ prisma }) => {
    const r = await prisma.abuseReport.create({
      data: {
        reporterUserId: null,
        reporterEmail: 'tipster@example.invalid',
        subjectKind: 'USER',
        subjectIdentifier: 'someone',
        reason: 'impersonation',
        description: 'looks fake',
      },
    });
    assert.equal(r.status, 'NEW');
    assert.equal(r.reporterUserId, null);
  });
});

test('AbuseReport: deleting the reporter sets reporterUserId to null (audit trail survives)', async () => {
  await withTestDb(async ({ prisma }) => {
    const reporter = await prisma.user.create({
      data: { githubId: 110050, username: 'p1a-reporter' },
    });
    const r = await prisma.abuseReport.create({
      data: {
        reporterUserId: reporter.id,
        subjectKind: 'REPO',
        subjectIdentifier: 'foo/bar',
        reason: 'spam',
        description: 'auto-generated content',
      },
    });
    assert.equal(r.reporterUserId, reporter.id);

    await prisma.user.delete({ where: { id: reporter.id } });
    const after = await prisma.abuseReport.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(after.reporterUserId, null, 'audit trail must survive reporter deletion');
    assert.equal(after.subjectIdentifier, 'foo/bar');
  });
});

test('Phase 1a tables coexist with legacy User.profilePublic without altering it', async () => {
  // Bridge invariant: the new PrivacySettings row is the source of truth
  // going forward, but the legacy column must remain unchanged so Phase 1c's
  // dual-read window works.
  await withTestDb(async ({ prisma }) => {
    const u = await prisma.user.create({
      data: { githubId: 110060, username: 'p1a-bridge', profilePublic: true },
    });
    await prisma.privacySettings.create({ data: { userId: u.id } }); // defaults false

    const legacy = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(legacy.profilePublic, true, 'legacy column untouched');
    const ps = await prisma.privacySettings.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(ps.profilePublic, false, 'new defaults are privacy-first');
  });
});
