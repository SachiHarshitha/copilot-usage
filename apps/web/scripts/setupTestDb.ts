/**
 * Set up the integration-test database.
 *
 *   pnpm --filter web db:test:setup        # create if missing, push schema
 *   pnpm --filter web db:test:reset        # drop, recreate, push schema
 *
 * Requires DATABASE_URL_TEST in `apps/web/.env` (or the process env). Refuses
 * to operate on a database whose name does not contain "test".
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

import { applyAuditLogImmutability } from './applyAuditLogImmutability';

function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, '..', '.env');
  let raw: string;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

interface ParsedUrl {
  adminUrl: string;
  testUrl: string;
  dbName: string;
}

function parseTestUrl(): ParsedUrl {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error('DATABASE_URL_TEST is required');
  }
  const u = new URL(testUrl);
  const dbName = u.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/test/i.test(dbName)) {
    throw new Error(`Database name "${dbName}" must contain "test"`);
  }
  const admin = new URL(testUrl);
  admin.pathname = '/postgres';
  admin.search = '';
  return { adminUrl: admin.toString(), testUrl, dbName };
}

async function databaseExists(prisma: PrismaClient, dbName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists`,
    dbName,
  );
  return rows[0]?.exists === true;
}

async function ensureDatabase(reset: boolean): Promise<string> {
  const { adminUrl, dbName } = parseTestUrl();
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const exists = await databaseExists(admin, dbName);
    if (exists && reset) {
      await admin.$executeRawUnsafe(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    }
    if (!exists || reset) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`[db:test] created ${dbName}`);
    } else {
      console.log(`[db:test] ${dbName} already exists`);
    }
  } finally {
    await admin.$disconnect();
  }
  return dbName;
}

function pushSchema(): void {
  // On Windows pnpm resolves to pnpm.cmd, which spawnSync can't locate
  // without `shell: true`. We pass argv as a single pre-built string and
  // skip user-supplied interpolation, so the shell-injection vector flagged
  // by DEP0190 does not apply here.
  const cmd = 'pnpm exec prisma db push --skip-generate --accept-data-loss';
  const result = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const reset = process.argv.includes('--reset');
  await ensureDatabase(reset);
  pushSchema();
  console.log('[db:test] schema pushed');
  const testUrl = process.env.DATABASE_URL_TEST;
  if (testUrl) {
    await applyAuditLogImmutability(testUrl);
    console.log('[db:test] audit-log immutability trigger applied');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
