'use client';

import { createContext, useContext, useMemo } from 'react';

import { getDictionary, type AppDictionary } from '@/lib/i18n/dictionary';
import type { AppLocale } from '@/lib/i18n/types';

interface I18nContextValue {
  locale: AppLocale;
  dictionary: AppDictionary;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  dictionary: getDictionary('en'),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      locale,
      dictionary: getDictionary(locale),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
