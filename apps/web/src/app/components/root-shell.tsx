'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ProfileMenu } from './profile-menu';

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
}: {
  children: ReactNode;
  sessionUser: SessionUserInfo | null;
}) {
  const pathname = usePathname();

  // Admin has its own dedicated shell and must not be wrapped in public chrome.
  if (isAdminRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center justify-between border-b border-[#30363d] px-6 py-3">
        <Link href="/" className="text-lg font-semibold text-white no-underline hover:no-underline">
          ⚡ promptstreak.dev
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/leaderboard/repos">Repo Board</Link>
          {sessionUser ? (
            <ProfileMenu username={sessionUser.username} avatarUrl={sessionUser.avatarUrl} />
          ) : (
            <Link
              href="/api/auth/signin?callbackUrl=%2Fsettings"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white no-underline hover:bg-brand-700"
            >
              Sign in with GitHub
            </Link>
          )}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>

      <footer className="space-y-2 border-t border-[#30363d] px-6 py-4 text-center text-xs text-[#484f58]">
        <div>
          Stats are self-reported estimates from local VS Code session data. Not affiliated with GitHub
          or Microsoft.
        </div>
        <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/impressum">Impressum</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/report-abuse">Report abuse</Link>
        </nav>
      </footer>
    </div>
  );
}
