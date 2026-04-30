/**
 * Apply the AdminActionLog append-only trigger to a Postgres database.
 *
 *   pnpm --filter web exec tsx scripts/applyAuditLogImmutability.ts            # uses DATABASE_URL
 *   pnpm --filter web exec tsx scripts/applyAuditLogImmutability.ts --test     # uses DATABASE_URL_TEST
 *
 * Idempotent. Run once per database after `prisma db push`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';

export const SQL_PATH = path.resolve(__dirname, '..', 'sql', 'admin-action-log-immutable.sql');

export async function applyAuditLogImmutability(databaseUrl: string): Promise<void> {
  const sql = readFileSync(SQL_PATH, 'utf8');
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    // The SQL file uses `--SPLIT--` to delimit individual statements. We
    // can't naively split on `;` because the function body is dollar-quoted
    // (`$$ ... ; ... $$`) and contains its own semicolons.
    const statements = sql
      .split(/^--SPLIT--\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.split(/\r?\n/).every((l) => l.trim().startsWith('--') || l.trim() === ''));
    for (const stmt of statements) {
      await client.$executeRawUnsafe(stmt);
    }
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<void> {
  const useTest = process.argv.includes('--test');
  const url = useTest ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(useTest ? 'DATABASE_URL_TEST is required' : 'DATABASE_URL is required');
  }
  await applyAuditLogImmutability(url);
  console.log('[audit-log] immutability trigger applied');
}

// Only run when invoked directly, not when imported by the test setup script.
const invokedDirectly =
  typeof require !== 'undefined' && require.main === module;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
