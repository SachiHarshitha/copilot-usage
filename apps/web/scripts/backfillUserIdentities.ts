#!/usr/bin/env node
/**
 * Phase 1c — backfill UserIdentity + PrivacySettings for every existing user.
 *
 *   pnpm --filter web tsx scripts/backfillUserIdentities.ts [--dry-run] [--batch-size=N]
 *
 * Idempotent. Re-running after a partial failure resumes from the first user
 * that still lacks an identity row.
 *
 * Required env (production-equivalent):
 *   IDENTITY_ENCRYPTION_KEYS, IDENTITY_ENCRYPTION_ACTIVE_KEY, IDENTITY_HMAC_PEPPER
 *   DATABASE_URL
 *
 * Privacy invariant: every PrivacySettings row written by this script defaults
 * all three flags (profilePublic, leaderboardOptIn, badgesEnabled) to FALSE,
 * regardless of the legacy `User.profilePublic` column. The MVP requires
 * explicit re-consent.
 */
import { PrismaClient } from '@prisma/client';

import {
  ensurePrivacySettings,
  ensureUserIdentity,
  isIdentityCryptoEnabled,
} from '../src/lib/identity/identitySync';

interface Args {
  dryRun: boolean;
  batchSize: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, batchSize: 200 };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--batch-size=')) {
      const n = Number.parseInt(a.slice('--batch-size='.length), 10);
      if (!Number.isFinite(n) || n < 1 || n > 5000) {
        throw new Error(`Invalid --batch-size value: ${a}`);
      }
      args.batchSize = n;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!isIdentityCryptoEnabled()) {
    throw new Error(
      'Backfill requires IDENTITY_ENCRYPTION_KEYS, IDENTITY_ENCRYPTION_ACTIVE_KEY, and IDENTITY_HMAC_PEPPER',
    );
  }

  const prisma = new PrismaClient();
  let cursor: string | undefined;
  let totalScanned = 0;
  let identitiesCreated = 0;
  let privacyRowsCreated = 0;

  console.log(
    `[backfill] starting${args.dryRun ? ' (DRY RUN)' : ''} — batchSize=${args.batchSize}`,
  );

  try {
    while (true) {
      const batch = await prisma.user.findMany({
        select: { id: true, githubId: true, username: true },
        orderBy: { id: 'asc' },
        take: args.batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;

      for (const u of batch) {
        totalScanned++;
        if (args.dryRun) {
          const hasIdentity = await prisma.userIdentity.findUnique({ where: { userId: u.id } });
          const hasPrivacy = await prisma.privacySettings.findUnique({ where: { userId: u.id } });
          if (!hasIdentity) identitiesCreated++;
          if (!hasPrivacy) privacyRowsCreated++;
          continue;
        }

        try {
          if (await ensureUserIdentity(prisma, u)) identitiesCreated++;
          if (await ensurePrivacySettings(prisma, u.id)) privacyRowsCreated++;
        } catch (err) {
          console.error(`[backfill] user=${u.id} (${u.username}) failed`, err);
          throw err;
        }
      }

      cursor = batch[batch.length - 1].id;
      console.log(
        `[backfill] processed ${totalScanned} users (identities+${identitiesCreated}, privacy+${privacyRowsCreated})`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `[backfill] done — scanned=${totalScanned} identities_created=${identitiesCreated} privacy_rows_created=${privacyRowsCreated}${args.dryRun ? ' (DRY RUN — no writes)' : ''}`,
  );
}

main().catch((err) => {
  console.error('[backfill] FAILED', err);
  process.exit(1);
});
