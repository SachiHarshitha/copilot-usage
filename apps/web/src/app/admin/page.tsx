import Link from 'next/link';

import { requireAdminPage } from '@/lib/admin/requireAdminPage';

export const dynamic = 'force-dynamic';

/**
 * Admin landing page. Routes the operator to:
 *   - /admin/login         when no session cookie is present.
 *   - /admin/login/verify  when the session exists but 2FA is incomplete.
 *   - the dashboard        when fully authenticated.
 */
export default async function AdminHome() {
  const admin = await requireAdminPage();

  const cards = [
    {
      href: '/admin/users',
      title: 'Users',
      description: 'Search accounts, suspend/restore users, revoke devices.',
    },
    {
      href: '/admin/anomalies',
      title: 'Anomalies',
      description: 'Investigate verification anomalies and resolve incidents.',
    },
    {
      href: '/admin/verification',
      title: 'Verification',
      description: 'Inspect per-user GitHub billing verification state.',
    },
    {
      href: '/admin/upload-audits',
      title: 'Upload Audits',
      description: 'Triage ingestion signatures, tokens, and rejection reasons.',
    },
    {
      href: '/admin/metrics',
      title: 'Metrics',
      description: 'Monitor uploads, signature quality, and active usage.',
    },
    {
      href: '/admin/action-log',
      title: 'Action Log',
      description: 'Read immutable audit records for all admin actions.',
    },
  ] as const;

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-4">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/80">
          Active Session
        </p>
        <h2 className="m-0 mt-2 text-xl font-semibold text-slate-100">{admin.email}</h2>
        <p className="m-0 mt-1 text-sm text-cyan-100/80">Role: {admin.role.toLowerCase()}</p>
      </div>

      <p className="m-0 text-sm leading-relaxed text-slate-300">
        Operator console for moderation, verification triage, and system health. Every mutation is
        role-gated and recorded in the immutable audit log.
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-4 no-underline transition hover:border-cyan-400/50 hover:bg-slate-800"
          >
            <h3 className="m-0 text-base font-semibold text-slate-100">{card.title}</h3>
            <p className="m-0 mt-1 text-sm leading-relaxed text-slate-300">{card.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
