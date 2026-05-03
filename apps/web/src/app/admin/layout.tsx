import type { ReactNode } from 'react';
import { AdminShell } from './components/AdminShell';

export const metadata = {
  title: 'PromptStreak Admin',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell layout. Intentionally minimal — the admin surface is loopback-only
 * (see apps/web/src/middleware.ts) and intended for operator use over an SSH
 * tunnel. No public theming, no third-party scripts.
 *
 * Chrome (header + sidebar) is hidden on login routes — see AdminShell.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] text-[var(--foreground)]">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
