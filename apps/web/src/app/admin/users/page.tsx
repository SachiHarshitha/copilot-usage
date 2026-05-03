import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/requireAdminPage';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  cursor?: string;
}

/**
 * Admin users list. Server-rendered. Search is a plain GET form (no JS) so
 * the page works under the most degraded loopback conditions. The full
 * mutation surface lives on the per-user detail page so this list never
 * needs CSRF-sensitive controls.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();

  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const cursor = params.cursor;

  const rows = await prisma.user.findMany({
    where: q ? { username: { contains: q, mode: 'insensitive' } } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      username: true,
      displayName: true,
      status: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? visible[visible.length - 1].id : null;

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Users</h2>
      <form
        method="get"
        action="/admin/users"
        style={{ display: 'flex', gap: 8, marginBottom: 16 }}
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search username (case-insensitive)"
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'var(--surface-soft)',
            color: 'var(--foreground)',
            border: '1px solid var(--card-border)',
            borderRadius: 6,
          }}
        />
        <button type="submit" style={btn}>Search</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
            <th style={th}>Username</th>
            <th style={th}>Display</th>
            <th style={th}>Status</th>
            <th style={th}>Created</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
              <td style={td}>{u.username}</td>
              <td style={td}>{u.displayName ?? '—'}</td>
              <td style={td}>
                {u.deletedAt ? (
                  <span style={{ color: 'var(--danger)' }}>deleted</span>
                ) : u.status === 'SUSPENDED' ? (
                  <span style={{ color: 'var(--warning)' }}>suspended</span>
                ) : (
                  <span style={{ color: 'var(--success)' }}>active</span>
                )}
              </td>
              <td style={td}>{u.createdAt.toISOString().slice(0, 10)}</td>
              <td style={td}>
                <Link href={`/admin/users/${u.id}`} style={{ color: 'var(--accent-border)' }}>
                  View →
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...td, color: 'var(--text-secondary)' }}>
                No users match.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={{
              pathname: '/admin/users',
              query: { ...(q ? { q } : {}), cursor: nextCursor },
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

const btn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--card-border)',
  color: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  cursor: 'pointer',
};

const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600, color: 'var(--text-secondary)' };
const td: React.CSSProperties = { padding: '8px 6px' };
