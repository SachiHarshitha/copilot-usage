import {
  PRIVATE_BADGE,
  badgeSvgResponse,
  getPublicUserBadgeSummary,
  getUserBadgeByType,
  renderBadgeSvg,
} from '@/lib/badges';

const USERNAME_RE = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user: string; type: string }> }
) {
  const { user, type } = await params;
  const username = user.replace(/\.svg$/, '');
  const badgeType = type.replace(/\.svg$/, '').toLowerCase();

  if (!USERNAME_RE.test(username)) {
    return badgeSvgResponse(renderBadgeSvg(PRIVATE_BADGE), 404);
  }

  const stats = await getPublicUserBadgeSummary(username);
  if (!stats) {
    return badgeSvgResponse(renderBadgeSvg(PRIVATE_BADGE), 404);
  }

  const badge = getUserBadgeByType(badgeType, stats);
  return badgeSvgResponse(renderBadgeSvg(badge));
}
