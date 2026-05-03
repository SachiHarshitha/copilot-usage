import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin/requireAdminPage';
import {
  activeDevices,
  activeUsers,
  anomaliesBySeverity,
  signatureStatusShare,
  uploadsPerHour,
  verifiedEligibleUsers,
} from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

export default async function AdminMetricsPage() {
  const admin = await requireAdminPage();

  const [
    uph,
    sigShare,
    devices,
    users,
    eligible,
    anomalies,
  ] = await Promise.all([
    uploadsPerHour(prisma, 24),
    signatureStatusShare(prisma, 24),
    activeDevices(prisma, 7),
    activeUsers(prisma, 7),
    verifiedEligibleUsers(prisma),
    anomaliesBySeverity(prisma),
  ]);

  const generatedAt = new Date().toISOString();
  const maxBucket = Math.max(1, ...uph.map((p) => p.count));
  const totalUploads24h = uph.reduce((a, p) => a + p.count, 0);
  const sigTotal = Object.values(sigShare).reduce((a, n) => a + n, 0);

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin" style={{ color: 'var(--accent-border)' }}>← Dashboard</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>Metrics</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 0 }}>
        Snapshot at {generatedAt}. Each load runs all six aggregations against
        Postgres; for a cached snapshot use{' '}
        <code>GET /api/admin/metrics/overview</code>.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Tile label="Uploads (24h)" value={totalUploads24h.toLocaleString()} />
        <Tile label="Active users (7d)" value={users.toLocaleString()} />
        <Tile label="Active devices (7d)" value={devices.toLocaleString()} />
        <Tile label="Verified eligible users" value={eligible.toLocaleString()} />
      </div>

      <Panel title="Uploads per hour (last 24h, UTC)">
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 120, gap: 2 }}>
          {uph.map((p) => {
            const pct = (p.count / maxBucket) * 100;
            const hour = p.hour.slice(11, 16);
            return (
              <div
                key={p.hour}
                title={`${p.hour} — ${p.count}`}
                style={{
                  flex: 1,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${pct}%`,
                    background: 'var(--accent-border)',
                    borderRadius: '2px 2px 0 0',
                    minHeight: p.count > 0 ? 2 : 0,
                  }}
                />
                <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>{hour}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title={`Signature status share (last 24h — ${sigTotal} rows)`}>
        {sigTotal === 0 ? (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No upload-audit rows in window.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(sigShare)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => {
                const pct = (count / sigTotal) * 100;
                return (
                  <li key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 180, fontSize: 13, color: sigColor(status) }}>{status}</span>
                    <div style={{ flex: 1, background: 'var(--surface-soft)', borderRadius: 4, height: 12 }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: sigColor(status),
                          borderRadius: 4,
                        }}
                      />
                    </div>
                    <span style={{ width: 80, textAlign: 'right', fontSize: 13, color: 'var(--foreground)' }}>
                      {count} ({pct.toFixed(1)}%)
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </Panel>

      <Panel title="Open anomalies by severity">
        {Object.keys(anomalies).length === 0 ? (
          <p style={{ color: 'var(--success)', margin: 0 }}>No open anomalies.</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
              const count = anomalies[sev] ?? 0;
              if (count === 0) return null;
              return (
                <Link
                  key={sev}
                  href={`/admin/anomalies?severity=${sev}&unresolved=true`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 120,
                    padding: 12,
                    border: `1px solid ${sevColor(sev)}`,
                    borderRadius: 6,
                    color: sevColor(sev),
                    textDecoration: 'none',
                  }}
                >
                  <strong style={{ fontSize: 24 }}>{count}</strong>
                  <span style={{ fontSize: 12 }}>{sev}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--card-border)',
        borderRadius: 8,
        background: 'var(--surface-elevated)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, color: 'var(--foreground)', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 16,
        border: '1px solid var(--card-border)',
        borderRadius: 8,
        background: 'var(--surface-elevated)',
        marginBottom: 16,
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: 14, color: 'var(--text-secondary)' }}>{title}</h3>
      {children}
    </section>
  );
}

function sigColor(s: string): string {
  switch (s) {
    case 'VALID': return 'var(--success)';
    case 'MISSING':
    case 'STALE_TIMESTAMP': return 'var(--warning)';
    case 'INVALID':
    case 'REPLAYED_NONCE':
    case 'BODY_HASH_MISMATCH':
    case 'DEVICE_REVOKED': return 'var(--danger)';
    default: return 'var(--foreground)';
  }
}

function sevColor(s: string): string {
  switch (s) {
    case 'CRITICAL': return 'var(--danger)';
    case 'HIGH': return 'var(--danger)';
    case 'MEDIUM': return 'var(--warning)';
    default: return 'var(--foreground)';
  }
}
