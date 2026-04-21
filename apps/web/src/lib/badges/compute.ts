import {
  LIFETIME_MILESTONES,
  LIFETIME_TIERS,
  PRIVATE_BADGE,
  RANK_TIERS,
  REPO_BADGE_PRESETS,
  STREAK_MILESTONES,
  STREAK_TIERS,
  USER_BADGE_PRESETS,
} from './config';
import { formatCompactNumber, sanitizeBadgeText } from './format';
import type {
  AchievementCardDescriptor,
  BadgeDescriptor,
  BadgeMilestone,
  PublicRepoBadgeSummary,
  PublicUserBadgeSummary,
  RankCardDescriptor,
  RankTier,
} from './types';

function asNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getLifetimeTier(lifetimeTokens: number | bigint) {
  const tokens = asNumber(lifetimeTokens);
  return LIFETIME_TIERS.find((tier) => tokens >= tier.min) ?? LIFETIME_TIERS[LIFETIME_TIERS.length - 1];
}

export function getRankTier(tokens30d: number | bigint): RankTier {
  const tokens = asNumber(tokens30d);
  return RANK_TIERS.find((tier) => tokens >= tier.min) ?? RANK_TIERS[RANK_TIERS.length - 1];
}

export function getStreakTier(currentStreakDays: number) {
  return STREAK_TIERS.find((tier) => currentStreakDays >= tier.min) ?? STREAK_TIERS[STREAK_TIERS.length - 1];
}

export function getUnlockedLifetimeBadges(lifetimeTokens: number | bigint): string[] {
  const tokens = asNumber(lifetimeTokens);
  return LIFETIME_MILESTONES.filter((m) => tokens >= m.threshold).map((m) => m.key);
}

export function getUnlockedStreakBadges(bestStreakDays: number): string[] {
  return STREAK_MILESTONES.filter((m) => bestStreakDays >= m.threshold).map((m) => m.key);
}

export function getRankProgress(tokens30d: number | bigint): number {
  const tokens = asNumber(tokens30d);
  const current = getRankTier(tokens);
  const currentIndex = RANK_TIERS.findIndex((tier) => tier.key === current.key);

  if (currentIndex <= 0) {
    return 100;
  }

  const nextTier = RANK_TIERS[currentIndex - 1];
  const lowerBound = current.min;
  const span = Math.max(1, nextTier.min - lowerBound);
  const raw = ((tokens - lowerBound) / span) * 100;
  return Math.max(8, clampProgress(raw));
}

export function summarizeModels(models: string[]): string {
  const cleaned = models.map((model) => sanitizeBadgeText(model)).filter((model) => model.length > 0);
  if (cleaned.length === 0) return 'UNKNOWN';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} · ${cleaned[1]}`;
  return `${cleaned[0]} +${cleaned.length - 1}`;
}

export function getRepoLeaderboardBadge(rank: number | null, percentile?: number | null): BadgeDescriptor {
  const top =
    typeof percentile === 'number' && Number.isFinite(percentile)
      ? `TOP ${Math.max(1, Math.round(100 - percentile + 1))}%`
      : '';

  return {
    ...REPO_BADGE_PRESETS.leaderboard,
    badgeType: 'leaderboard',
    value: rank ? `#${rank}` : 'UNRANKED',
    secondaryText: top,
  };
}

export function getRepoModelsBadge(models: string[]): BadgeDescriptor {
  return {
    ...REPO_BADGE_PRESETS.models,
    badgeType: 'models',
    value: summarizeModels(models).toUpperCase(),
  };
}

export function getRepoSummaryBadge(stats: PublicRepoBadgeSummary): BadgeDescriptor {
  const rank = stats.rank ? `#${stats.rank}` : 'UNRANKED';
  const tokens = formatCompactNumber(stats.totalTokens);
  const models = summarizeModels(stats.models).toUpperCase();

  return {
    ...REPO_BADGE_PRESETS.summary,
    badgeType: 'summary',
    value: rank,
    secondaryText: `${tokens} · ${models}`,
  };
}

export function getUserBadgeByType(type: string, stats: PublicUserBadgeSummary): BadgeDescriptor {
  const badgeType = type.toLowerCase();

  switch (badgeType) {
    case 'streak': {
      const tier = getStreakTier(stats.currentStreakDays);
      return {
        badgeType: 'streak',
        icon: tier.icon,
        label: USER_BADGE_PRESETS.streak.label,
        value: `${stats.currentStreakDays} DAYS`,
        accent: tier.accent,
        accent2: tier.accent2,
      };
    }
    case 'lifetime': {
      const tier = getLifetimeTier(stats.lifetimeTokens);
      return {
        badgeType: 'lifetime',
        icon: tier.icon,
        label: USER_BADGE_PRESETS.lifetime.label,
        value: `${formatCompactNumber(stats.lifetimeTokens)} TOKENS`,
        accent: tier.accent,
        accent2: tier.accent2,
      };
    }
    case 'rank': {
      const rank = getRankTier(stats.rolling30DayTokens);
      return {
        badgeType: 'rank',
        icon: USER_BADGE_PRESETS.rank.icon,
        label: USER_BADGE_PRESETS.rank.label,
        value: rank.label.toUpperCase(),
        accent: rank.accent,
        accent2: rank.accent2,
      };
    }
    case 'weekly':
      return {
        ...USER_BADGE_PRESETS.weekly,
        badgeType: 'weekly',
        value: `${formatCompactNumber(stats.weeklyTokens)} TOKENS`,
      };
    case 'repo':
      return {
        ...USER_BADGE_PRESETS.repo,
        badgeType: 'repo',
        value: (stats.topRepoName || 'NO PUBLIC REPO').toUpperCase(),
      };
    default:
      return {
        ...USER_BADGE_PRESETS.lifetime,
        badgeType: 'generic',
        label: 'PROMPTSTREAK',
        value: stats.username.toUpperCase(),
      };
  }
}

export function getRepoBadgeByType(type: string, stats: PublicRepoBadgeSummary): BadgeDescriptor {
  const badgeType = type.toLowerCase();

  switch (badgeType) {
    case 'leaderboard':
      return getRepoLeaderboardBadge(stats.rank, stats.percentile);
    case 'tokens':
      return {
        ...REPO_BADGE_PRESETS.tokens,
        badgeType: 'tokens',
        value: `${formatCompactNumber(stats.totalTokens)} TOKENS`,
      };
    case 'tokens-30d':
      return {
        ...REPO_BADGE_PRESETS.tokens30d,
        badgeType: 'tokens30d',
        value: `${formatCompactNumber(stats.tokens30d)} TOKENS`,
      };
    case 'models':
      return getRepoModelsBadge(stats.models);
    case 'primary-model':
      return {
        ...REPO_BADGE_PRESETS.primaryModel,
        badgeType: 'primary-model',
        value: sanitizeBadgeText(stats.primaryModel || 'UNKNOWN').toUpperCase(),
      };
    case 'summary':
      return getRepoSummaryBadge(stats);
    default:
      return {
        ...REPO_BADGE_PRESETS.summary,
        badgeType: 'generic',
        value: stats.repoSlug.toUpperCase(),
      };
  }
}

export function resolveRankCard(rankKey: string, tokens30d: number | bigint): RankCardDescriptor {
  const currentRank = getRankTier(tokens30d);
  const selectedRank = RANK_TIERS.find((tier) => tier.key === rankKey.toLowerCase()) ?? currentRank;
  const progress =
    selectedRank.key === currentRank.key ? getRankProgress(tokens30d) : selectedRank.min <= asNumber(tokens30d) ? 100 : 12;

  return {
    rankLabel: selectedRank.label,
    rankCode: selectedRank.code,
    tone: selectedRank.tone,
    progress,
    accent: selectedRank.accent,
    accent2: selectedRank.accent2,
  };
}

export function findMilestoneByKey(key: string): BadgeMilestone | null {
  const lowerKey = key.toLowerCase();
  return (
    LIFETIME_MILESTONES.find((m) => m.key === lowerKey) ||
    STREAK_MILESTONES.find((m) => m.key === lowerKey) ||
    null
  );
}

export function resolveAchievementCard(
  key: string,
  stats: Pick<PublicUserBadgeSummary, 'lifetimeTokens' | 'bestStreakDays'>
): { status: number; card: AchievementCardDescriptor } {
  const milestone = findMilestoneByKey(key);
  if (!milestone) {
    return {
      status: 404,
      card: {
        family: 'LIFETIME',
        title: 'Unknown Badge',
        thresholdLabel: key,
        icon: '❓',
        accent: PRIVATE_BADGE.accent,
        accent2: PRIVATE_BADGE.accent2,
        chipLabel: 'N/A',
      },
    };
  }

  const unlocked =
    milestone.family === 'LIFETIME'
      ? asNumber(stats.lifetimeTokens) >= milestone.threshold
      : stats.bestStreakDays >= milestone.threshold;

  if (!unlocked) {
    const thresholdLabel =
      milestone.family === 'LIFETIME'
        ? `${formatCompactNumber(milestone.threshold)} lifetime needed`
        : `${milestone.threshold} day streak needed`;

    return {
      status: 404,
      card: {
        family: milestone.family,
        title: 'Locked',
        thresholdLabel,
        icon: '🔒',
        accent: PRIVATE_BADGE.accent,
        accent2: PRIVATE_BADGE.accent2,
        chipLabel: milestone.chipLabel,
      },
    };
  }

  const thresholdLabel =
    milestone.family === 'LIFETIME'
      ? `${formatCompactNumber(milestone.threshold)} lifetime`
      : `${milestone.threshold} day streak`;

  return {
    status: 200,
    card: {
      family: milestone.family,
      title: milestone.title,
      thresholdLabel,
      icon: milestone.icon,
      accent: milestone.accent,
      accent2: milestone.accent2,
      chipLabel: milestone.chipLabel,
    },
  };
}
