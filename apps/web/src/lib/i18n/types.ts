export const LANGUAGE_COOKIE_NAME = 'ps_lang';

export const SUPPORTED_LOCALES = ['en', 'de', 'zh', 'es'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'en';

export function isAppLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.trim().toLowerCase();
  if (isAppLocale(lower)) return lower;

  // Support enum-like values such as EN/DE/ZH/ES if they appear in cookies.
  if (lower === 'en' || lower === 'en-us' || lower === 'en-gb') return 'en';
  if (lower === 'de' || lower.startsWith('de-')) return 'de';
  if (lower === 'zh' || lower.startsWith('zh-')) return 'zh';
  if (lower === 'es' || lower.startsWith('es-')) return 'es';

  return DEFAULT_LOCALE;
}

export function parseAcceptLanguage(headerValue: string | null): AppLocale {
  if (!headerValue) return DEFAULT_LOCALE;

  const candidates = headerValue
    .split(',')
    .map((part) => part.trim().split(';')[0])
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized !== DEFAULT_LOCALE || candidate.toLowerCase().startsWith('en')) {
      return normalized;
    }
  }

  return DEFAULT_LOCALE;
}
