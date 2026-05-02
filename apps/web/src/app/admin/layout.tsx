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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0b223f_0%,#0b111a_38%,#070b12_100%)] text-slate-100">
      <AdminShell>{children}</AdminShell>
    </div>
  );
}
