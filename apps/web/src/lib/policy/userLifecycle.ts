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
 * True when the user is active (not suspended) and not soft-deleted.
 * Does NOT consider opt-in flags such as `profilePublic`.
 */
export function isUserActive(user: UserLifecycle): boolean {
  return user.status === 'ACTIVE' && user.deletedAt === null;
}

/**
 * True when the user may appear on any public surface today: lifecycle
 * checks pass AND the legacy `profilePublic` opt-in is enabled.
 *
 * Phase 2.1 will extend the opt-in side with `leaderboardOptIn` /
 * `badgesEnabled`; for Phase Q we keep the existing single flag.
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
 * Prisma `where` clause fragment for "publicly visible" users
 * (active + present + `profilePublic`).
 */
export function userPubliclyVisibleWhere() {
  return { ...userActiveWhere(), profilePublic: true };
}

/**
 * Raw-SQL predicate fragment for "publicly visible" users, scoped to a
 * `User` table alias. Intended for use inside `prisma.$queryRaw`.
 *
 * Example:
 *   `WHERE ${userPubliclyVisibleSql('u')} AND ud."date" >= ${since}`
 */
export function userPubliclyVisibleSql(userTableAlias: string): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(`"${userTableAlias}"."status"`)} = 'ACTIVE'
    AND ${Prisma.raw(`"${userTableAlias}"."deletedAt"`)} IS NULL
    AND ${Prisma.raw(`"${userTableAlias}"."profilePublic"`)} = true`;
}
