export type BadgeKind =
  | "streak"
  | "lifetime"
  | "rank"
  | "weekly"
  | "repo"
  | "repoLeaderboard"
  | "repoTokens"
  | "repo30d"
  | "repoModels"
  | "repoPrimaryModel"
  | "repoSummary"
  | "achievement";

export interface BadgeOptions {
  label: string;
  value: string;
  icon?: string;
  accent: string;
  accent2: string;
  watermark?: string;
}

const site = "promptstreak.dev";

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderPillBadge({
  label,
  value,
  icon = "⚡",
  accent,
  accent2,
  watermark = site,
}: BadgeOptions) {
  return `<?xml version="1.0" encoding="UTF-8"?>` + `
  <svg xmlns="http://www.w3.org/2000/svg" width="420" height="96" viewBox="0 0 420 96" role="img" aria-label="${esc(label)} ${esc(value)}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#111827"/>
      </linearGradient>
      <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="${accent2}"/>
      </linearGradient>
    </defs>
    <rect x="2" y="2" rx="26" ry="26" width="416" height="92" fill="url(#bg)" stroke="rgba(255,255,255,.08)"/>
    <rect x="10" y="10" rx="20" ry="20" width="96" height="76" fill="#0b1220" stroke="rgba(255,255,255,.06)"/>
    <rect x="10" y="10" rx="20" ry="20" width="96" height="76" fill="url(#glow)" opacity=".16"/>
    <text x="58" y="56" text-anchor="middle" font-size="28" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial, sans-serif">${esc(icon)}</text>
    <text x="126" y="39" font-size="15" font-weight="700" fill="#dbeafe" opacity=".9" letter-spacing="1.2" font-family="Inter, Arial, sans-serif">${esc(label)}</text>
    <text x="126" y="68" font-size="28" font-weight="800" fill="#ffffff" font-family="Inter, Arial, sans-serif">${esc(value)}</text>
    <text x="404" y="78" text-anchor="end" font-size="10" fill="rgba(255,255,255,.26)" letter-spacing=".8" font-family="Inter, Arial, sans-serif">${esc(watermark)}</text>
  </svg>`;
}

export const repoBadgePresets = {
  leaderboard: {
    icon: "🏆",
    label: "REPO RANK",
    accent: "#f59e0b",
    accent2: "#fde68a",
  },
  lifetimeTokens: {
    icon: "⚡",
    label: "LIFETIME TOKENS",
    accent: "#4f46e5",
    accent2: "#c7d2fe",
  },
  tokens30d: {
    icon: "📈",
    label: "LAST 30 DAYS",
    accent: "#0ea5e9",
    accent2: "#bae6fd",
  },
  models: {
    icon: "🤖",
    label: "MODELS TRACKED",
    accent: "#8b5cf6",
    accent2: "#ddd6fe",
  },
  primaryModel: {
    icon: "🧠",
    label: "PRIMARY MODEL",
    accent: "#10b981",
    accent2: "#a7f3d0",
  },
  summary: {
    icon: "✨",
    label: "PUBLIC REPO",
    accent: "#ec4899",
    accent2: "#fbcfe8",
  },
} as const;
