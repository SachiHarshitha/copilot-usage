'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', description: 'Overview and quick actions' },
  { href: '/admin/users', label: 'Users', description: 'Manage user lifecycle' },
  { href: '/admin/anomalies', label: 'Anomalies', description: 'Investigate verification issues' },
  { href: '/admin/verification', label: 'Verification', description: 'Billing verification state' },
  { href: '/admin/upload-audits', label: 'Upload Audits', description: 'Ingestion and signature checks' },
  { href: '/admin/metrics', label: 'Metrics', description: 'Operational health snapshot' },
  { href: '/admin/action-log', label: 'Action Log', description: 'Immutable admin audit trail' },
] as const;

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <div className="mb-3 px-1">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
          Navigation
        </p>
      </div>

      <nav aria-label="Admin sections" className="grid gap-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl border px-3 py-2.5 text-sm no-underline transition ${
                active
                  ? 'border-cyan-300/70 bg-cyan-500/10 text-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.2)_inset]'
                  : 'border-slate-700/80 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:bg-slate-800'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <div className="font-medium">{item.label}</div>
              <div className={`mt-0.5 text-xs ${active ? 'text-cyan-200/85' : 'text-slate-400'}`}>
                {item.description}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-slate-700/80 pt-3">
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Session
        </p>
        <form action="/api/admin/auth/logout" method="post">
          <button
            type="submit"
            className="w-full rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-left text-sm font-medium text-rose-100 transition hover:border-rose-300/50 hover:bg-rose-500/20"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
