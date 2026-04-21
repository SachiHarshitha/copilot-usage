import {
  BADGE_WATERMARK,
  REPO_BADGE_PRESETS,
  escapeXml,
  formatCompactNumber,
  renderAchievementCardSvg,
  renderBadgeSvg,
  renderRankCardSvg,
} from './badges';

export interface PillBadgeOptions {
  label: string;
  value: string;
  icon?: string;
  accent: string;
  accent2: string;
  watermark?: string;
  ariaLabel?: string;
}

export interface RankCardOptions {
  rankLabel: string;
  rankCode: string;
  tone: string;
  progress: number;
  accent: string;
  accent2: string;
  watermark?: string;
}

export interface AchievementCardOptions {
  family: 'LIFETIME' | 'STREAK';
  title: string;
  thresholdLabel: string;
  icon: string;
  accent: string;
  accent2: string;
  chipLabel: string;
  watermark?: string;
}

export { BADGE_WATERMARK, escapeXml, formatCompactNumber };

export const repoBadgePresets = REPO_BADGE_PRESETS;

export function renderPillBadge({
  label,
  value,
  icon = '⚡',
  accent,
  accent2,
  watermark = BADGE_WATERMARK,
  ariaLabel,
}: PillBadgeOptions): string {
  return renderBadgeSvg({
    label,
    value,
    icon,
    accent,
    accent2,
    watermark,
    ariaLabel,
  });
}

export function renderRankCard(options: RankCardOptions): string {
  return renderRankCardSvg(options);
}

export function renderAchievementCard(options: AchievementCardOptions): string {
  return renderAchievementCardSvg(options);
}
