import Link from 'next/link';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/requireAdminPage';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const STATUSES = [
  'NOT_CONNECTED',
  'CONNECTED',
  'HEALTHY',
  'MINOR_MISMATCH',
  'WARNING',
  'MISMATCH',
  'UNSUPPORTED',
  'EXPIRED',
  'ERROR',
] as const;

interface SearchParams {
  status?: string;
  cursor?: string;
}

export default async function AdminVerificationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();

  const params = await searchParams;
  const status = params.status || '';
  const cursor = params.cursor;

  const where: Prisma.UserVerificationWhereInput = {};
  if (status) {
    where.githubBillingStatus = status as Prisma.UserVerificationWhereInput['githubBillingStatus'];
  }

  const rows = await prisma.userVerification.findMany({
    where,
    orderBy: [{ lastCheckedAt: { sort: 'desc', nulls: 'last' } }, { userId: 'asc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
    select: {
      userId: true,
      githubBillingStatus: true,
      githubBillingConnected: true,
      lastCheckedAt: true,
      lastHealthyAt: true,
      currentPeriodKey: true,
      mismatchScore: true,
      trustScore: true,
      publicBadgeEligible: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1].userId : null;

  const userIds = visible.map((r) => r.userId);
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : [];
  const usernameById = new Map(users.map((u) => [u.id, u.username]));

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin" style={{ color: 'var(--accent-border)' }}>← Dashboard</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>User verification</h2>

      <form
        method="get"
        action="/admin/verification"
        style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}
      >
        <select name="status" defaultValue={status} style={input}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" style={btn}>Filter</button>
        <Link href="/admin/verification" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Reset</Link>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
            <th style={th}>User</th>
            <th style={th}>Status</th>
            <th style={th}>Connected</th>
            <th style={th}>Last checked</th>
            <th style={th}>Last healthy</th>
            <th style={th}>Period</th>
            <th style={th}>Mismatch</th>
            <th style={th}>Trust</th>
            <th style={th}>Eligible</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.userId} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
              <td style={td}>{usernameById.get(r.userId) ?? <em style={{ color: 'var(--text-secondary)' }}>{r.userId.slice(0, 8)}…</em>}</td>
              <td style={{ ...td, color: statusColor(r.githubBillingStatus) }}>
                {r.githubBillingStatus}
              </td>
              <td style={td}>{r.githubBillingConnected ? 'yes' : 'no'}</td>
              <td style={td}>{fmtDate(r.lastCheckedAt)}</td>
              <td style={td}>{fmtDate(r.lastHealthyAt)}</td>
              <td style={td}>{r.currentPeriodKey ?? '—'}</td>
              <td style={td}>{r.mismatchScore}</td>
              <td style={td}>{r.trustScore}</td>
              <td style={td}>
                {r.publicBadgeEligible ? (
                  <span style={{ color: 'var(--success)' }}>yes</span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>no</span>
                )}
              </td>
              <td style={td}>
                <Link href={`/admin/verification/${r.userId}`} style={{ color: 'var(--accent-border)' }}>
                  Open →
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={10} style={{ ...td, color: 'var(--text-secondary)' }}>No verification rows match.</td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={{
              pathname: '/admin/verification',
              query: { ...(status ? { status } : {}), cursor: nextCursor },
            }}
            style={{ color: 'var(--accent-border)' }}
          >
            Next page →
          </Link>
        </div>
      )}
    </section>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'HEALTHY': return 'var(--success)';
    case 'MINOR_MISMATCH': return 'var(--warning)';
    case 'WARNING': return 'var(--warning)';
    case 'MISMATCH': return 'var(--danger)';
    case 'EXPIRED':
    case 'ERROR': return 'var(--danger)';
    case 'UNSUPPORTED': return 'var(--text-secondary)';
    default: return 'var(--foreground)';
  }
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().replace('T', ' ').slice(0, 16) : '—';
}

const btn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--card-border)',
  color: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  cursor: 'pointer',
};

const input: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--surface-soft)',
  color: 'var(--foreground)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
};

const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' };
