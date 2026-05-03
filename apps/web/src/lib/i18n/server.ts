import { cache } from 'react';
import { cookies, headers } from 'next/headers';

import type { AppLocale } from './types';
import {
  DEFAULT_LOCALE,
  LANGUAGE_COOKIE_NAME,
  normalizeLocale,
  parseAcceptLanguage,
} from './types';

export const getRequestLocale = cache(async (): Promise<AppLocale> => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LANGUAGE_COOKIE_NAME)?.value;
  if (cookieLocale) {
    return normalizeLocale(cookieLocale);
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language');
  return parseAcceptLanguage(acceptLanguage) || DEFAULT_LOCALE;
});
