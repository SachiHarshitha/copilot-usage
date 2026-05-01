import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import { findActiveBadgeOverride } from '@/lib/admin/badgeOverrides';
import { BadgeOverrideButton } from '../BadgeOverrideButton';

export const dynamic = 'force-dynamic';

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');
  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

  const { userId } = await params;

  const [row, user, openAnomalies, activeOverride, recentOverrides] = await Promise.all([
    prisma.userVerification.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } }),
    prisma.verificationAnomaly.findMany({
      where: { userId, resolvedAt: null },
      orderBy: [{ detectedAt: 'desc' }],
      take: 10,
      select: { id: true, code: true, severity: true, summary: true, detectedAt: true },
    }),
    findActiveBadgeOverride(prisma, userId),
    prisma.adminBadgeOverride.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        eligible: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { email: true } },
      },
    }),
  ]);

  if (!row) notFound();

  const canOverride = admin.role === 'ADMIN';

  return (
    <section>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/verification" style={{ color: '#74b9ff' }}>← All verification rows</Link>
      </div>
      <h2 style={{ marginTop: 0 }}>
        Verification — {user?.username ?? userId}
      </h2>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
        <dt style={dt}>user</dt>
        <dd style={dd}>
          <Link href={`/admin/users/${userId}`} style={{ color: '#74b9ff' }}>{userId}</Link>
        </dd>
        <dt style={dt}>github billing connected</dt>
        <dd style={dd}>{row.githubBillingConnected ? 'yes' : 'no'}</dd>
        <dt style={dt}>github billing status</dt>
        <dd style={dd}>{row.githubBillingStatus}</dd>
        <dt style={dt}>verified at</dt>
        <dd style={dd}>{row.verifiedAt?.toISOString() ?? '—'}</dd>
        <dt style={dt}>last checked</dt>
        <dd style={dd}>{row.lastCheckedAt?.toISOString() ?? '—'}</dd>
        <dt style={dt}>last healthy</dt>
        <dd style={dd}>{row.lastHealthyAt?.toISOString() ?? '—'}</dd>
        <dt style={dt}>current period key</dt>
        <dd style={dd}>{row.currentPeriodKey ?? '—'}</dd>
        <dt style={dt}>local premium requests</dt>
        <dd style={dd}>{row.localPremiumRequests?.toString() ?? '—'}</dd>
        <dt style={dt}>verified premium requests</dt>
        <dd style={dd}>{row.verifiedPremiumRequests?.toString() ?? '—'}</dd>
        <dt style={dt}>difference (absolute)</dt>
        <dd style={dd}>{row.differenceAbsolute?.toString() ?? '—'}</dd>
        <dt style={dt}>difference (%)</dt>
        <dd style={dd}>{row.differencePercent ? row.differencePercent.toString() : '—'}</dd>
        <dt style={dt}>mismatch score</dt>
        <dd style={dd}>{row.mismatchScore}</dd>
        <dt style={dt}>trust score</dt>
        <dd style={dd}>{row.trustScore}</dd>
        <dt style={dt}>public badge eligible</dt>
        <dd style={dd}>{row.publicBadgeEligible ? 'yes' : 'no'}</dd>
        <dt style={dt}>updated at</dt>
        <dd style={dd}>{row.updatedAt.toISOString()}</dd>
      </dl>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14, color: '#9aa0aa', marginBottom: 8 }}>
          Open anomalies for this user
        </h3>
        {openAnomalies.length === 0 ? (
          <p style={{ color: '#9aa0aa' }}>None open.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {openAnomalies.map((a) => (
              <li
                key={a.id}
                style={{ borderBottom: '1px solid #1a1f2a', padding: '6px 0', fontSize: 13 }}
              >
                <span style={{ color: '#9aa0aa', fontFamily: 'monospace' }}>
                  {a.detectedAt.toISOString().slice(0, 19).replace('T', ' ')}
                </span>{' '}
                <strong>{a.severity}</strong>{' '}
                <span style={{ fontFamily: 'monospace' }}>{a.code}</span>{' '}
                — {a.summary}{' '}
                <Link href={`/admin/anomalies/${a.id}`} style={{ color: '#74b9ff' }}>
                  open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 14, color: '#9aa0aa', marginBottom: 8 }}>
          Manual badge override
        </h3>
        {activeOverride ? (
          <div
            style={{
              border: '1px solid #2a2f3a',
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
              background: '#0f1218',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <strong style={{ color: activeOverride.eligible ? '#55efc4' : '#fdcb6e' }}>
                  Active: forces eligible = {activeOverride.eligible ? 'true' : 'false'}
                </strong>
                <div style={{ fontSize: 12, color: '#9aa0aa', marginTop: 4 }}>
                  set {activeOverride.createdAt.slice(0, 19).replace('T', ' ')} UTC
                  {activeOverride.expiresAt
                    ? ` · expires ${activeOverride.expiresAt.slice(0, 19).replace('T', ' ')} UTC`
                    : ' · indefinite'}
                </div>
                <div style={{ fontSize: 13, marginTop: 6 }}>{activeOverride.reason}</div>
              </div>
              <BadgeOverrideButton
                userId={userId}
                currentEligible={row.publicBadgeEligible}
                canOverride={canOverride}
              />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ color: '#9aa0aa', fontSize: 13 }}>
              No active override. Computed eligibility ({row.publicBadgeEligible ? 'true' : 'false'})
              applies.
            </span>
            <BadgeOverrideButton
              userId={userId}
              currentEligible={row.publicBadgeEligible}
              canOverride={canOverride}
            />
          </div>
        )}

        {recentOverrides.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#9aa0aa' }}>
              History ({recentOverrides.length} most recent)
            </summary>
            <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
              {recentOverrides.map((o) => (
                <li
                  key={o.id}
                  style={{ borderBottom: '1px solid #1a1f2a', padding: '6px 0', fontSize: 12 }}
                >
                  <span style={{ color: '#9aa0aa', fontFamily: 'monospace' }}>
                    {o.createdAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </span>{' '}
                  <strong style={{ color: o.eligible ? '#55efc4' : '#fdcb6e' }}>
                    {o.eligible ? 'true' : 'false'}
                  </strong>{' '}
                  {o.expiresAt
                    ? `until ${o.expiresAt.toISOString().slice(0, 19).replace('T', ' ')}`
                    : 'indefinite'}{' '}
                  by {o.createdBy?.email ?? '(deleted admin)'} — {o.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: '#9aa0aa' }}>
        Refresh and disconnect actions are deferred until the GitHub-billing
        verification worker (Verification Task 3.6) lands. Once Task 4.1
        (`recomputeBadgeEligibility`) is in, it will consult the active
        override via `resolveBadgeEligibility` so this panel is the
        authoritative way to grant or revoke the badge by hand.
      </p>
    </section>
  );
}

const dt: React.CSSProperties = { color: '#9aa0aa' };
const dd: React.CSSProperties = { margin: 0, fontFamily: 'monospace', fontSize: 13 };
