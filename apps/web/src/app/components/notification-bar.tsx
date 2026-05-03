'use client';

import Link from 'next/link';
import { useI18n } from './i18n-provider';

interface NotificationBarProps {
  isSuspended: boolean;
}

export function NotificationBar({ isSuspended }: NotificationBarProps) {
  const { dictionary } = useI18n();
  if (!isSuspended) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-3 border-b border-[var(--alert-border)] bg-[var(--alert-bg)] px-6 py-2.5 text-sm text-[var(--alert-text)]"
    >
      <span className="text-[var(--alert-accent)]">⚠</span>
      <span>
        {dictionary.notification.suspendedMessage}
      </span>
      <Link
        href="/contact"
        className="ml-1 whitespace-nowrap font-medium text-[var(--alert-link)] underline underline-offset-2 hover:text-[var(--foreground)] no-underline hover:no-underline"
      >
        {dictionary.notification.contactSupport}
      </Link>
    </div>
  );
}
