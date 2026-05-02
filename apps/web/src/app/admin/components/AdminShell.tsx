'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminSidebarNav } from './AdminSidebarNav';

const LOGIN_ROUTES = ['/admin/login'];

function isLoginRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return LOGIN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Client shell that conditionally renders the admin chrome (header + sidebar)
 * only on authenticated routes. Login pages receive bare children so they
 * render as a standalone centred form without the operator dashboard frame.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isLoginRoute(pathname)) {
    // No chrome on login / verify pages — user isn't authenticated yet.
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="mb-5 rounded-2xl border border-slate-700/60 bg-slate-900/80 px-5 py-4 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.9)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
              Operator Console
            </p>
            <h1 className="m-0 mt-1 text-xl font-semibold text-slate-100">PromptStreak Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-300 no-underline transition hover:border-slate-400/60 hover:text-slate-100"
            >
              ← PromptStreak
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-slate-600/70 bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-100 no-underline transition hover:border-cyan-400/60 hover:text-cyan-200"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.95)] backdrop-blur lg:sticky lg:top-5 lg:self-start">
          <AdminSidebarNav />
        </aside>

        <section className="min-w-0 rounded-2xl border border-slate-700/60 bg-slate-900/55 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.95)] backdrop-blur sm:p-6">
          {children}
        </section>
      </div>
    </div>
  );
}
