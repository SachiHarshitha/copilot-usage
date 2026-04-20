import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateBadgeSvg, formatNumber } from '@/lib/svg';

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
  const label = request.nextUrl.searchParams.get('label') || 'Copilot Usage';

  const user = await prisma.user.findUnique({
    where: { username },
    include: { userStat: true },
  });

  if (!user || !user.profilePublic || !user.userStat) {
    // Return a "not found" badge
    const svg = generateBadgeSvg({ label, value: 'N/A', color: '#555' });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const s = user.userStat;
  let value: string;
  let color = '#4c6ef5';

  switch (stat) {
    case 'requests':
      value = formatNumber(s.totalRequests);
      color = '#2ea043';
      break;
    case 'premium':
      value = s.premiumRequests.toFixed(1);
      color = '#d29922';
      break;
    case 'tokens':
    default:
      value = formatNumber(s.totalTokens);
      break;
  }

  const svg = generateBadgeSvg({ label, value, color });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
