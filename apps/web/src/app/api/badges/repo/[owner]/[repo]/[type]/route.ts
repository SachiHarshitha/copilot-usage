import {
  PRIVATE_BADGE,
  badgeSvgResponse,
  getPublicRepoBadgeSummary,
  getRepoBadgeByType,
  renderBadgeSvg,
} from '@/lib/badges';

const REPO_PART_RE = /^[A-Za-z0-9._-]{1,100}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string; repo: string; type: string }> }
) {
  const { owner, repo, type } = await params;
  const badgeType = type.replace(/\.svg$/, '').toLowerCase();

  if (!REPO_PART_RE.test(owner) || !REPO_PART_RE.test(repo)) {
    return badgeSvgResponse(renderBadgeSvg(PRIVATE_BADGE), 404);
  }

  const stats = await getPublicRepoBadgeSummary(owner, repo);
  if (!stats) {
    return badgeSvgResponse(renderBadgeSvg(PRIVATE_BADGE), 404);
  }

  const badge = getRepoBadgeByType(badgeType, stats);
  return badgeSvgResponse(renderBadgeSvg(badge));
}
