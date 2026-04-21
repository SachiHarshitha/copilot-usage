import type { BadgeType } from './types';

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

export interface CompactBadgeTextInput {
  badgeType?: BadgeType;
  value: string;
  secondaryText?: string;
}

export interface CompactBadgeTextOutput {
  value: string;
  secondaryText: string;
}

function parseNumericToken(value: string): number | null {
  const match = value.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number.parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function compactNumericPhrase(value: string): string {
  const cleaned = sanitizeBadgeText(value);
  const numeric = parseNumericToken(cleaned);
  if (numeric === null) return cleaned;

  const compact = formatCompactNumber(numeric);
  const lower = cleaned.toLowerCase();

  if (lower.includes('lifetime')) return `${compact} lifetime`;
  if (lower.includes('30') && lower.includes('token')) return `${compact} 30d`;
  if (lower.includes('week')) return `${compact} week`;
  if (lower.includes('token')) return `${compact} tokens`;

  return compact;
}

function normalizeModelName(value: string): string {
  const cleaned = sanitizeBadgeText(value).replace(/^primary\s+model\s*:\s*/i, '');
  if (!cleaned) return '';

  if (/gpt\s*[- ]?5/i.test(cleaned)) return 'GPT-5';
  if (/o4\s*[- ]?mini/i.test(cleaned)) return 'O4-mini';
  if (/claude\s+sonnet\s*4/i.test(cleaned)) return 'Claude Sonnet 4';
  if (/gemini\s*2\.?5\s*pro/i.test(cleaned)) return 'Gemini 2.5 Pro';

  return cleaned;
}

function compactModelList(value: string): string {
  const cleaned = sanitizeBadgeText(value);
  if (!cleaned) return cleaned;

  const parts = cleaned
    .split(/\s*(?:,|\|)\s*/)
    .map((part) => normalizeModelName(part))
    .filter((part) => part.length > 0);

  if (parts.length === 0) return cleaned;
  if (parts.length === 1) return parts[0];

  return `${parts[0]} + ${parts.length - 1}`;
}

function compactPrimaryModel(value: string): string {
  const cleaned = normalizeModelName(value);
  if (!cleaned) return cleaned;

  const parts = cleaned
    .split(/\s*(?:,|\|)\s*/)
    .map((part) => normalizeModelName(part))
    .filter((part) => part.length > 0);

  if (parts.length > 1) {
    return `${parts[0]} + ${parts.length - 1}`;
  }

  const words = parts[0].split(/\s+/);
  if (words.length > 4) {
    const head = words.slice(0, 3);
    return head.join(' ');
  }

  return parts[0];
}

function compactTopPercentText(value: string): string {
  const cleaned = sanitizeBadgeText(value);
  if (!cleaned) return cleaned;

  return cleaned
    .replace(/top\s+([\d.]+)%/i, (_full, raw: string) => {
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) return 'TOP 1%';
      return `TOP ${Math.max(1, Math.round(parsed))}%`;
    })
    .replace(/\s+of\s+public\s+repositories/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitPrimaryAndSecondary(value: string, secondaryText: string): { primary: string; secondary: string } {
  const normalizedValue = sanitizeBadgeText(value);
  const normalizedSecondary = sanitizeBadgeText(secondaryText);

  if (normalizedSecondary) {
    return {
      primary: normalizedValue,
      secondary: normalizedSecondary,
    };
  }

  const parts = normalizedValue.split(/\s*[·]\s*/).filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return {
      primary: normalizedValue,
      secondary: '',
    };
  }

  return {
    primary: parts[0],
    secondary: parts.slice(1).join(' · '),
  };
}

export function compactBadgeText({ badgeType = 'generic', value, secondaryText = '' }: CompactBadgeTextInput): CompactBadgeTextOutput {
  const { primary, secondary } = splitPrimaryAndSecondary(value, secondaryText);

  switch (badgeType) {
    case 'tokens':
    case 'tokens30d':
    case 'lifetime':
    case 'weekly':
      return {
        value: compactNumericPhrase(primary),
        secondaryText: sanitizeBadgeText(secondary),
      };

    case 'leaderboard':
      return {
        value: sanitizeBadgeText(primary),
        secondaryText: compactTopPercentText(secondary),
      };

    case 'models':
      return {
        value: compactModelList(primary),
        secondaryText: secondary ? compactModelList(secondary) : '',
      };

    case 'primary-model':
      return {
        value: compactPrimaryModel(primary),
        secondaryText: sanitizeBadgeText(secondary),
      };

    case 'summary': {
      const summarySecondary = secondary
        .split(/\s*[·]\s*/)
        .filter((part) => part.length > 0)
        .map((part) => {
          if (/token|lifetime|week|30\s*d/i.test(part)) return compactNumericPhrase(part);
          if (/[,|]/.test(part) || /gpt|claude|gemini|o\d|model/i.test(part)) return compactModelList(part);
          return sanitizeBadgeText(part);
        })
        .join(' · ');

      return {
        value: sanitizeBadgeText(primary),
        secondaryText: summarySecondary,
      };
    }

    default:
      return {
        value: sanitizeBadgeText(primary),
        secondaryText: sanitizeBadgeText(secondary),
      };
  }
}
