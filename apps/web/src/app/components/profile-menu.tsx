'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getProfileAvatarInitial } from '@/lib/profile-menu';

interface ProfileMenuProps {
  username: string;
  avatarUrl: string | null;
}

export function ProfileMenu({ username, avatarUrl }: ProfileMenuProps) {
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Open profile menu"
        onClick={() => setIsOpen((value) => !value)}
        className="group inline-flex items-center rounded-full border border-[#30363d] bg-[#161b22] pl-1 pr-1 py-1 text-sm shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] transition-colors hover:border-[#4f5b6b]"
      >
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#30363d] text-xs font-semibold text-white">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={`@${username} avatar`} className="h-full w-full object-cover" />
          ) : (
            getProfileAvatarInitial(username)
          )}
        </span>
        <span className="mx-2 h-5 w-px bg-[#30363d]" aria-hidden="true" />
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`mr-1 h-4 w-4 text-[#8b949e] transition-transform ${isOpen ? 'rotate-180' : ''}`}
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
          aria-label="Profile menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[#30363d] bg-[#161b22] py-1 shadow-xl"
        >
          <Link
            href={`/u/${username}`}
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[#c9d1d9] no-underline hover:bg-[#0d1117]"
          >
            My Profile
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[#c9d1d9] no-underline hover:bg-[#0d1117]"
          >
            Settings
          </Link>
          <div className="my-1 h-px bg-[#30363d]" />
          <Link
            href="/api/auth/signout?callbackUrl=%2F"
            role="menuitem"
            onClick={() => setIsOpen(false)}
            className="block px-3 py-2 text-sm text-[#fca5a5] no-underline hover:bg-[#0d1117]"
          >
            Log out
          </Link>
        </div>
      )}
    </div>
  );
}
