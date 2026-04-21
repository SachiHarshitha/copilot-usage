import { prisma } from '@/lib/db';

export interface RankTier {
  key: string;
  label: string;
  code: string;
  tone: string;
  min: number;
  accent: string;
  accent2: string;
}

export const RANK_TIERS: RankTier[] = [
  { key: 'grandmaster', label: 'Grandmaster', code: 'GM', tone: 'mythic pace', min: 12_000_000, accent: '#f59e0b', accent2: '#fef3c7' },
  { key: 'master', label: 'Master', code: 'MS', tone: 'relentless', min: 6_000_000, accent: '#a855f7', accent2: '#e9d5ff' },
  { key: 'diamond', label: 'Diamond', code: 'DI', tone: 'elite', min: 3_000_000, accent: '#3c6cff', accent2: '#d5dbff' },
  { key: 'platinum', label: 'Platinum', code: 'PL', tone: 'polished', min: 1_500_000, accent: '#2dd4bf', accent2: '#ccfbf1' },
  { key: 'gold', label: 'Gold', code: 'GO', tone: 'sharp', min: 750_000, accent: '#eab308', accent2: '#fef9c3' },
  { key: 'silver', label: 'Silver', code: 'SI', tone: 'consistent', min: 300_000, accent: '#94a3b8', accent2: '#f1f5f9' },
  { key: 'bronze', label: 'Bronze', code: 'BR', tone: 'early momentum', min: 100_000, accent: '#a16207', accent2: '#fef3c7' },
];

export const LIFETIME_MILESTONES = [
  { key: '100k', title: 'Spark', threshold: 100_000, chipLabel: '100K', icon: '✨', accent: '#4f46e5', accent2: '#c7d2fe' },
  { key: '500k', title: 'Warmed Up', threshold: 500_000, chipLabel: '500K', icon: '🔥', accent: '#7c3aed', accent2: '#ddd6fe' },
  { key: '1m', title: 'Million Club', threshold: 1_000_000, chipLabel: '1M', icon: '⚡', accent: '#2d4db7', accent2: '#b8b7ff' },
  { key: '5m', title: 'Forge Master', threshold: 5_000_000, chipLabel: '5M', icon: '🔨', accent: '#1d4ed8', accent2: '#bfdbfe' },
  { key: '10m', title: 'AI Workhorse', threshold: 10_000_000, chipLabel: '10M', icon: '🤖', accent: '#0891b2', accent2: '#a5f3fc' },
  { key: '25m', title: 'Titan', threshold: 25_000_000, chipLabel: '25M', icon: '🏔️', accent: '#0f766e', accent2: '#99f6e4' },
  { key: '50m', title: 'Legend', threshold: 50_000_000, chipLabel: '50M', icon: '🌟', accent: '#ca8a04', accent2: '#fde68a' },
  { key: '100m', title: 'Mythic', threshold: 100_000_000, chipLabel: '100M', icon: '💫', accent: '#be123c', accent2: '#fecdd3' },
] as const;

export const STREAK_MILESTONES = [
  { key: '3d', title: 'Ignition', threshold: 3, chipLabel: '3D', icon: '🔥', accent: '#f97316', accent2: '#fed7aa' },
  { key: '7d', title: 'On Fire', threshold: 7, chipLabel: '7D', icon: '🔥', accent: '#ea580c', accent2: '#fdba74' },
  { key: '14d', title: 'Locked In', threshold: 14, chipLabel: '14D', icon: '🔒', accent: '#6366f1', accent2: '#c7d2fe' },
  { key: '30d', title: 'Unbroken', threshold: 30, chipLabel: '30D', icon: '⚡', accent: '#2563eb', accent2: '#bfdbfe' },
  { key: '60d', title: 'Relentless', threshold: 60, chipLabel: '60D', icon: '💪', accent: '#0891b2', accent2: '#a5f3fc' },
  { key: '100d', title: 'Centurion', threshold: 100, chipLabel: '100D', icon: '🛡️', accent: '#0d9488', accent2: '#99f6e4' },
  { key: '180d', title: 'Machine', threshold: 180, chipLabel: '180D', icon: '⚙️', accent: '#374151', accent2: '#e5e7eb' },
  { key: '365d', title: 'Immortal', threshold: 365, chipLabel: '365D', icon: '👑', accent: '#7c2d12', accent2: '#fdba74' },
] as const;

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

function formatRepoDisplay(repo: {
  displayMode: string;
  githubRepo: string | null;
  aliasLabel: string | null;
  repoIdentity: string;
}): string {
  if (repo.displayMode === 'github' && repo.githubRepo) return repo.githubRepo;
  if (repo.aliasLabel) return repo.aliasLabel;
  return repo.repoIdentity;
}

export function computeRank(rolling30DayTokens: number | bigint): RankTier {
  const tokens = typeof rolling30DayTokens === 'bigint' ? Number(rolling30DayTokens) : rolling30DayTokens;
  for (const tier of RANK_TIERS) {
    if (tokens >= tier.min) {
      return tier;
    }
  }
  return RANK_TIERS[RANK_TIERS.length - 1];
}

export function computeRankProgress(rolling30DayTokens: number | bigint): number {
  const tokens = typeof rolling30DayTokens === 'bigint' ? Number(rolling30DayTokens) : rolling30DayTokens;
  const current = computeRank(tokens);
  const currentIndex = RANK_TIERS.findIndex((tier) => tier.key === current.key);

  if (currentIndex === 0) {
    return 100;
  }

  const nextTier = RANK_TIERS[currentIndex - 1];
  const lowerBound = current.min;
  const span = Math.max(1, nextTier.min - lowerBound);
  const raw = ((tokens - lowerBound) / span) * 100;
  return Math.max(8, Math.min(100, Math.round(raw)));
}

export function computeUnlockedLifetime(lifetimeTokens: number | bigint): string[] {
  const tokens = typeof lifetimeTokens === 'bigint' ? Number(lifetimeTokens) : lifetimeTokens;
  return LIFETIME_MILESTONES.filter((m) => tokens >= m.threshold).map((m) => m.key);
}

export function computeUnlockedStreak(bestStreakDays: number): string[] {
  return STREAK_MILESTONES.filter((m) => bestStreakDays >= m.threshold).map((m) => m.key);
}

export async function getPublicBadgeStats(username: string): Promise<PublicUserBadgeStats | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      userStat: true,
      repoStats: {
        where: { isPublic: true },
        orderBy: { totalTokens: 'desc' },
        take: 1,
      },
      _count: {
        select: {
          repoStats: {
            where: { isPublic: true },
          },
        },
      },
    },
  });

  if (!user || !user.profilePublic || !user.userStat) {
    return null;
  }

  const lifetimeTokens = user.userStat.totalTokens || BigInt(0);
  const weeklyTokens = user.userStat.weeklyTokens || BigInt(0);
  const rolling30DayTokens = user.userStat.rolling30DayTokens || BigInt(0);
  const currentStreakDays = user.userStat.currentStreakDays || 0;
  const bestStreakDays = user.userStat.bestStreakDays || 0;

  const rank = computeRank(rolling30DayTokens);
  const rankProgress = computeRankProgress(rolling30DayTokens);

  return {
    username: user.username,
    displayName: user.displayName || user.username,
    lifetimeTokens,
    totalRequests: user.userStat.totalRequests || 0,
    premiumRequests: user.userStat.premiumRequests || 0,
    weeklyTokens,
    currentStreakDays,
    bestStreakDays,
    rolling30DayTokens,
    topRepoName: user.repoStats[0] ? formatRepoDisplay(user.repoStats[0]) : null,
    publicRepoCount: user._count.repoStats,
    unlockedLifetimeMilestones: computeUnlockedLifetime(lifetimeTokens),
    unlockedStreakMilestones: computeUnlockedStreak(bestStreakDays),
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
