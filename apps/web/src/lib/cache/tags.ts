/**
 * Cache tag taxonomy for Next.js `unstable_cache` + `revalidateTag`.
 *
 * All public surfaces that read user/repo/leaderboard data must register
 * with these tags so that privacy/lifecycle changes (privacy toggle,
 * repo visibility change, account deletion, suspension) can invalidate
 * the affected caches immediately.
 *
 * See `docs/gdpr/promptstreak-mvp-gdpr-security-acceptance-criteria.md` §16.
 */

/** Per-user public surface (profile, badges, anything keyed on a single user). */
export function userTag(userId: string): string {
  return `user:${userId}`;
}

/** Per-user badge surface (subset of userTag for finer invalidation). */
export function userBadgesTag(userId: string): string {
  return `user:${userId}:badges`;
}

/** Per-username badge cache (used when only the username is known at read time). */
export function userBadgesByUsernameTag(username: string): string {
  return `username:${username}:badges`;
}

/** Per-repo public surface, scoped to a single user's RepoStat row. */
export function repoTag(userId: string, repoSlug: string): string {
  return `user:${userId}:repo:${repoSlug}`;
}

/** Per-repo aggregated public surface (keyed only on slug, used by repo badges). */
export function repoSlugTag(repoSlug: string): string {
  return `repo:${repoSlug}`;
}

/** Global leaderboard surface — invalidate on any user lifecycle change that affects rankings. */
export function leaderboardTag(): string {
  return 'leaderboard:global';
}

/** Bundle of tags to invalidate when a single user's privacy/lifecycle state changes. */
export function tagsForUserChange(userId: string, username: string): string[] {
  return [
    userTag(userId),
    userBadgesTag(userId),
    userBadgesByUsernameTag(username),
    leaderboardTag(),
  ];
}
