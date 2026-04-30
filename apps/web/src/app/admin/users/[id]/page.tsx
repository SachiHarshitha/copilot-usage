import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import { UserActionButtons } from '../UserActionButtons';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

  const { id } = await params;

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [user, devices, recentUploads30d] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        profilePublic: true,
        createdAt: true,
        githubId: true,
        status: true,
        deletedAt: true,
      },
    }),
    prisma.device.findMany({
      where: { userId: id },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        tokenId: true,
        revokedAt: true,
      },
    }),
    prisma.uploadLog.count({ where: { userId: id, uploadedAt: { gte: since30d } } }),
  ]);

  if (!user) notFound();

  const role = admin.role as 'READ_ONLY' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  const canModerate = role === 'MODERATOR' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  const canAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/users" style={{ color: '#74b9ff' }}>
          ← All users
        </Link>
      </div>
      <h2 style={{ marginTop: 0 }}>{user.username}</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
        <dt style={{ color: '#9aa0aa' }}>id</dt>
        <dd style={{ margin: 0, fontFamily: 'monospace' }}>{user.id}</dd>
        <dt style={{ color: '#9aa0aa' }}>github id</dt>
        <dd style={{ margin: 0 }}>{user.githubId}</dd>
        <dt style={{ color: '#9aa0aa' }}>display</dt>
        <dd style={{ margin: 0 }}>{user.displayName ?? '—'}</dd>
        <dt style={{ color: '#9aa0aa' }}>profile</dt>
        <dd style={{ margin: 0 }}>{user.profilePublic ? 'public' : 'private'}</dd>
        <dt style={{ color: '#9aa0aa' }}>created</dt>
        <dd style={{ margin: 0 }}>{user.createdAt.toISOString()}</dd>
        <dt style={{ color: '#9aa0aa' }}>status</dt>
        <dd style={{ margin: 0 }}>
          {user.deletedAt
            ? `deleted (${user.deletedAt.toISOString()})`
            : user.status.toLowerCase()}
        </dd>
        <dt style={{ color: '#9aa0aa' }}>uploads (30d)</dt>
        <dd style={{ margin: 0 }}>{recentUploads30d}</dd>
      </dl>

      <UserActionButtons
        userId={user.id}
        status={user.status as 'ACTIVE' | 'SUSPENDED'}
        isDeleted={user.deletedAt !== null}
        canModerate={canModerate}
        canAdmin={canAdmin}
        devices={devices.map((d) => ({
          id: d.id,
          tokenId: d.tokenId,
          revokedAt: d.revokedAt?.toISOString() ?? null,
        }))}
      />
    </section>
  );
}
