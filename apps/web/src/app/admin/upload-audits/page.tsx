import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const STATUSES = [
  'VALID',
  'MISSING',
  'INVALID',
  'STALE_TIMESTAMP',
  'REPLAYED_NONCE',
  'BODY_HASH_MISMATCH',
  'DEVICE_REVOKED',
] as const;

interface SearchParams {
  userId?: string;
  tokenId?: string;
  deviceId?: string;
  signatureStatus?: string;
  accepted?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export default async function AdminUploadAuditsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

  const params = await searchParams;
  const userId = params.userId || '';
  const tokenId = params.tokenId || '';
  const deviceId = params.deviceId || '';
  const signatureStatus = params.signatureStatus || '';
  const acceptedRaw = params.accepted || '';
  const from = params.from || '';
  const to = params.to || '';
  const cursor = params.cursor;

  const where: Prisma.UploadAuditWhereInput = {};
  if (userId) where.userId = userId;
  if (tokenId) where.tokenId = tokenId;
  if (deviceId) where.deviceId = deviceId;
  if (signatureStatus) {
    where.signatureStatus = signatureStatus as Prisma.UploadAuditWhereInput['signatureStatus'];
  }
  if (acceptedRaw === 'true') where.accepted = true;
  else if (acceptedRaw === 'false') where.accepted = false;
  if (from || to) {
    where.receivedAt = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) (where.receivedAt as Prisma.DateTimeFilter).gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) (where.receivedAt as Prisma.DateTimeFilter).lt = d;
    }
  }

  const rows = await prisma.uploadAudit.findMany({
    where,
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      deviceId: true,
      tokenId: true,
      receivedAt: true,
      clientVersion: true,
      signatureStatus: true,
      accepted: true,
      rejectionCode: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1].id : null;

  const carried: Record<string, string> = {};
  if (userId) carried.userId = userId;
  if (tokenId) carried.tokenId = tokenId;
  if (deviceId) carried.deviceId = deviceId;
  if (signatureStatus) carried.signatureStatus = signatureStatus;
  if (acceptedRaw) carried.accepted = acceptedRaw;
  if (from) carried.from = from;
  if (to) carried.to = to;

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin" style={{ color: '#74b9ff' }}>← Dashboard</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Upload audits</h2>
      <p style={{ color: '#9aa0aa', fontSize: 13, marginTop: 0 }}>
        Triage view over <code>UploadAudit</code>. ipHash and userAgentHash are
        deliberately omitted from this projection.
      </p>

      <form
        method="get"
        action="/admin/upload-audits"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 16 }}
      >
        <input type="text" name="userId" defaultValue={userId} placeholder="userId" style={input} />
        <input type="text" name="tokenId" defaultValue={tokenId} placeholder="tokenId" style={input} />
        <input type="text" name="deviceId" defaultValue={deviceId} placeholder="deviceId" style={input} />
        <select name="signatureStatus" defaultValue={signatureStatus} style={input}>
          <option value="">Any signature status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="accepted" defaultValue={acceptedRaw} style={input}>
          <option value="">Any accepted</option>
          <option value="true">accepted=true</option>
          <option value="false">accepted=false</option>
        </select>
        <input
          type="datetime-local"
          name="from"
          defaultValue={fmtForInput(from)}
          style={input}
          title="from (inclusive)"
        />
        <input
          type="datetime-local"
          name="to"
          defaultValue={fmtForInput(to)}
          style={input}
          title="to (exclusive)"
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="submit" style={btn}>Search</button>
          <Link href="/admin/upload-audits" style={{ color: '#9aa0aa', fontSize: 13 }}>Reset</Link>
        </div>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2f3a', textAlign: 'left' }}>
            <th style={th}>Received</th>
            <th style={th}>User</th>
            <th style={th}>Device</th>
            <th style={th}>Token</th>
            <th style={th}>Client</th>
            <th style={th}>Signature</th>
            <th style={th}>Accepted</th>
            <th style={th}>Reject code</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #1a1f2a' }}>
              <td style={td}>{r.receivedAt.toISOString().replace('T', ' ').slice(0, 19)}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                <Link href={`/admin/users/${r.userId}`} style={{ color: '#74b9ff' }}>
                  {r.userId.slice(0, 8)}…
                </Link>
              </td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                {r.deviceId ? `${r.deviceId.slice(0, 8)}…` : '—'}
              </td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>
                {r.tokenId ? `${r.tokenId.slice(0, 8)}…` : '—'}
              </td>
              <td style={td}>{r.clientVersion ?? '—'}</td>
              <td style={{ ...td, color: sigColor(r.signatureStatus) }}>{r.signatureStatus}</td>
              <td style={td}>
                {r.accepted ? (
                  <span style={{ color: '#55efc4' }}>yes</span>
                ) : (
                  <span style={{ color: '#ff7675' }}>no</span>
                )}
              </td>
              <td style={td}>{r.rejectionCode ?? '—'}</td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={8} style={{ ...td, color: '#9aa0aa' }}>No audit rows match.</td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={{
              pathname: '/admin/upload-audits',
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

function sigColor(s: string): string {
  switch (s) {
    case 'VALID': return '#55efc4';
    case 'MISSING':
    case 'STALE_TIMESTAMP': return '#fdcb6e';
    case 'INVALID':
    case 'REPLAYED_NONCE':
    case 'BODY_HASH_MISMATCH':
    case 'DEVICE_REVOKED': return '#ff7675';
    default: return '#cdd6f4';
  }
}

function fmtForInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // datetime-local expects "YYYY-MM-DDTHH:MM"
  return d.toISOString().slice(0, 16);
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
