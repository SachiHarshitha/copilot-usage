import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { withTestDb } from '../test/withTestDb';
import {
  ABSOLUTE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  createSession,
  hashSessionToken,
  generateSessionToken,
  revokeAllSessionsForAdmin,
  revokeSession,
  validateSession,
} from './session';

function uniqEmail(): string {
  return `admin-${randomBytes(4).toString('hex')}@example.com`;
}

test('generateSessionToken produces 43+ char base64url tokens (32 bytes)', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1_000; i += 1) {
    const t = generateSessionToken();
    assert.match(t, /^[A-Za-z0-9_-]+$/);
    assert.ok(t.length >= 43);
    assert.equal(seen.has(t), false);
    seen.add(t);
  }
});

test('hashSessionToken is stable sha256 hex', () => {
  assert.equal(hashSessionToken('hello'), hashSessionToken('hello'));
  assert.notEqual(hashSessionToken('hello'), hashSessionToken('hellO'));
  assert.match(hashSessionToken('hello'), /^[a-f0-9]{64}$/);
});

test('createSession stores only the hash; raw token never persisted', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const { token, session } = await createSession(prisma, { adminUserId: admin.id });
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(session.tokenHash, hashSessionToken(token));
    assert.notEqual(session.tokenHash, token);

    const stored = await prisma.adminSession.findUnique({ where: { id: session.id } });
    assert.ok(stored);
    assert.equal(stored.tokenHash, hashSessionToken(token));
  });
});

test('createSession sets idle and absolute expiries from constants', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const before = Date.now();
    const { session } = await createSession(prisma, { adminUserId: admin.id });
    const after = Date.now();

    const idle = session.idleExpiresAt.getTime();
    const abs = session.absoluteExpiresAt.getTime();
    assert.ok(idle >= before + IDLE_TIMEOUT_MS - 100);
    assert.ok(idle <= after + IDLE_TIMEOUT_MS + 100);
    assert.ok(abs >= before + ABSOLUTE_TIMEOUT_MS - 100);
    assert.ok(abs <= after + ABSOLUTE_TIMEOUT_MS + 100);
  });
});

test('validateSession returns the admin and slides idleExpiresAt forward', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const { token, session } = await createSession(prisma, { adminUserId: admin.id });

    // Push idleExpiresAt back so we can detect the slide
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { idleExpiresAt: new Date(Date.now() + 60_000) },
    });

    const result = await validateSession(prisma, token);
    assert.ok(result);
    assert.equal(result.adminUser.id, admin.id);
    assert.equal(result.session.id, session.id);
    assert.ok(result.session.idleExpiresAt.getTime() >= Date.now() + IDLE_TIMEOUT_MS - 100);
  });
});

test('validateSession returns null for unknown tokens', async () => {
  await withTestDb(async ({ prisma }) => {
    const result = await validateSession(prisma, generateSessionToken());
    assert.equal(result, null);
  });
});

test('validateSession returns null when the idle window has elapsed', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const { token, session } = await createSession(prisma, { adminUserId: admin.id });
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { idleExpiresAt: new Date(Date.now() - 1_000) },
    });
    assert.equal(await validateSession(prisma, token), null);
  });
});

test('validateSession returns null past the absolute window even when idle is fresh', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const { token, session } = await createSession(prisma, { adminUserId: admin.id });
    await prisma.adminSession.update({
      where: { id: session.id },
      data: {
        idleExpiresAt: new Date(Date.now() + 60 * 60_000),
        absoluteExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    assert.equal(await validateSession(prisma, token), null);
  });
});

test('validateSession refuses revoked sessions', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const { token, session } = await createSession(prisma, { adminUserId: admin.id });
    await revokeSession(prisma, session.id);
    assert.equal(await validateSession(prisma, token), null);
  });
});

test('revokeAllSessionsForAdmin invalidates every existing session for that admin', async () => {
  await withTestDb(async ({ prisma }) => {
    const admin = await prisma.adminUser.create({
      data: { email: uniqEmail(), passwordHash: 'h' },
    });
    const tokens: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { token } = await createSession(prisma, { adminUserId: admin.id });
      tokens.push(token);
    }

    await revokeAllSessionsForAdmin(prisma, admin.id);

    for (const token of tokens) {
      assert.equal(await validateSession(prisma, token), null);
    }
  });
});
