import { NextResponse } from "next/server";
import { renderPillBadge, repoBadgePresets } from "@/lib/badge-generator";

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M TOKENS`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K TOKENS`;
  return `${value} TOKENS`;
}

function summarizeModels(models: string[]) {
  if (models.length <= 1) return models[0] ?? "UNKNOWN";
  if (models.length === 2) return `${models[0]} · ${models[1]}`;
  return `${models[0]} +${models.length - 1}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; type: string }> }
) {
  const { owner, repo, type } = await params;

  // Replace with your public, opt-in repo stats lookup.
  const stats = {
    leaderboardRank: 12,
    lifetimeTokens: 12_400_000,
    tokens30d: 480_000,
    models: ["GPT-5", "Claude", "o4-mini"],
    primaryModel: "GPT-5",
  };

  let svg = "";
  switch (type) {
    case "leaderboard":
      svg = renderPillBadge({
        ...repoBadgePresets.leaderboard,
        value: `#${stats.leaderboardRank} ON PROMPTSTREAK`,
      });
      break;
    case "tokens":
      svg = renderPillBadge({
        ...repoBadgePresets.lifetimeTokens,
        value: formatTokens(stats.lifetimeTokens),
      });
      break;
    case "tokens-30d":
      svg = renderPillBadge({
        ...repoBadgePresets.tokens30d,
        value: formatTokens(stats.tokens30d),
      });
      break;
    case "models":
      svg = renderPillBadge({
        ...repoBadgePresets.models,
        value: summarizeModels(stats.models).toUpperCase(),
      });
      break;
    case "primary-model":
      svg = renderPillBadge({
        ...repoBadgePresets.primaryModel,
        value: stats.primaryModel.toUpperCase(),
      });
      break;
    case "summary":
      svg = renderPillBadge({
        ...repoBadgePresets.summary,
        value: `#${stats.leaderboardRank} · ${(stats.lifetimeTokens / 1_000_000).toFixed(1)}M · ${summarizeModels(stats.models).toUpperCase()}`,
      });
      break;
    default:
      svg = renderPillBadge({
        icon: "✨",
        label: "PUBLIC REPO",
        value: `${owner}/${repo}`.toUpperCase(),
        accent: "#ec4899",
        accent2: "#fbcfe8",
      });
  }

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      "CDN-Cache-Control": "public, s-maxage=300",
      "Vercel-CDN-Cache-Control": "public, s-maxage=300",
    },
  });
}
