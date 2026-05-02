import { NextRequest, NextResponse } from 'next/server';
import { PRIVATE_BADGE, formatCompactNumber, getPublicUserBadgeSummary, renderBadgeSvg } from '@/lib/badges';

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

  const stats = await getPublicUserBadgeSummary(username);
  if (!stats) {
    const svg = renderBadgeSvg({ ...PRIVATE_BADGE, label });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'no-store',
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

  const svg = renderBadgeSvg({
    icon,
    label,
    value,
    accent,
    accent2,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `no-cache, s-maxage=300, stale-while-revalidate=600`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
