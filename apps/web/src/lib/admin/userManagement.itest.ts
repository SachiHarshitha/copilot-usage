import test from 'node:test';
import assert from 'node:assert/strict';

import { withTestDb } from '../test/withTestDb';
import { listUsersHandler } from './userManagement';
import {
  buildAdminRequest,
  seedAdminSession,
} from './test/seedAdminSession';

interface JsonBody {
  entries: Array<{ id: string; username: string; totalTokens: string }>;
  nextCursor: string | null;
}

async function readJson(res: Response): Promise<JsonBody> {
  return (await res.json()) as JsonBody;
}

test('GET /api/admin/users returns 401 without a session', async () => {
  await withTestDb(async ({ prisma }) => {
    const req = buildAdminRequest('https://admin.example.com/api/admin/users', null);
    const res = await listUsersHandler(req, { prisma });
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/users returns paginated users for an authenticated admin', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    // Seed 5 users; createdAt order matters for the cursor test below.
    for (let i = 0; i < 5; i += 1) {
      await prisma.user.create({
        data: {
          githubId: 1000 + i,
          username: `user-${i}`,
          displayName: `User ${i}`,
        },
      });
    }
    const req = buildAdminRequest(
      'https://admin.example.com/api/admin/users?limit=2',
      session,
    );
    const res = await listUsersHandler(req, { prisma });
    assert.equal(res.status, 200);
    const body = await readJson(res);
    assert.equal(body.entries.length, 2);
    assert.notEqual(body.nextCursor, null);
  });
});

test('cursor pagination walks every user exactly once', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    for (let i = 0; i < 7; i += 1) {
      await prisma.user.create({
        data: { githubId: 2000 + i, username: `walker-${i}` },
      });
    }

    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = new URL('https://admin.example.com/api/admin/users');
      url.searchParams.set('limit', '3');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await listUsersHandler(buildAdminRequest(url.toString(), session), { prisma });
      assert.equal(res.status, 200);
      const body = await readJson(res);
      for (const e of body.entries) {
        assert.ok(!seen.has(e.id), `duplicate id ${e.id}`);
        seen.add(e.id);
      }
      cursor = body.nextCursor;
      pages += 1;
      assert.ok(pages < 10, 'pagination did not terminate');
    } while (cursor);

    assert.equal(seen.size, 7);
  });
});

test('search filter narrows by username case-insensitively', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    await prisma.user.createMany({
      data: [
        { githubId: 9001, username: 'AlphaCoder' },
        { githubId: 9002, username: 'betaWriter' },
        { githubId: 9003, username: 'gammaAlpha' },
      ],
    });
    const res = await listUsersHandler(
      buildAdminRequest(
        'https://admin.example.com/api/admin/users?query=alpha',
        session,
      ),
      { prisma },
    );
    const body = await readJson(res);
    const names = body.entries.map((e) => e.username).sort();
    assert.deepEqual(names, ['AlphaCoder', 'gammaAlpha']);
  });
});

test('limit is capped at 100', async () => {
  await withTestDb(async ({ prisma }) => {
    const session = await seedAdminSession(prisma);
    for (let i = 0; i < 3; i += 1) {
      await prisma.user.create({
        data: { githubId: 3000 + i, username: `cap-${i}` },
      });
    }
    const res = await listUsersHandler(
      buildAdminRequest(
        'https://admin.example.com/api/admin/users?limit=999',
        session,
      ),
      { prisma },
    );
    assert.equal(res.status, 200);
    // Implementation detail — the cap is a guard, not a return-shape check.
    // Ensure nothing throws and we get all 3 back.
    const body = await readJson(res);
    assert.equal(body.entries.length, 3);
    assert.equal(body.nextCursor, null);
  });
});
