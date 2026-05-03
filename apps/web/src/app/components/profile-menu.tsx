'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getAllowedAvatarUrl, getProfileAvatarInitial } from '@/lib/profile-menu';
import { useI18n } from './i18n-provider';

interface ProfileMenuProps {
  username: string;
  avatarUrl: string | null;
}

export function ProfileMenu({ username, avatarUrl }: ProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const safeAvatarUrl = getAllowedAvatarUrl(avatarUrl);
  const { dictionary } = useI18n();

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={dictionary.profileMenu.openAria}
        onClick={() => setIsOpen((value) => !value)}
        className="group inline-flex items-center rounded-full border border-[var(--card-border)] bg-[var(--surface-elevated)] pl-1 pr-1 py-1 text-sm transition-colors hover:border-[var(--accent-border)]"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--card-border)] text-xs font-semibold text-[var(--foreground)]">
          {safeAvatarUrl ? (
            <Image src={safeAvatarUrl} alt={`@${username} avatar`} width={32} height={32} className="h-full w-full object-cover" />
          ) : (
            getProfileAvatarInitial(username)
          )}
        </span>
        <span className="mx-2 h-5 w-px bg-[var(--card-border)]" aria-hidden="true" />
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`mr-1 h-4 w-4 text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.12l3.71-3.89a.75.75 0 1 1 1.08 1.04l-4.25 4.46a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label={dictionary.profileMenu.menuAria}
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--surface-elevated)] py-1 shadow-xl"
        >
          <Link
            href={`/u/${username}`}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[var(--foreground)] no-underline hover:bg-[var(--surface-hover)]"
          >
            {dictionary.profileMenu.myProfile}
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[var(--foreground)] no-underline hover:bg-[var(--surface-hover)]"
          >
            {dictionary.profileMenu.settings}
          </Link>
          <div className="my-1 h-px bg-[var(--card-border)]" />
          <Link
            href="/api/auth/signout?callbackUrl=%2F"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[var(--danger)] no-underline hover:bg-[var(--surface-hover)]"
          >
            {dictionary.profileMenu.logout}
          </Link>
        </div>
      )}
    </div>
  );
}
