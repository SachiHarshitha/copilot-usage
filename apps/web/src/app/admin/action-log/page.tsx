import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/requireAdminPage';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface SearchParams {
  adminUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export default async function AdminActionLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();

  const sp = await searchParams;
  const where: Prisma.AdminActionLogWhereInput = {};
  if (sp.adminUserId) where.adminUserId = sp.adminUserId;
  if (sp.action) where.action = sp.action;
  if (sp.targetType) where.targetType = sp.targetType;
  if (sp.targetId) where.targetId = sp.targetId;
  const fromDate = sp.from ? new Date(sp.from) : null;
  const toDate = sp.to ? new Date(sp.to) : null;
  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate && !Number.isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
      ...(toDate && !Number.isNaN(toDate.getTime()) ? { lte: toDate } : {}),
    };
  }

  const rows = await prisma.adminActionLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(sp.cursor ? { cursor: { id: sp.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      adminUserId: true,
      adminEmailHash: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1].id : null;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Admin action log</h2>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
        Read-only audit. Rows cannot be modified — even by admins.
      </p>
      <form
        method="get"
        action="/admin/action-log"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr) auto',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <input
          type="text"
          name="action"
          defaultValue={sp.action ?? ''}
          placeholder="action (e.g. USER_SUSPEND)"
          style={input}
        />
        <input
          type="text"
          name="targetType"
          defaultValue={sp.targetType ?? ''}
          placeholder="targetType (User, Device)"
          style={input}
        />
        <input
          type="text"
          name="targetId"
          defaultValue={sp.targetId ?? ''}
          placeholder="targetId"
          style={input}
        />
        <button type="submit" style={btn}>
          Filter
        </button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
            <th style={th}>When</th>
            <th style={th}>Action</th>
            <th style={th}>Target</th>
            <th style={th}>Status</th>
            <th style={th}>Admin (hash)</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const meta = r.metadata as { status?: string } | null;
            const status = meta?.status ?? '—';
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
                <td style={td}>{r.createdAt.toISOString()}</td>
                <td style={{ ...td, fontFamily: 'monospace' }}>{r.action}</td>
                <td style={{ ...td, fontFamily: 'monospace' }}>
                  {r.targetType ? `${r.targetType}/${r.targetId ?? '—'}` : '—'}
                </td>
                <td
                  style={{
                    ...td,
                    color:
                      status === 'SUCCEEDED'
                        ? 'var(--success)'
                        : status === 'FAILED'
                          ? 'var(--danger)'
                          : status === 'ATTEMPTED'
                            ? 'var(--warning)'
                            : 'var(--text-secondary)',
                  }}
                >
                  {status}
                </td>
                <td style={{ ...td, fontFamily: 'monospace', color: 'var(--accent-border)' }}>
                  {r.adminEmailHash.slice(0, 12)}…
                </td>
              </tr>
            );
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...td, color: 'var(--text-secondary)' }}>
                No rows match.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={{
              pathname: '/admin/action-log',
              query: { ...sp, cursor: nextCursor },
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

const input: React.CSSProperties = {
  padding: '8px 10px',
  background: 'var(--surface-soft)',
  color: 'var(--foreground)',
  border: '1px solid var(--card-border)',
  borderRadius: 6,
  fontFamily: 'monospace',
};
const btn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--card-border)',
  color: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  cursor: 'pointer',
};
const th: React.CSSProperties = { padding: '6px 6px', fontWeight: 600, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '6px 6px' };
