import type { ReactNode } from 'react';

export const metadata = {
  title: 'PromptStreak Admin',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell layout. Intentionally minimal — the admin surface is loopback-only
 * (see apps/web/src/middleware.ts) and intended for operator use over an SSH
 * tunnel. No public theming, no third-party scripts.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          padding: '24px',
          background: '#0b0d12',
          color: '#e6e6e6',
        }}
      >
        <header style={{ borderBottom: '1px solid #2a2f3a', paddingBottom: 12, marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>PromptStreak Admin</h1>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
