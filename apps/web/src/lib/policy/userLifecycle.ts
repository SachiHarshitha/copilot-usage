/**
 * Centralized user-lifecycle policy.
 *
 * A user is "active and present" when `status === 'ACTIVE'` AND `deletedAt`
 * is null. Soft-deleted users keep `status='ACTIVE'` but receive a non-null
 * `deletedAt` (see `User.deletedAt` doc-comment in `prisma/schema.prisma`).
 *
 * This module is the single source of truth for which users may appear on
 * any public surface (profiles, leaderboards, badges, repo stats). Public
 * readers must combine these predicates with feature-specific opt-ins
 * (e.g. `profilePublic`, `leaderboardOptIn`, `badgesEnabled`) to satisfy the
 * MVP privacy acceptance criteria in
 * `docs/gdpr/promptstreak-mvp-gdpr-security-acceptance-criteria.md`.
 */

import { Prisma } from '@prisma/client';

export type UserLifecycle = {
  status: 'ACTIVE' | 'SUSPENDED';
  deletedAt: Date | null;
};

/**
 * Public surfaces that consult independent privacy opt-ins. Each feature has
 * its own predicate combining lifecycle checks with the relevant flag(s) on
 * `PrivacySettings`.
 *
 * - `profile`: `PrivacySettings.profilePublic = true` (with bridge fallback
 *   to legacy `User.profilePublic` when no PrivacySettings row exists).
 * - `leaderboard`: requires both `profilePublic` AND `leaderboardOptIn`.
 * - `badges`: requires both `profilePublic` AND `badgesEnabled`.
 *
 * For `leaderboard` and `badges` there is NO legacy fallback — those
 * opt-ins are new in Phase 2 and default to false (privacy-first).
 */
export type PublicFeature = 'profile' | 'leaderboard' | 'badges';

/**
 * In-memory user shape with the optional PrivacySettings relation included.
 * Use Prisma `include: { privacySettings: true }` when loading.
 */
export type UserWithPrivacy = UserLifecycle & {
  profilePublic: boolean;
  privacySettings: {
    profilePublic: boolean;
    leaderboardOptIn: boolean;
    badgesEnabled: boolean;
  } | null;
};

/**
 * True when the user is active (not suspended) and not soft-deleted.
 * Does NOT consider opt-in flags such as `profilePublic`.
 */
export function isUserActive(user: UserLifecycle): boolean {
  return user.status === 'ACTIVE' && user.deletedAt === null;
}

function effectiveProfilePublic(user: UserWithPrivacy): boolean {
  // Bridge: while some users may not yet have a PrivacySettings row (existing
  // accounts that have not signed in since Phase 1c), fall back to the legacy
  // `User.profilePublic` column. Phase 2 mirrors writes both ways so the two
  // remain in sync; backfill + bake period closes the gap before this fallback
  // is removed.
  if (user.privacySettings) return user.privacySettings.profilePublic === true;
  return user.profilePublic === true;
}

/**
 * True when the user may appear on the given public surface today: lifecycle
 * checks pass AND the relevant opt-in(s) are enabled.
 */
export function isUserVisibleForFeature(
  user: UserWithPrivacy,
  feature: PublicFeature
): boolean {
  if (!isUserActive(user)) return false;
  if (!effectiveProfilePublic(user)) return false;
  if (feature === 'profile') return true;
  if (!user.privacySettings) return false; // privacy-first: no row, no opt-in
  if (feature === 'leaderboard') return user.privacySettings.leaderboardOptIn === true;
  if (feature === 'badges') return user.privacySettings.badgesEnabled === true;
  return false;
}

/**
 * @deprecated Phase 2.1 — prefer `isUserVisibleForFeature(user, 'profile')`
 * and pass `include: { privacySettings: true }` when loading the user.
 * Retained for callers still on the legacy single-flag model.
 */
export function isUserPubliclyVisible(
  user: UserLifecycle & { profilePublic: boolean }
): boolean {
  return isUserActive(user) && user.profilePublic === true;
}

/**
 * Prisma `where` clause fragment for "active and present" users.
 * Use as `prisma.user.findMany({ where: { ...userActiveWhere() } })`.
 */
export function userActiveWhere() {
  return { status: 'ACTIVE' as const, deletedAt: null };
}

/**
 * Prisma `where` clause fragment for users visible on a given public feature.
 *
 * Combines lifecycle + the relevant opt-in(s). For `profile`, falls back to
 * legacy `User.profilePublic` when no PrivacySettings row exists (bridge
 * window). For `leaderboard`/`badges`, requires an explicit PrivacySettings
 * row with both `profilePublic` AND the feature flag set to true.
 */
export function userVisibleForFeatureWhere(
  feature: PublicFeature
): Prisma.UserWhereInput {
  const base = userActiveWhere();
  if (feature === 'profile') {
    return {
      ...base,
      OR: [
        { privacySettings: { is: { profilePublic: true } } },
        { privacySettings: null, profilePublic: true },
      ],
    };
  }
  const flagField = feature === 'leaderboard' ? 'leaderboardOptIn' : 'badgesEnabled';
  return {
    ...base,
    privacySettings: { is: { profilePublic: true, [flagField]: true } },
  };
}

/**
 * @deprecated Phase 2.1 — prefer `userVisibleForFeatureWhere('profile')`.
 */
export function userPubliclyVisibleWhere() {
  return { ...userActiveWhere(), profilePublic: true };
}

/**
 * Raw-SQL predicate fragment for users visible on a given public feature,
 * scoped to a `User` table alias. Intended for use inside `prisma.$queryRaw`.
 *
 * Uses EXISTS subqueries against `PrivacySettings` so callers do NOT need to
 * add a JOIN. For `profile`, falls back to legacy `User.profilePublic` when
 * no PrivacySettings row exists.
 *
 * Example:
 *   `WHERE ${userVisibleForFeatureSql('u', 'leaderboard')} AND ud.date >= ${since}`
 */
export function userVisibleForFeatureSql(
  userTableAlias: string,
  feature: PublicFeature
): Prisma.Sql {
  const u = Prisma.raw(`"${userTableAlias}"`);
  const lifecycle = Prisma.sql`${u}."status" = 'ACTIVE' AND ${u}."deletedAt" IS NULL`;
  if (feature === 'profile') {
    return Prisma.sql`${lifecycle}
      AND (
        EXISTS (SELECT 1 FROM "PrivacySettings" ps WHERE ps."userId" = ${u}."id" AND ps."profilePublic" = true)
        OR (
          NOT EXISTS (SELECT 1 FROM "PrivacySettings" ps WHERE ps."userId" = ${u}."id")
          AND ${u}."profilePublic" = true
        )
      )`;
  }
  const flagCol = feature === 'leaderboard' ? 'leaderboardOptIn' : 'badgesEnabled';
  return Prisma.sql`${lifecycle}
    AND EXISTS (
      SELECT 1 FROM "PrivacySettings" ps
      WHERE ps."userId" = ${u}."id"
        AND ps."profilePublic" = true
        AND ps.${Prisma.raw(`"${flagCol}"`)} = true
    )`;
}

/**
 * @deprecated Phase 2.1 — prefer `userVisibleForFeatureSql(alias, 'profile')`.
 */
export function userPubliclyVisibleSql(userTableAlias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`"${userTableAlias}"."status"`)} = 'ACTIVE'
    AND ${Prisma.raw(`"${userTableAlias}"."deletedAt"`)} IS NULL
    AND ${Prisma.raw(`"${userTableAlias}"."profilePublic"`)} = true`;
}
