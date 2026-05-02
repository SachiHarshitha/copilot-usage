'use client';

import Link from 'next/link';

interface NotificationBarProps {
  isSuspended: boolean;
}

export function NotificationBar({ isSuspended }: NotificationBarProps) {
  if (!isSuspended) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-3 border-b border-red-700/50 bg-red-950/60 px-6 py-2.5 text-sm text-red-300"
    >
      <span className="text-red-400">⚠</span>
      <span>
        Your account has been suspended. Public profile and leaderboard visibility are paused.
      </span>
      <Link
        href="/contact"
        className="ml-1 whitespace-nowrap font-medium text-red-200 underline underline-offset-2 hover:text-white no-underline hover:no-underline"
      >
        Contact support →
      </Link>
    </div>
  );
}
