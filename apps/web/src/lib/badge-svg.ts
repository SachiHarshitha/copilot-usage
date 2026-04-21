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

export const BADGE_WATERMARK = 'promptstreak.dev';

export const repoBadgePresets = {
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

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatCompactNumber(value: number | bigint): string {
  const num = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K`;
  return Math.round(num).toLocaleString();
}

export function renderPillBadge({
  label,
  value,
  icon = '⚡',
  accent,
  accent2,
  watermark = BADGE_WATERMARK,
  ariaLabel,
}: PillBadgeOptions): string {
  const escapedLabel = escapeXml(label.toUpperCase());
  const escapedValue = escapeXml(value.toUpperCase());
  const escapedIcon = escapeXml(icon);
  const escapedWatermark = escapeXml(watermark);
  const escapedAria = escapeXml(ariaLabel || `${label} ${value}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="96" viewBox="0 0 420 96" role="img" aria-label="${escapedAria}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .35 0"/>
    </filter>
  </defs>
  <rect x="2" y="2" rx="26" ry="26" width="416" height="92" fill="url(#bg)" stroke="rgba(255,255,255,.08)"/>
  <rect x="10" y="10" rx="20" ry="20" width="96" height="76" fill="#0b1220" stroke="rgba(255,255,255,.06)"/>
  <rect x="10" y="10" rx="20" ry="20" width="96" height="76" fill="url(#glow)" opacity=".16"/>
  <circle cx="58" cy="48" r="22" fill="${accent}" opacity=".15" filter="url(#soft)"/>
  <text x="58" y="56" text-anchor="middle" font-size="28" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial, sans-serif">${escapedIcon}</text>
  <text x="126" y="39" font-size="15" font-weight="700" fill="#dbeafe" opacity=".9" letter-spacing="1.2" font-family="Inter, Arial, sans-serif">${escapedLabel}</text>
  <text x="126" y="68" font-size="26" font-weight="800" fill="#ffffff" font-family="Inter, Arial, sans-serif">${escapedValue}</text>
  <text x="404" y="78" text-anchor="end" font-size="10" fill="rgba(255,255,255,.26)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${escapedWatermark}</text>
  <rect x="126" y="76" width="278" height="4" rx="2" fill="rgba(255,255,255,.06)"/>
  <rect x="126" y="76" width="112" height="4" rx="2" fill="url(#glow)" opacity=".9"/>
</svg>`;
}

export function renderRankCard({
  rankLabel,
  rankCode,
  tone,
  progress,
  accent,
  accent2,
  watermark = BADGE_WATERMARK,
}: RankCardOptions): string {
  const pct = Math.max(0, Math.min(100, progress));
  const barWidth = Math.round((232 * pct) / 100);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="170" viewBox="0 0 320 170" role="img" aria-label="${escapeXml(rankLabel)} rank badge">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#121826"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent2}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" rx="24" ry="24" width="316" height="166" fill="url(#bg)" stroke="rgba(255,255,255,.09)"/>
  <path d="M160 24 224 58 224 114 160 146 96 114 96 58Z" fill="url(#shine)" opacity=".9"/>
  <path d="M160 40 208 65 208 107 160 132 112 107 112 65Z" fill="#111827" opacity=".88"/>
  <path d="M160 52 196 70 196 102 160 120 124 102 124 70Z" fill="${accent}" opacity=".24"/>
  <text x="160" y="95" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff" font-family="Inter, Arial, sans-serif">${escapeXml(rankCode)}</text>
  <text x="160" y="35" text-anchor="middle" font-size="13" font-weight="700" fill="rgba(255,255,255,.72)" letter-spacing="1.4" font-family="Inter, Arial, sans-serif">PROMPTSTREAK</text>
  <text x="160" y="152" text-anchor="middle" font-size="28" font-weight="800" fill="#fff" font-family="Inter, Arial, sans-serif">${escapeXml(rankLabel.toUpperCase())}</text>
  <text x="160" y="118" text-anchor="middle" font-size="12" font-weight="700" fill="#cbd5e1" font-family="Inter, Arial, sans-serif">${escapeXml(tone.toUpperCase())}</text>
  <rect x="44" y="128" width="232" height="3" rx="2" fill="rgba(255,255,255,.08)"/>
  <rect x="44" y="128" width="${barWidth}" height="3" rx="2" fill="url(#bar)"/>
  <text x="160" y="168" text-anchor="middle" font-size="10" fill="rgba(255,255,255,.24)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${escapeXml(watermark)}</text>
</svg>`;
}

export function renderAchievementCard({
  family,
  title,
  thresholdLabel,
  icon,
  accent,
  accent2,
  chipLabel,
  watermark = BADGE_WATERMARK,
}: AchievementCardOptions): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="380" height="210" viewBox="0 0 380 210" role="img" aria-label="${escapeXml(title)} achievement badge">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${accent2}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="376" height="206" rx="28" fill="url(#bg)" stroke="rgba(255,255,255,.08)"/>
  <rect x="18" y="18" width="344" height="174" rx="22" fill="none" stroke="url(#frame)" opacity=".72" stroke-width="2.5"/>
  <circle cx="86" cy="84" r="44" fill="${accent}" opacity=".14"/>
  <circle cx="86" cy="84" r="30" fill="none" stroke="${accent2}" opacity=".85" stroke-width="2.4"/>
  <text x="86" y="94" text-anchor="middle" font-size="28" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial, sans-serif">${escapeXml(icon)}</text>
  <text x="146" y="62" font-size="12" font-weight="700" fill="rgba(255,255,255,.7)" letter-spacing="1.6" font-family="Inter, Arial, sans-serif">${escapeXml(family)}</text>
  <text x="146" y="98" font-size="30" font-weight="800" fill="#ffffff" font-family="Inter, Arial, sans-serif">${escapeXml(title)}</text>
  <text x="146" y="126" font-size="15" font-weight="600" fill="#cbd5e1" font-family="Inter, Arial, sans-serif">${escapeXml(thresholdLabel)}</text>
  <rect x="146" y="145" width="110" height="28" rx="14" fill="${accent}" opacity=".16" stroke="${accent2}" stroke-opacity=".35"/>
  <text x="201" y="163" text-anchor="middle" font-size="13" font-weight="700" fill="${accent2}" font-family="Inter, Arial, sans-serif">${escapeXml(chipLabel)}</text>
  <text x="360" y="192" text-anchor="end" font-size="10" fill="rgba(255,255,255,.26)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${escapeXml(watermark)}</text>
</svg>`;
}
