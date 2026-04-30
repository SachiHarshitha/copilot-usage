import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import { ActionLogPanel } from '../../components/ActionLogPanel';
import { ResolveAnomalyButton } from '../ResolveAnomalyButton';

export const dynamic = 'force-dynamic';

export default async function AdminAnomalyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

  const { id } = await params;

  const row = await prisma.verificationAnomaly.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      code: true,
      severity: true,
      summary: true,
      detectedAt: true,
      resolvedAt: true,
      resolution: true,
      detailsJson: true,
    },
  });
  if (!row) notFound();

  const role = admin.role as 'READ_ONLY' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  const canModerate = role !== 'READ_ONLY';

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/anomalies" style={{ color: '#74b9ff' }}>← All anomalies</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Anomaly {row.id.slice(0, 8)}…</h2>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
        <dt style={dt}>id</dt><dd style={dd}>{row.id}</dd>
        <dt style={dt}>user</dt>
        <dd style={dd}>
          <Link href={`/admin/users/${row.userId}`} style={{ color: '#74b9ff' }}>
            {row.userId}
          </Link>
        </dd>
        <dt style={dt}>code</dt><dd style={dd}>{row.code}</dd>
        <dt style={dt}>severity</dt><dd style={dd}>{row.severity}</dd>
        <dt style={dt}>summary</dt><dd style={dd}>{row.summary}</dd>
        <dt style={dt}>detected</dt><dd style={dd}>{row.detectedAt.toISOString()}</dd>
        <dt style={dt}>resolved</dt>
        <dd style={dd}>
          {row.resolvedAt ? row.resolvedAt.toISOString() : <span style={{ color: '#fdcb6e' }}>open</span>}
        </dd>
        {row.resolution && (
          <>
            <dt style={dt}>resolution</dt>
            <dd style={dd}>{row.resolution}</dd>
          </>
        )}
      </dl>

      <div style={{ marginTop: 16 }}>
        <ResolveAnomalyButton
          anomalyId={row.id}
          alreadyResolved={row.resolvedAt !== null}
          canModerate={canModerate}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14, color: '#9aa0aa', marginBottom: 8 }}>Details JSON</h3>
        <pre
          style={{
            background: '#11151c',
            border: '1px solid #2a2f3a',
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            overflowX: 'auto',
            color: '#cdd6f4',
          }}
        >
{JSON.stringify(row.detailsJson, null, 2) ?? 'null'}
        </pre>
      </div>

      <ActionLogPanel targetType="VerificationAnomaly" targetId={row.id} />
    </section>
  );
}

const dt: React.CSSProperties = { color: '#9aa0aa' };
const dd: React.CSSProperties = { margin: 0, fontFamily: 'monospace', fontSize: 13 };
