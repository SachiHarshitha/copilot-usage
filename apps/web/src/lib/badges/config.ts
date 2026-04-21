import type { BadgeDescriptor, BadgeMilestone, LifetimeTier, RankTier, StreakTier } from './types';

export const BADGE_WATERMARK = 'promptstreak.dev';

export const PUBLIC_BADGE_CACHE_SECONDS = 300;
export const PUBLIC_BADGE_STALE_SECONDS = 600;

export const PRIVATE_BADGE: BadgeDescriptor = {
  icon: '🔒',
  label: 'PROMPTSTREAK',
  value: 'PRIVATE OR MISSING',
  accent: '#4b5563',
  accent2: '#d1d5db',
};

export const USER_BADGE_PRESETS = {
  streak: { icon: '🔥', label: 'STREAK', accent: '#f97316', accent2: '#ffe0b2' },
  lifetime: { icon: '⚡', label: 'LIFETIME', accent: '#4f46e5', accent2: '#c7d2fe' },
  rank: { icon: '💎', label: 'RANK', accent: '#4f46e5', accent2: '#c7d2fe' },
  weekly: { icon: '📈', label: 'THIS WEEK', accent: '#0ea5e9', accent2: '#bae6fd' },
  repo: { icon: '🏆', label: 'TOP REPO', accent: '#059669', accent2: '#a7f3d0' },
} as const;

export const REPO_BADGE_PRESETS = {
  leaderboard: {
    icon: '🏆',
    label: 'REPO RANK',
    accent: '#f59e0b',
    accent2: '#fde68a',
  },
  tokens: {
    icon: '⚡',
    label: 'LIFETIME TOKENS',
    accent: '#4f46e5',
    accent2: '#c7d2fe',
  },
  tokens30d: {
    icon: '📈',
    label: 'LAST 30 DAYS',
    accent: '#0ea5e9',
    accent2: '#bae6fd',
  },
  models: {
    icon: '🤖',
    label: 'MODELS TRACKED',
    accent: '#8b5cf6',
    accent2: '#ddd6fe',
  },
  primaryModel: {
    icon: '🧠',
    label: 'PRIMARY MODEL',
    accent: '#10b981',
    accent2: '#a7f3d0',
  },
  summary: {
    icon: '✨',
    label: 'PUBLIC REPO',
    accent: '#ec4899',
    accent2: '#fbcfe8',
  },
} as const;

export const RANK_TIERS: RankTier[] = [
  {
    key: 'grandmaster',
    label: 'Grandmaster',
    code: 'GM',
    tone: 'mythic pace',
    min: 12_000_000,
    accent: '#f59e0b',
    accent2: '#fef3c7',
  },
  {
    key: 'master',
    label: 'Master',
    code: 'MS',
    tone: 'relentless',
    min: 6_000_000,
    accent: '#a855f7',
    accent2: '#e9d5ff',
  },
  {
    key: 'diamond',
    label: 'Diamond',
    code: 'DI',
    tone: 'elite',
    min: 3_000_000,
    accent: '#3c6cff',
    accent2: '#d5dbff',
  },
  {
    key: 'platinum',
    label: 'Platinum',
    code: 'PL',
    tone: 'polished',
    min: 1_500_000,
    accent: '#2dd4bf',
    accent2: '#ccfbf1',
  },
  {
    key: 'gold',
    label: 'Gold',
    code: 'GO',
    tone: 'sharp',
    min: 750_000,
    accent: '#eab308',
    accent2: '#fef9c3',
  },
  {
    key: 'silver',
    label: 'Silver',
    code: 'SI',
    tone: 'consistent',
    min: 300_000,
    accent: '#94a3b8',
    accent2: '#f1f5f9',
  },
  {
    key: 'bronze',
    label: 'Bronze',
    code: 'BR',
    tone: 'early momentum',
    min: 100_000,
    accent: '#a16207',
    accent2: '#fef3c7',
  },
];

export const LIFETIME_TIERS: LifetimeTier[] = [
  { key: 'mythic', label: 'Mythic', min: 100_000_000, icon: '💫', accent: '#be123c', accent2: '#fecdd3' },
  { key: 'legend', label: 'Legend', min: 50_000_000, icon: '🌟', accent: '#ca8a04', accent2: '#fde68a' },
  { key: 'titan', label: 'Titan', min: 25_000_000, icon: '🏔️', accent: '#0f766e', accent2: '#99f6e4' },
  { key: 'workhorse', label: 'AI Workhorse', min: 10_000_000, icon: '🤖', accent: '#0891b2', accent2: '#a5f3fc' },
  { key: 'forge-master', label: 'Forge Master', min: 5_000_000, icon: '🔨', accent: '#1d4ed8', accent2: '#bfdbfe' },
  { key: 'million-club', label: 'Million Club', min: 1_000_000, icon: '⚡', accent: '#2d4db7', accent2: '#b8b7ff' },
  { key: 'warmed-up', label: 'Warmed Up', min: 500_000, icon: '🔥', accent: '#7c3aed', accent2: '#ddd6fe' },
  { key: 'spark', label: 'Spark', min: 100_000, icon: '✨', accent: '#4f46e5', accent2: '#c7d2fe' },
  { key: 'new', label: 'New', min: 0, icon: '🌱', accent: '#4b5563', accent2: '#d1d5db' },
];

export const STREAK_TIERS: StreakTier[] = [
  { key: 'immortal', label: 'Immortal', min: 365, icon: '👑', accent: '#7c2d12', accent2: '#fdba74' },
  { key: 'machine', label: 'Machine', min: 180, icon: '⚙️', accent: '#374151', accent2: '#e5e7eb' },
  { key: 'centurion', label: 'Centurion', min: 100, icon: '🛡️', accent: '#0d9488', accent2: '#99f6e4' },
  { key: 'relentless', label: 'Relentless', min: 60, icon: '💪', accent: '#0891b2', accent2: '#a5f3fc' },
  { key: 'unbroken', label: 'Unbroken', min: 30, icon: '⚡', accent: '#2563eb', accent2: '#bfdbfe' },
  { key: 'locked-in', label: 'Locked In', min: 14, icon: '🔒', accent: '#6366f1', accent2: '#c7d2fe' },
  { key: 'on-fire', label: 'On Fire', min: 7, icon: '🔥', accent: '#ea580c', accent2: '#fdba74' },
  { key: 'ignition', label: 'Ignition', min: 3, icon: '🔥', accent: '#f97316', accent2: '#fed7aa' },
  { key: 'new', label: 'New', min: 0, icon: '🌱', accent: '#4b5563', accent2: '#d1d5db' },
];

export const LIFETIME_MILESTONES: BadgeMilestone[] = [
  { key: '100k', title: 'Spark', threshold: 100_000, chipLabel: '100K', icon: '✨', accent: '#4f46e5', accent2: '#c7d2fe', family: 'LIFETIME' },
  { key: '500k', title: 'Warmed Up', threshold: 500_000, chipLabel: '500K', icon: '🔥', accent: '#7c3aed', accent2: '#ddd6fe', family: 'LIFETIME' },
  { key: '1m', title: 'Million Club', threshold: 1_000_000, chipLabel: '1M', icon: '⚡', accent: '#2d4db7', accent2: '#b8b7ff', family: 'LIFETIME' },
  { key: '5m', title: 'Forge Master', threshold: 5_000_000, chipLabel: '5M', icon: '🔨', accent: '#1d4ed8', accent2: '#bfdbfe', family: 'LIFETIME' },
  { key: '10m', title: 'AI Workhorse', threshold: 10_000_000, chipLabel: '10M', icon: '🤖', accent: '#0891b2', accent2: '#a5f3fc', family: 'LIFETIME' },
  { key: '25m', title: 'Titan', threshold: 25_000_000, chipLabel: '25M', icon: '🏔️', accent: '#0f766e', accent2: '#99f6e4', family: 'LIFETIME' },
  { key: '50m', title: 'Legend', threshold: 50_000_000, chipLabel: '50M', icon: '🌟', accent: '#ca8a04', accent2: '#fde68a', family: 'LIFETIME' },
  { key: '100m', title: 'Mythic', threshold: 100_000_000, chipLabel: '100M', icon: '💫', accent: '#be123c', accent2: '#fecdd3', family: 'LIFETIME' },
];

export const STREAK_MILESTONES: BadgeMilestone[] = [
  { key: '3d', title: 'Ignition', threshold: 3, chipLabel: '3D', icon: '🔥', accent: '#f97316', accent2: '#fed7aa', family: 'STREAK' },
  { key: '7d', title: 'On Fire', threshold: 7, chipLabel: '7D', icon: '🔥', accent: '#ea580c', accent2: '#fdba74', family: 'STREAK' },
  { key: '14d', title: 'Locked In', threshold: 14, chipLabel: '14D', icon: '🔒', accent: '#6366f1', accent2: '#c7d2fe', family: 'STREAK' },
  { key: '30d', title: 'Unbroken', threshold: 30, chipLabel: '30D', icon: '⚡', accent: '#2563eb', accent2: '#bfdbfe', family: 'STREAK' },
  { key: '60d', title: 'Relentless', threshold: 60, chipLabel: '60D', icon: '💪', accent: '#0891b2', accent2: '#a5f3fc', family: 'STREAK' },
  { key: '100d', title: 'Centurion', threshold: 100, chipLabel: '100D', icon: '🛡️', accent: '#0d9488', accent2: '#99f6e4', family: 'STREAK' },
  { key: '180d', title: 'Machine', threshold: 180, chipLabel: '180D', icon: '⚙️', accent: '#374151', accent2: '#e5e7eb', family: 'STREAK' },
  { key: '365d', title: 'Immortal', threshold: 365, chipLabel: '365D', icon: '👑', accent: '#7c2d12', accent2: '#fdba74', family: 'STREAK' },
];
