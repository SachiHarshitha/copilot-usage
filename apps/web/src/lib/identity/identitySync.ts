import type { Prisma, PrismaClient, User } from '@prisma/client';

import {
  activeIdentityKeyVersion,
  encryptGithubId,
  encryptEmail,
  hmacGithubId,
  hmacEmail,
} from '@/lib/crypto/identityCrypto';

/**
 * Phase 1c — backfill + dual-read helpers that bridge legacy `User.githubId`
 * with the new `UserIdentity` and `PrivacySettings` rows.
 *
 * Rules:
 *  - Identity-crypto integration is OPT-IN via env. When `IDENTITY_ENCRYPTION_KEYS`
 *    is absent (e.g. local dev without keys, CI smoke runs), every helper is a
 *    no-op so legacy sign-in still works.
 *  - All helpers are idempotent — safe to call on every sign-in and during
 *    backfill scripts.
 *  - Backfill defaults `PrivacySettings` to fully PRIVATE regardless of the
 *    legacy `User.profilePublic` column. This is the GDPR-MVP "privacy-first
 *    reset" — users must explicitly re-consent in Phase 2.
 */

export type PrismaTx = PrismaClient | Prisma.TransactionClient;

export function isIdentityCryptoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.IDENTITY_ENCRYPTION_KEYS && env.IDENTITY_ENCRYPTION_ACTIVE_KEY && env.IDENTITY_HMAC_PEPPER,
  );
}

/**
 * Idempotently create a `PrivacySettings` row for `userId` with all flags
 * defaulting to `false`. Returns `true` if a row was created, `false` if one
 * already existed.
 */
export async function ensurePrivacySettings(prisma: PrismaTx, userId: string): Promise<boolean> {
  const existing = await prisma.privacySettings.findUnique({ where: { userId } });
  if (existing) return false;
  await prisma.privacySettings.create({ data: { userId } });
  return true;
}

/**
 * Idempotently create the encrypted `UserIdentity` row for an existing user.
 * No-op (returns false) when identity crypto is disabled or the row already
 * exists. Throws if the user is missing.
 */
export async function ensureUserIdentity(
  prisma: PrismaTx,
  user: Pick<User, 'id' | 'githubId'> & { email?: string | null },
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isIdentityCryptoEnabled(env)) return false;
  const existing = await prisma.userIdentity.findUnique({ where: { userId: user.id } });
  if (existing) return false;

  const githubIdHmac = hmacGithubId(user.githubId);
  const githubIdCiphertext = encryptGithubId(user.githubId);

  let emailHmac: string | null = null;
  let emailCiphertext: string | null = null;
  if (user.email) {
    try {
      emailHmac = hmacEmail(user.email);
      emailCiphertext = encryptEmail(user.email);
    } catch {
      // Malformed legacy email — keep the identity row but leave email fields null.
      emailHmac = null;
      emailCiphertext = null;
    }
  }

  await prisma.userIdentity.create({
    data: {
      userId: user.id,
      githubIdHmac,
      githubIdCiphertext,
      emailHmac,
      emailCiphertext,
      keyVersion: activeIdentityKeyVersion(),
    },
  });
  return true;
}

/**
 * Dual-read lookup by GitHub numeric id.
 *
 *  1. If identity crypto is enabled, try `UserIdentity.githubIdHmac` first.
 *  2. Fall back to legacy `User.githubId`.
 *
 * Returns `null` if neither path finds a user. Always returns the legacy
 * `User` row (consumers don't need to know about the bridge).
 */
export async function findUserByGithubId(
  prisma: PrismaTx,
  githubId: number | string | bigint,
  env: NodeJS.ProcessEnv = process.env,
): Promise<User | null> {
  if (isIdentityCryptoEnabled(env)) {
    const hmac = hmacGithubId(githubId);
    const identity = await prisma.userIdentity.findUnique({
      where: { githubIdHmac: hmac },
      include: { user: true },
    });
    if (identity?.user) return identity.user;
  }

  const numeric =
    typeof githubId === 'number'
      ? githubId
      : typeof githubId === 'bigint'
        ? Number(githubId)
        : Number.parseInt(githubId, 10);
  if (!Number.isFinite(numeric)) return null;
  return prisma.user.findUnique({ where: { githubId: numeric } });
}
