export interface BadgePalette {
  accent: string;
  accent2: string;
}

export type BadgeType =
  | 'generic'
  | 'streak'
  | 'lifetime'
  | 'rank'
  | 'weekly'
  | 'repo'
  | 'leaderboard'
  | 'tokens'
  | 'tokens30d'
  | 'models'
  | 'primary-model'
  | 'summary';

export interface BadgeDescriptor extends BadgePalette {
  icon: string;
  label: string;
  value: string;
  secondaryText?: string;
  badgeType?: BadgeType;
  ariaLabel?: string;
}

export interface RankTier extends BadgePalette {
  key: string;
  label: string;
  code: string;
  tone: string;
  min: number;
}

export interface LifetimeTier extends BadgePalette {
  key: string;
  label: string;
  min: number;
  icon: string;
}

export interface StreakTier extends BadgePalette {
  key: string;
  label: string;
  min: number;
  icon: string;
}

export interface BadgeMilestone extends BadgePalette {
  key: string;
  title: string;
  threshold: number;
  chipLabel: string;
  icon: string;
  family: 'LIFETIME' | 'STREAK';
}

export interface PublicUserBadgeSummary {
  username: string;
  displayName: string;
  lifetimeTokens: bigint;
  totalRequests: number;
  premiumRequests: number;
  weeklyTokens: bigint;
  rolling30DayTokens: bigint;
  currentStreakDays: number;
  bestStreakDays: number;
  topRepoName: string | null;
  publicRepoCount: number;
}

export interface PublicRepoBadgeSummary {
  repoSlug: string;
  totalTokens: bigint;
  tokens30d: bigint;
  requests: number;
  premiumRequests: number;
  rank: number | null;
  percentile: number | null;
  models: string[];
  primaryModel: string | null;
}

export interface RankCardDescriptor extends BadgePalette {
  rankLabel: string;
  rankCode: string;
  tone: string;
  progress: number;
}

export interface AchievementCardDescriptor extends BadgePalette {
  family: 'LIFETIME' | 'STREAK';
  title: string;
  thresholdLabel: string;
  icon: string;
  chipLabel: string;
}
