export interface MeasureTextOptions {
  fontSize: number;
  fontWeight?: number;
  letterSpacing?: number;
}

const NARROW_CHAR = /[ ilI1|!.,:;'`]/;
const WIDE_CHAR = /[MW@#%&QG]/;
const DIGIT_CHAR = /[0-9]/;
const UPPER_CHAR = /[A-Z]/;

function charWidthFactor(char: string): number {
  if (char === ' ') return 0.33;
  if (NARROW_CHAR.test(char)) return 0.34;
  if (WIDE_CHAR.test(char)) return 0.94;
  if (DIGIT_CHAR.test(char)) return 0.62;
  if (UPPER_CHAR.test(char)) return 0.66;

  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint > 0xff) return 1.06;

  return 0.56;
}

function weightFactor(fontWeight: number): number {
  if (fontWeight >= 800) return 1.08;
  if (fontWeight >= 700) return 1.06;
  if (fontWeight >= 600) return 1.03;
  return 1;
}

export function measureTextWidth(text: string, options: MeasureTextOptions): number {
  const value = text ?? '';
  if (!value) return 0;

  const fontSize = options.fontSize;
  const fontWeight = options.fontWeight ?? 400;
  const letterSpacing = options.letterSpacing ?? 0;

  let width = 0;
  for (const char of value) {
    width += charWidthFactor(char) * fontSize;
  }

  if (value.length > 1 && letterSpacing > 0) {
    width += (value.length - 1) * letterSpacing;
  }

  return Math.round(width * weightFactor(fontWeight));
}

export function fitTextWithEllipsis(text: string, maxWidth: number, options: MeasureTextOptions): string {
  const cleaned = (text ?? '').trim();
  if (!cleaned) return '';
  if (maxWidth <= 0) return '';

  if (measureTextWidth(cleaned, options) <= maxWidth) {
    return cleaned;
  }

  const ellipsis = '…';
  const ellipsisWidth = measureTextWidth(ellipsis, options);
  if (ellipsisWidth > maxWidth) {
    return '';
  }

  let low = 0;
  let high = cleaned.length;
  let best = ellipsis;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `${cleaned.slice(0, mid).trimEnd()}${ellipsis}`;
    const width = measureTextWidth(candidate, options);

    if (width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}
