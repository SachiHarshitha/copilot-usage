'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ProfileMenu } from './profile-menu';
import { NotificationBar } from './notification-bar';
import { I18nProvider, useI18n } from './i18n-provider';
import type { AppLocale } from '@/lib/i18n/types';

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
  const { dictionary } = useI18n();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <nav className="flex items-center justify-between border-b border-[#30363d] px-6 py-3">
        <Link href="/" className="text-lg font-semibold text-white no-underline hover:no-underline">
          ⚡ promptstreak.dev
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/leaderboard">{dictionary.nav.leaderboard}</Link>
          <Link href="/leaderboard/repos">{dictionary.nav.repoBoard}</Link>
          {sessionUser ? (
            <ProfileMenu username={sessionUser.username} avatarUrl={sessionUser.avatarUrl} />
          ) : (
            <Link
              href="/api/auth/signin?callbackUrl=%2Fsettings"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white no-underline hover:bg-brand-700"
            >
              {dictionary.nav.signIn}
            </Link>
          )}
        </div>
      </nav>

      <NotificationBar isSuspended={isSuspended} />
      <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto overscroll-contain px-6 py-8">{children}</main>

      <footer className="space-y-2 border-t border-[#30363d] px-6 py-4 text-center text-xs text-[#484f58]">
        <div>{dictionary.footer.disclaimer}</div>
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
