import { PrismaClient } from '@prisma/client';

/**
 * Tables that {@link withTestDb} leaves alone. `_prisma_migrations` must
 * survive between tests so the schema stays applied.
 */
const PRESERVED_TABLES = new Set(['_prisma_migrations']);

export interface TestDbContext {
  prisma: PrismaClient;
}

/**
 * Run an integration-test callback against `DATABASE_URL_TEST`. Every
 * invocation truncates all user-data tables (with `RESTART IDENTITY CASCADE`)
 * before executing the callback, so individual tests get a clean schema
 * without paying for a migration cycle.
 *
 * The helper also defends against accidentally pointing the test runner at a
 * production database by requiring the DB name to contain "test".
 */
export async function withTestDb<T>(fn: (ctx: TestDbContext) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL_TEST must be set to run integration tests');
  }
  const dbName = parseDatabaseName(url);
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}" (name must contain "test")`,
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await truncateAll(prisma);
    return await fn({ prisma });
  } finally {
    await prisma.$disconnect();
  }
}

function parseDatabaseName(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '').split('?')[0] ?? '';
  } catch {
    throw new Error(`DATABASE_URL_TEST is not a valid URL: ${url}`);
  }
}

async function truncateAll(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => !PRESERVED_TABLES.has(t));
  if (tables.length === 0) return;
  const quoted = tables.map((t) => `"public"."${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}
