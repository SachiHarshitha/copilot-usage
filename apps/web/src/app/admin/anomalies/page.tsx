import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';

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
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

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
        <Link href="/admin" style={{ color: '#74b9ff' }}>← Dashboard</Link>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#cdd6f4', fontSize: 13 }}>
          <input
            type="checkbox"
            name="unresolved"
            value="true"
            defaultChecked={unresolved}
          />
          Unresolved only
        </label>
        <button type="submit" style={btn}>Filter</button>
        <Link href="/admin/anomalies" style={{ color: '#9aa0aa', fontSize: 13 }}>Reset</Link>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2f3a', textAlign: 'left' }}>
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
            <tr key={r.id} style={{ borderBottom: '1px solid #1a1f2a' }}>
              <td style={td}>{r.detectedAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
              <td style={{ ...td, color: severityColor(r.severity) }}>{r.severity}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{r.code}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                <Link href={`/admin/users/${r.userId}`} style={{ color: '#74b9ff' }}>
                  {r.userId.slice(0, 8)}…
                </Link>
              </td>
              <td style={td}>{r.summary}</td>
              <td style={td}>
                {r.resolvedAt ? (
                  <span style={{ color: '#9aa0aa' }}>resolved</span>
                ) : (
                  <span style={{ color: '#fdcb6e' }}>open</span>
                )}
              </td>
              <td style={td}>
                <Link href={`/admin/anomalies/${r.id}`} style={{ color: '#74b9ff' }}>
                  Open →
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...td, color: '#9aa0aa' }}>No anomalies match.</td>
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
            style={{ color: '#74b9ff' }}
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
    case 'CRITICAL': return '#ff4757';
    case 'HIGH': return '#ff7675';
    case 'MEDIUM': return '#fdcb6e';
    default: return '#cdd6f4';
  }
}

const btn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2a2f3a',
  color: '#e6e6e6',
  border: '1px solid #3a4150',
  borderRadius: 6,
  cursor: 'pointer',
};

const input: React.CSSProperties = {
  padding: '8px 10px',
  background: '#1a1f2a',
  color: '#e6e6e6',
  border: '1px solid #2a2f3a',
  borderRadius: 6,
};

const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600, color: '#9aa0aa' };
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top' };
