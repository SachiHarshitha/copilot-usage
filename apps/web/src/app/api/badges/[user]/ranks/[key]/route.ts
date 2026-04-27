import { badgeSvgResponse, getPublicUserBadgeSummary, renderRankCardSvg, resolveRankCard } from '@/lib/badges';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user: string; key: string }> }
) {
  const { user, key } = await params;
  const username = user.replace(/\.svg$/, '');
  const rankKey = key.replace(/\.svg$/, '').toLowerCase();

  const stats = await getPublicUserBadgeSummary(username);
  if (!stats) {
    return badgeSvgResponse(
      renderRankCardSvg({
        rankLabel: 'Private',
        rankCode: 'NA',
        tone: 'profile hidden',
        progress: 0,
        accent: '#4b5563',
        accent2: '#d1d5db',
      }),
      404
    );
  }

  const card = resolveRankCard(rankKey, stats.rolling30DayTokens);
  return badgeSvgResponse(renderRankCardSvg(card));
}
