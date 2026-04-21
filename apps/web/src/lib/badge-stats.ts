import {
  LIFETIME_MILESTONES,
  RANK_TIERS,
  STREAK_MILESTONES,
  getPublicUserBadgeSummary,
  getRankProgress,
  getRankTier,
  getUnlockedLifetimeBadges,
  getUnlockedStreakBadges,
} from './badges';
import type { RankTier } from './badges';

export { LIFETIME_MILESTONES, RANK_TIERS, STREAK_MILESTONES };
export type { RankTier };

export interface PublicUserBadgeStats {
  username: string;
  displayName: string;
  lifetimeTokens: bigint;
  totalRequests: number;
  premiumRequests: number;
  weeklyTokens: bigint;
  currentStreakDays: number;
  bestStreakDays: number;
  rolling30DayTokens: bigint;
  topRepoName: string | null;
  publicRepoCount: number;
  unlockedLifetimeMilestones: string[];
  unlockedStreakMilestones: string[];
  rank: RankTier;
  rankProgress: number;
}

export function computeRank(rolling30DayTokens: number | bigint): RankTier {
  return getRankTier(rolling30DayTokens);
}

export function computeRankProgress(rolling30DayTokens: number | bigint): number {
  return getRankProgress(rolling30DayTokens);
}

export function computeUnlockedLifetime(lifetimeTokens: number | bigint): string[] {
  return getUnlockedLifetimeBadges(lifetimeTokens);
}

export function computeUnlockedStreak(bestStreakDays: number): string[] {
  return getUnlockedStreakBadges(bestStreakDays);
}

export async function getPublicBadgeStats(username: string): Promise<PublicUserBadgeStats | null> {
  const summary = await getPublicUserBadgeSummary(username);
  if (!summary) {
    return null;
  }

  const rank = computeRank(summary.rolling30DayTokens);
  const rankProgress = computeRankProgress(summary.rolling30DayTokens);

  return {
    ...summary,
    unlockedLifetimeMilestones: computeUnlockedLifetime(summary.lifetimeTokens),
    unlockedStreakMilestones: computeUnlockedStreak(summary.bestStreakDays),
    rank,
    rankProgress,
  };
}

export function getLifetimeMilestone(key: string) {
  return LIFETIME_MILESTONES.find((m) => m.key === key) || null;
}

export function getStreakMilestone(key: string) {
  return STREAK_MILESTONES.find((m) => m.key === key) || null;
}

export function getRankByKey(key: string) {
  return RANK_TIERS.find((tier) => tier.key === key) || null;
}
