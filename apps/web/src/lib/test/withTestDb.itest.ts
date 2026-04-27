import assert from 'node:assert/strict';
import test from 'node:test';

import { withTestDb } from './withTestDb';

test('withTestDb provides a PrismaClient pointed at DATABASE_URL_TEST', async () => {
  await withTestDb(async ({ prisma }) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
      'SELECT current_database() AS db',
    );
    assert.match(rows[0].db, /test/i);
  });
});

test('withTestDb truncates user-data tables before each invocation', async () => {
  await withTestDb(async ({ prisma }) => {
    await prisma.user.create({
      data: {
        githubId: 9_900_001,
        username: 'truncate-probe',
        displayName: 'Probe',
      },
    });
    assert.equal(await prisma.user.count({ where: { username: 'truncate-probe' } }), 1);
  });

  await withTestDb(async ({ prisma }) => {
    assert.equal(await prisma.user.count({ where: { username: 'truncate-probe' } }), 0);
  });
});

test('withTestDb returns the callback result and runs the callback exactly once', async () => {
  let calls = 0;
  const result = await withTestDb(async () => {
    calls += 1;
    return 'ok';
  });
  assert.equal(calls, 1);
  assert.equal(result, 'ok');
});

test('withTestDb refuses to run when DATABASE_URL_TEST is missing', async () => {
  const prev = process.env.DATABASE_URL_TEST;
  delete process.env.DATABASE_URL_TEST;
  try {
    await assert.rejects(
      () => withTestDb(async () => undefined),
      /DATABASE_URL_TEST/,
    );
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL_TEST = prev;
  }
});

test('withTestDb refuses a URL that does not look like a test database', async () => {
  const prev = process.env.DATABASE_URL_TEST;
  process.env.DATABASE_URL_TEST = 'postgresql://postgres:postgres@localhost:5432/promptstreak';
  try {
    await assert.rejects(
      () => withTestDb(async () => undefined),
      /test/i,
    );
  } finally {
    if (prev !== undefined) process.env.DATABASE_URL_TEST = prev;
    else delete process.env.DATABASE_URL_TEST;
  }
});
