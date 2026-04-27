import { NextResponse } from "next/server";
import { renderPillBadge } from "@/lib/badge-generator";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user: string; type: string }> }
) {
  const { user, type } = await params;

  // Replace this with your real public stats lookup.
  const stats = {
    streakDays: 18,
    lifetimeTokens: 12_400_000,
    rank: "Diamond",
    weeklyTokens: 420_000,
    topRepo: "promptstreak-web",
  };

  let svg = "";
  switch (type) {
    case "streak":
      svg = renderPillBadge({
        icon: "🔥",
        label: "STREAK",
        value: `${stats.streakDays} DAYS`,
        accent: "#f97316",
        accent2: "#ffe0b2",
      });
      break;
    case "lifetime":
      svg = renderPillBadge({
        icon: "⚡",
        label: "LIFETIME",
        value: `${(stats.lifetimeTokens / 1_000_000).toFixed(1)}M TOKENS`,
        accent: "#4f46e5",
        accent2: "#c7d2fe",
      });
      break;
    case "rank":
      svg = renderPillBadge({
        icon: "💎",
        label: "RANK",
        value: stats.rank.toUpperCase(),
        accent: "#2563eb",
        accent2: "#bfdbfe",
      });
      break;
    case "weekly":
      svg = renderPillBadge({
        icon: "📈",
        label: "THIS WEEK",
        value: `${Math.round(stats.weeklyTokens / 1000)}K TOKENS`,
        accent: "#0ea5e9",
        accent2: "#bae6fd",
      });
      break;
    case "repo":
      svg = renderPillBadge({
        icon: "🏆",
        label: "TOP REPO",
        value: stats.topRepo,
        accent: "#059669",
        accent2: "#a7f3d0",
      });
      break;
    default:
      svg = renderPillBadge({
        icon: "⚡",
        label: "PROMPTSTREAK",
        value: user.toUpperCase(),
        accent: "#4f46e5",
        accent2: "#c7d2fe",
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