import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';

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
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

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
            background: '#1a1f2a',
            color: '#e6e6e6',
            border: '1px solid #2a2f3a',
            borderRadius: 6,
          }}
        />
        <button type="submit" style={btn}>Search</button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #2a2f3a', textAlign: 'left' }}>
            <th style={th}>Username</th>
            <th style={th}>Display</th>
            <th style={th}>Status</th>
            <th style={th}>Created</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((u) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #1a1f2a' }}>
              <td style={td}>{u.username}</td>
              <td style={td}>{u.displayName ?? '—'}</td>
              <td style={td}>
                {u.deletedAt ? (
                  <span style={{ color: '#ff7675' }}>deleted</span>
                ) : u.status === 'SUSPENDED' ? (
                  <span style={{ color: '#fdcb6e' }}>suspended</span>
                ) : (
                  <span style={{ color: '#55efc4' }}>active</span>
                )}
              </td>
              <td style={td}>{u.createdAt.toISOString().slice(0, 10)}</td>
              <td style={td}>
                <Link href={`/admin/users/${u.id}`} style={{ color: '#74b9ff' }}>
                  View →
                </Link>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...td, color: '#9aa0aa' }}>
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
            style={{ color: '#74b9ff' }}
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
  background: '#2a2f3a',
  color: '#e6e6e6',
  border: '1px solid #3a4150',
  borderRadius: 6,
  cursor: 'pointer',
};

const th: React.CSSProperties = { padding: '8px 6px', fontWeight: 600, color: '#9aa0aa' };
const td: React.CSSProperties = { padding: '8px 6px' };
