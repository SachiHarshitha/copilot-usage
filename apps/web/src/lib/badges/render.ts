import { BADGE_WATERMARK } from './config';
import { escapeXml } from './format';
import { computeBadgeLayout } from './layout';
import type { AchievementCardDescriptor, BadgeDescriptor, RankCardDescriptor } from './types';

export interface RenderBadgeSvgInput extends BadgeDescriptor {
  watermark?: string;
}

export interface RenderRankCardSvgInput extends RankCardDescriptor {
  watermark?: string;
}

export interface RenderAchievementCardSvgInput extends AchievementCardDescriptor {
  watermark?: string;
}

function createSvgIdSuffix(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

export function renderBadgeSvg({
  badgeType,
  label,
  value,
  secondaryText,
  icon,
  accent,
  accent2,
  watermark = BADGE_WATERMARK,
  ariaLabel,
}: RenderBadgeSvgInput): string {
  const layout = computeBadgeLayout({
    badgeType,
    icon,
    label,
    value,
    secondaryText,
    watermark,
  });

  const idSuffix = createSvgIdSuffix(
    `${layout.badgeType}|${layout.label}|${layout.value}|${layout.secondaryText}|${accent}|${accent2}`
  );

  const bgId = `bg-${idSuffix}`;
  const glowId = `glow-${idSuffix}`;
  const softId = `soft-${idSuffix}`;
  const labelClipId = `label-clip-${idSuffix}`;
  const valueClipId = `value-clip-${idSuffix}`;

  const escapedLabel = escapeXml(layout.label);
  const escapedValue = escapeXml(layout.value);
  const escapedSecondary = escapeXml(layout.secondaryText);
  const escapedIcon = escapeXml(icon);
  const escapedWatermark = escapeXml(layout.watermark);
  const escapedAria = escapeXml(
    ariaLabel || `${label} ${value}${secondaryText ? ` ${secondaryText}` : ''}`.trim()
  );

  const iconCenterX = layout.constraint.iconBoxX + Math.round(layout.constraint.iconBoxWidth / 2);
  const iconCenterY = layout.constraint.iconBoxY + Math.round(layout.constraint.iconBoxHeight / 2);
  const outerWidth = layout.width - 4;
  const outerHeight = layout.height - 4;
  const labelClipY = layout.constraint.labelY - 16;
  const valueClipY = layout.constraint.valueY - 24;
  const contentClipWidth = Math.max(0, layout.availableValueWidth);
  const progressY = layout.constraint.barY;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${escapedAria}">
  <defs>
    <linearGradient id="${bgId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="${glowId}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent2}"/>
    </linearGradient>
    <filter id="${softId}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .35 0"/>
    </filter>
    <clipPath id="${labelClipId}">
      <rect x="${layout.labelX}" y="${labelClipY}" width="${contentClipWidth}" height="22"/>
    </clipPath>
    <clipPath id="${valueClipId}">
      <rect x="${layout.valueX}" y="${valueClipY}" width="${contentClipWidth}" height="30"/>
    </clipPath>
  </defs>
  <rect x="2" y="2" rx="14" ry="14" width="${outerWidth}" height="${outerHeight}" fill="url(#${bgId})" stroke="rgba(255,255,255,.08)"/>
  <rect x="${layout.constraint.iconBoxX}" y="${layout.constraint.iconBoxY}" rx="14" ry="14" width="${layout.constraint.iconBoxWidth}" height="${layout.constraint.iconBoxHeight}" fill="#0b1220" stroke="rgba(255,255,255,.06)"/>
  <rect x="${layout.constraint.iconBoxX}" y="${layout.constraint.iconBoxY}" rx="14" ry="14" width="${layout.constraint.iconBoxWidth}" height="${layout.constraint.iconBoxHeight}" fill="url(#${glowId})" opacity=".16"/>
  <circle cx="${iconCenterX}" cy="${iconCenterY}" r="22" fill="${accent}" opacity=".15" filter="url(#${softId})"/>
  <text x="${iconCenterX}" y="${iconCenterY + 8}" text-anchor="middle" font-size="28" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial, sans-serif">${escapedIcon}</text>
  <text x="${layout.labelX}" y="${layout.constraint.labelY}" clip-path="url(#${labelClipId})" font-size="15" font-weight="700" fill="#dbeafe" opacity=".9" letter-spacing="1.2" font-family="Inter, Arial, sans-serif">${escapedLabel}</text>
  <text x="${layout.valueX}" y="${layout.constraint.valueY}" clip-path="url(#${valueClipId})" font-size="24" font-weight="800" fill="#ffffff" font-family="Inter, Arial, sans-serif">${escapedValue}</text>
  ${layout.secondaryText ? `<text x="${layout.secondaryX}" y="${layout.constraint.secondaryY}" clip-path="url(#${valueClipId})" font-size="14" font-weight="700" fill="rgba(255,255,255,.86)" font-family="Inter, Arial, sans-serif">· ${escapedSecondary}</text>` : ''}
  <text x="${layout.watermarkEndX}" y="${layout.constraint.watermarkY}" text-anchor="end" font-size="10" fill="rgba(255,255,255,.22)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${escapedWatermark}</text>
  <rect x="${layout.barX}" y="${progressY}" width="${layout.barWidth}" height="4" rx="2" fill="rgba(255,255,255,.06)"/>
  <rect x="${layout.barX}" y="${progressY}" width="${layout.barFillWidth}" height="4" rx="2" fill="url(#${glowId})" opacity=".9"/>
</svg>`;
}

export function renderRankCardSvg({
  rankLabel,
  rankCode,
  tone,
  progress,
  accent,
  accent2,
  watermark = BADGE_WATERMARK,
}: RenderRankCardSvgInput): string {
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

export function renderAchievementCardSvg({
  family,
  title,
  thresholdLabel,
  icon,
  accent,
  accent2,
  chipLabel,
  watermark = BADGE_WATERMARK,
}: RenderAchievementCardSvgInput): string {
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
  <text x="360" y="192" text-anchor="end" font-size="10" fill="rgba(255,255,255,.22)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${escapeXml(watermark)}</text>
</svg>`;
}
