import {
  badgeSvgResponse,
  getPublicUserBadgeSummary,
  renderAchievementCardSvg,
  resolveAchievementCard,
} from '@/lib/badges';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user: string; key: string }> }
) {
  const { user, key } = await params;
  const username = user.replace(/\.svg$/, '');
  const achievementKey = key.replace(/\.svg$/, '').toLowerCase();

  const stats = await getPublicUserBadgeSummary(username);
  if (!stats) {
    return badgeSvgResponse(
      renderAchievementCardSvg({
        family: 'LIFETIME',
        title: 'Locked',
        thresholdLabel: 'Profile is private',
        icon: '🔒',
        accent: '#4b5563',
        accent2: '#d1d5db',
        chipLabel: 'LOCKED',
      }),
      404
    );
  }

  const { status, card } = resolveAchievementCard(achievementKey, {
    lifetimeTokens: stats.lifetimeTokens,
    bestStreakDays: stats.bestStreakDays,
  });
  return badgeSvgResponse(renderAchievementCardSvg(card), status);
}
