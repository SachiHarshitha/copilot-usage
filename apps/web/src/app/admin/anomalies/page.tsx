import Link from 'next/link';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/requireAdminPage';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  severity?: string;
  code?: string;
  userId?: string;
  unresolved?: string;
  cursor?: string;
}

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export default async function AdminAnomaliesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();

  const params = await searchParams;
  const severity = params.severity || '';
  const code = params.code || '';
  const userId = params.userId || '';
  const unresolved = params.unresolved === 'true';
  const cursor = params.cursor;

  const where: Prisma.VerificationAnomalyWhereInput = {};
  if (severity) where.severity = severity as Prisma.VerificationAnomalyWhereInput['severity'];
  if (code) where.code = code as Prisma.VerificationAnomalyWhereInput['code'];
  if (userId) where.userId = userId;
  if (unresolved) where.resolvedAt = null;

  const rows = await prisma.verificationAnomaly.findMany({
    where,
    orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      code: true,
      severity: true,
      summary: true,
      detectedAt: true,
      resolvedAt: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1].id : null;

  const carried: Record<string, string> = {};
  if (severity) carried.severity = severity;
  if (code) carried.code = code;
  if (userId) carried.userId = userId;
  if (unresolved) carried.unresolved = 'true';

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin" style={{ color: 'var(--accent-border)' }}>← Dashboard</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Verification anomalies</h2>

      <form
        method="get"
        action="/admin/anomalies"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}
      >
        <select name="severity" defaultValue={severity} style={input}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          name="code"
          defaultValue={code}
          placeholder="Code (e.g. PREMIUM_MISMATCH_LARGE)"
          style={{ ...input, minWidth: 260 }}
        />
        <input
          type="text"
          name="userId"
          defaultValue={userId}
          placeholder="userId"
          style={{ ...input, minWidth: 180 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--foreground)', fontSize: 13 }}>
          <input
            type="checkbox"
            name="unresolved"
            value="true"
            defaultChecked={unresolved}
          />
          Unresolved only
        </label>
        <button type="submit" style={btn}>Filter</button>
        <Link href="/admin/anomalies" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Reset</Link>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
            <th style={th}>Detected</th>
            <th style={th}>Severity</th>
            <th style={th}>Code</th>
            <th style={th}>User</th>
            <th style={th}>Summary</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
              <td style={td}>{r.detectedAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
              <td style={{ ...td, color: severityColor(r.severity) }}>{r.severity}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                <Link href={`/admin/users/${r.userId}`} style={{ color: 'var(--accent-border)' }}>
                  {r.userId.slice(0, 8)}…
                </Link>
              </td>
              <td style={td}>{r.summary}</td>
              <td style={td}>
                {r.resolvedAt ? (
                  <span style={{ color: 'var(--text-secondary)' }}>resolved</span>
                ) : (
                  <span style={{ color: 'var(--warning)' }}>open</span>
                )}
              </td>
              <td style={td}>
                <Link href={`/admin/anomalies/${r.id}`} style={{ color: 'var(--accent-border)' }}>
                  Open →
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...td, color: 'var(--text-secondary)' }}>No anomalies match.</td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={{
              pathname: '/admin/anomalies',
              query: { ...carried, cursor: nextCursor },
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

function severityColor(s: string): string {
  switch (s) {
    case 'CRITICAL': return 'var(--danger)';
    case 'HIGH': return 'var(--danger)';
    case 'MEDIUM': return 'var(--warning)';
    default: return 'var(--foreground)';
  }
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
