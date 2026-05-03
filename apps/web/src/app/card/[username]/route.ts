import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateCardSvg, formatNumber } from '@/lib/svg';
import { isUserVisibleForFeature } from '@/lib/policy/userLifecycle';

/**
 * GET /card/[username].svg
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  let { username } = await params;
  username = username.replace(/\.svg$/, '');

  const user = await prisma.user.findUnique({
    where: { username },
    include: { userStat: true, privacySettings: true },
  });

  if (!user || !isUserVisibleForFeature(user, 'profile') || !user.userStat) {
    return new NextResponse(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="50"><text x="10" y="30" fill="#8b949e" font-family="sans-serif" font-size="14">User not found or profile is private.</text></svg>`,
      {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  }

  const s = user.userStat;
  const svg = generateCardSvg({
    username: user.displayName || user.username,
    avatarUrl: user.avatarUrl || undefined,
    totalTokens: formatNumber(s.totalTokens),
    totalRequests: formatNumber(s.totalRequests),
    premiumRequests: s.premiumRequests.toFixed(1),
    topModel: s.topModel || undefined,
  });

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
