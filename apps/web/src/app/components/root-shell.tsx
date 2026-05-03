'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ProfileMenu } from './profile-menu';
import { NotificationBar } from './notification-bar';
import { I18nProvider, useI18n } from './i18n-provider';
import { LANGUAGE_COOKIE_NAME, SUPPORTED_LOCALES, type AppLocale } from '@/lib/i18n/types';

const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const THEME_STORAGE_KEY = 'ps_theme';

type AppTheme = 'dark' | 'light';

interface SessionUserInfo {
  username: string;
  avatarUrl: string | null;
}

function isAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function RootShell({
  children,
  sessionUser,
  isSuspended = false,
  locale,
}: {
  children: ReactNode;
  sessionUser: SessionUserInfo | null;
  isSuspended?: boolean;
  locale: AppLocale;
}) {
  const pathname = usePathname();

  // Admin has its own dedicated shell and must not be wrapped in public chrome.
  if (isAdminRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <I18nProvider locale={locale}>
      <PublicShellFrame sessionUser={sessionUser} isSuspended={isSuspended}>
        {children}
      </PublicShellFrame>
    </I18nProvider>
  );
}

function PublicShellFrame({
  children,
  sessionUser,
  isSuspended,
}: {
  children: ReactNode;
  sessionUser: SessionUserInfo | null;
  isSuspended: boolean;
}) {
  const { dictionary, locale } = useI18n();
  const [theme, setTheme] = useState<AppTheme>('dark');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const initialTheme: AppTheme =
      savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : prefersLight
          ? 'light'
          : 'dark';

    applyTheme(initialTheme);
    setTheme(initialTheme);
  }, []);

  function setLocale(nextLocale: AppLocale) {
    if (nextLocale === locale) return;
    const secure = window.location.protocol === 'https:' ? '; secure' : '';

    document.cookie = `${LANGUAGE_COOKIE_NAME}=${nextLocale}; path=/; max-age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
    window.location.reload();
  }

  function toggleTheme() {
    const nextTheme: AppTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const themeButtonTitle =
    theme === 'dark' ? dictionary.nav.switchToLightTheme : dictionary.nav.switchToDarkTheme;

  return (
    <div className="flex min-h-dvh flex-col">
      <nav className="sticky top-0 z-40 shrink-0 flex items-center justify-between border-b border-[var(--card-border)] bg-[var(--background)] px-6 py-3 backdrop-blur">
        <Link href="/" className="flex items-center gap-3 text-[var(--foreground)] no-underline hover:no-underline">
          <Image
            src="/logo.svg"
            alt="promptstreak.dev"
            width={36}
            height={36}
            className="h-9 w-9 rounded-md border border-[var(--card-border)] bg-[var(--background)] object-contain p-1"
            priority
          />
          <span className="leading-tight">
            <span className="block text-lg font-semibold">promptstreak.dev</span>
            <span className="block text-xs text-[var(--text-secondary)]">{dictionary.nav.byline}</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/leaderboard"
            className="rounded-md border border-transparent px-2.5 py-1.5 text-[var(--foreground)] no-underline transition hover:border-[var(--card-border)] hover:bg-[var(--surface-hover)]"
          >
            {dictionary.nav.leaderboard}
          </Link>
          <Link
            href="/leaderboard/repos"
            className="rounded-md border border-transparent px-2.5 py-1.5 text-[var(--foreground)] no-underline transition hover:border-[var(--card-border)] hover:bg-[var(--surface-hover)]"
          >
            {dictionary.nav.repoBoard}
          </Link>

          <LanguageDropdown
            currentLocale={locale}
            label={dictionary.nav.changeLanguage}
            languageNames={dictionary.languageNames}
            onSelect={setLocale}
          />

          <HeaderIconButton onClick={toggleTheme} title={themeButtonTitle}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </HeaderIconButton>

          {sessionUser ? (
            <ProfileMenu username={sessionUser.username} avatarUrl={sessionUser.avatarUrl} />
          ) : (
            <Link
              href="/api/auth/signin?callbackUrl=%2Fsettings"
              title={dictionary.nav.signIn}
              aria-label={dictionary.nav.signIn}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)] no-underline transition hover:border-[var(--accent-border-hover)] hover:bg-[var(--accent-bg-hover)]"
            >
              <LoginIcon />
            </Link>
          )}
        </div>
      </nav>

      <NotificationBar isSuspended={isSuspended} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
      </main>

      <footer className="space-y-2 border-t border-[var(--card-border)] px-6 py-4 text-center text-xs text-[var(--text-tertiary)]">
        <div>{dictionary.footer.disclaimer}</div>
        <div>
          {dictionary.footer.operatedBy}{' '}
          <a
            href="https://emagin8.de/legal"
            className="text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            target="_blank"
            rel="noopener noreferrer"
          >
            Emagin8 UG
          </a>
        </div>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/impressum">{dictionary.footer.impressum}</Link>
          <Link href="/privacy">{dictionary.footer.privacy}</Link>
          <Link href="/terms">{dictionary.footer.terms}</Link>
          <Link href="/contact">{dictionary.footer.contact}</Link>
          <Link href="/report-abuse">{dictionary.footer.reportAbuse}</Link>
        </nav>
      </footer>
    </div>
  );
}

function applyTheme(theme: AppTheme): void {
  document.documentElement.dataset.theme = theme;
}

function HeaderIconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--surface-elevated)] text-[var(--foreground)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
    >
      {children}
    </button>
  );
}

function LanguageDropdown({
  currentLocale,
  label,
  languageNames,
  onSelect,
}: {
  currentLocale: AppLocale;
  label: string;
  languageNames: Record<AppLocale, string>;
  onSelect: (locale: AppLocale) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const buttonTitle = `${label}: ${languageNames[currentLocale]}`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={buttonTitle}
        title={buttonTitle}
        onClick={() => setIsOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--card-border)] bg-[var(--surface-elevated)] text-[var(--foreground)] transition hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
      >
        <LanguageIcon />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--surface-elevated)] py-1 shadow-xl"
        >
          {SUPPORTED_LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={currentLocale === option}
              onClick={() => {
                setIsOpen(false);
                onSelect(option);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-hover)]"
            >
              <span>{languageNames[option]}</span>
              {currentLocale === option && <span className="text-[var(--accent-border)]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 0c2.1 0 3.8 3.36 3.8 7.5s-1.7 7.5-3.8 7.5m0-15c-2.1 0-3.8 3.36-3.8 7.5s1.7 7.5 3.8 7.5m-6.9-5.1h13.8M3.1 7.6h13.8"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 3.25v1.9M10 14.85v1.9M5.15 5.15l1.35 1.35M13.5 13.5l1.35 1.35M3.25 10h1.9M14.85 10h1.9M5.15 14.85l1.35-1.35M13.5 6.5l1.35-1.35M13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12.88 3.24a6.5 6.5 0 1 0 3.88 10.64 6.72 6.72 0 0 1-8.64-8.64 6.48 6.48 0 0 0 4.76-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoginIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8 4H4.75A1.75 1.75 0 0 0 3 5.75v8.5C3 15.22 3.78 16 4.75 16H8M11.25 6.5 14.75 10m0 0-3.5 3.5m3.5-3.5H7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
