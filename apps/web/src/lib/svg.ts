/** Generate Shields.io-compatible SVG badges and stat cards. */

interface BadgeOptions {
  label: string;
  value: string;
  color?: string;
}

export function generateBadgeSvg({ label, value, color = '#4c6ef5' }: BadgeOptions): string {
  const labelWidth = label.length * 6.5 + 12;
  const valueWidth = value.length * 6.5 + 12;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text aria-hidden="true" x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(value)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${escapeXml(value)}</text>
  </g>
</svg>`;
}

interface CardOptions {
  username: string;
  avatarUrl?: string;
  totalTokens: string;
  premiumRequests: string;
  totalRequests: string;
  topModel?: string;
}

export function generateCardSvg({
  username,
  totalTokens,
  premiumRequests,
  totalRequests,
  topModel,
}: CardOptions): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180" fill="none" role="img" aria-label="promptstreak.dev stats for ${escapeXml(username)}">
  <title>promptstreak.dev - ${escapeXml(username)}</title>
  <rect width="400" height="180" rx="8" fill="#0d1117"/>
  <rect width="400" height="180" rx="8" stroke="#30363d" stroke-width="1" fill="none"/>

  <text x="20" y="32" fill="#c9d1d9" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="16" font-weight="600">
    ${escapeXml(username)} on promptstreak.dev
  </text>
  <line x1="20" y1="44" x2="380" y2="44" stroke="#21262d"/>

  <text x="20" y="72" fill="#8b949e" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12">Total Tokens</text>
  <text x="380" y="72" fill="#c9d1d9" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12" text-anchor="end">${escapeXml(totalTokens)}</text>

  <text x="20" y="96" fill="#8b949e" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12">Total Requests</text>
  <text x="380" y="96" fill="#c9d1d9" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12" text-anchor="end">${escapeXml(totalRequests)}</text>

  <text x="20" y="120" fill="#8b949e" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12">Premium Requests</text>
  <text x="380" y="120" fill="#c9d1d9" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12" text-anchor="end">${escapeXml(premiumRequests)}</text>

  <text x="20" y="144" fill="#8b949e" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12">Top Model</text>
  <text x="380" y="144" fill="#c9d1d9" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="12" text-anchor="end">${escapeXml(topModel || 'N/A')}</text>

  <text x="200" y="170" fill="#484f58" font-family="Segoe UI,Helvetica,Arial,sans-serif" font-size="10" text-anchor="middle">promptstreak.dev</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format large numbers nicely. */
export function formatNumber(n: number | bigint): string {
  const num = typeof n === 'bigint' ? Number(n) : n;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}
