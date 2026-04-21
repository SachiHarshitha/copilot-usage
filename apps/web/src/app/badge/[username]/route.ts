import { NextRequest, NextResponse } from 'next/server';
import { getPublicBadgeStats } from '@/lib/badge-stats';
import { formatCompactNumber, renderPillBadge } from '@/lib/badge-svg';

/**
 * GET /badge/[username].svg?stat=tokens|requests|premium&label=Custom+Label
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  let { username } = await params;
  // Strip .svg extension if present
  username = username.replace(/\.svg$/, '');

  const stat = request.nextUrl.searchParams.get('stat') || 'tokens';
  const label = request.nextUrl.searchParams.get('label') || 'promptstreak.dev';

  const stats = await getPublicBadgeStats(username);
  if (!stats) {
    const svg = renderPillBadge({
      icon: '🔒',
      label,
      value: 'PRIVATE OR MISSING',
      accent: '#4b5563',
      accent2: '#d1d5db',
    });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  let value: string;
  let icon = '⚡';
  let accent = '#4f46e5';
  let accent2 = '#c7d2fe';

  switch (stat) {
    case 'requests':
      value = formatCompactNumber(stats.totalRequests);
      icon = '🧾';
      accent = '#2ea043';
      accent2 = '#86efac';
      break;
    case 'premium':
      value = stats.premiumRequests.toFixed(1);
      icon = '💎';
      accent = '#d29922';
      accent2 = '#fef08a';
      break;
    case 'tokens':
    default:
      value = `${formatCompactNumber(stats.lifetimeTokens)} TOKENS`;
      break;
  }

  const svg = renderPillBadge({
    icon,
    label,
    value,
    accent,
    accent2,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
