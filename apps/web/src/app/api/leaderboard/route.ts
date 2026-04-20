import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const PAGE_SIZE = 25;

/**
 * GET /api/leaderboard?sort=tokens|premium&since=7d|30d&page=1
 */
export async function GET(request: NextRequest) {
  const sort = request.nextUrl.searchParams.get('sort') === 'premium' ? 'premium' : 'tokens';
  const since = request.nextUrl.searchParams.get('since');
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1', 10));

  if (!since) {
    // All-time from UserStat
    const stats = await prisma.userStat.findMany({
      where: { user: { profilePublic: true } },
      include: { user: { select: { username: true, avatarUrl: true } } },
      orderBy: sort === 'premium' ? { premiumRequests: 'desc' } : { totalTokens: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    });

    return NextResponse.json({
      entries: stats.map((s, i) => ({
        rank: (page - 1) * PAGE_SIZE + i + 1,
        username: s.user.username,
        avatarUrl: s.user.avatarUrl,
        totalTokens: s.totalTokens.toString(),
        premiumRequests: s.premiumRequests,
        totalRequests: s.totalRequests,
        topModel: s.topModel,
        workspaceCount: s.workspaceCount,
      })),
      page,
      pageSize: PAGE_SIZE,
    });
  }

  // Date-filtered
  const days = since === '7d' ? 7 : 30;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  const rows = await prisma.$queryRaw<
    { userId: string; totalTokens: bigint; premiumRequests: number; totalRequests: number }[]
  >`
    SELECT ud."userId",
           SUM(ud."totalTokens")::bigint AS "totalTokens",
           SUM(ud."premiumRequests")::float AS "premiumRequests",
           SUM(ud."totalRequests")::int AS "totalRequests"
    FROM "UsageDaily" ud
    JOIN "User" u ON u.id = ud."userId"
    WHERE u."profilePublic" = true
      AND ud.date >= ${sinceDate}
    GROUP BY ud."userId"
    ORDER BY ${sort === 'premium' ? `"premiumRequests"` : `"totalTokens"`} DESC
    LIMIT ${PAGE_SIZE}
    OFFSET ${(page - 1) * PAGE_SIZE}
  `;

  const userIds = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    entries: rows.map((r, i) => {
      const user = userMap.get(r.userId);
      return {
        rank: (page - 1) * PAGE_SIZE + i + 1,
        username: user?.username || 'unknown',
        avatarUrl: user?.avatarUrl || null,
        totalTokens: r.totalTokens.toString(),
        premiumRequests: r.premiumRequests,
        totalRequests: r.totalRequests,
        topModel: null,
        workspaceCount: 0,
      };
    }),
    page,
    pageSize: PAGE_SIZE,
  });
}
