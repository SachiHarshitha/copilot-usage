export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatCompactNumber(value: number | bigint): string {
  const num = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${Math.round(num / 1_000)}K`;
  return Math.round(num).toLocaleString();
}

export function sanitizeBadgeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
