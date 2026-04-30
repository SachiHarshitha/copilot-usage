import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { ADMIN_SESSION_COOKIE_NAME } from '@/lib/admin/sessionCookie';
import { getActiveAdmin } from '@/lib/admin/auth/loginActions';
import { validateSession } from '@/lib/admin/session';

export const dynamic = 'force-dynamic';

/**
 * Admin landing page. Routes the operator to:
 *   - /admin/login         when no session cookie is present.
 *   - /admin/login/verify  when the session exists but 2FA is incomplete.
 *   - the dashboard        when fully authenticated.
 */
export default async function AdminHome() {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) redirect('/admin/login');

  const session = await validateSession(prisma, token);
  if (!session) redirect('/admin/login');
  if (!session.twoFactorCompletedAt) redirect('/admin/login/verify');

  const admin = await getActiveAdmin(prisma, token);
  if (!admin) redirect('/admin/login');

  return (
    <section>
      <p style={{ marginTop: 0 }}>
        Signed in as <strong>{admin.email}</strong> ({admin.role.toLowerCase()}).
      </p>
      <p style={{ color: '#9aa0aa' }}>
        Operator console. All mutations are gated by role and recorded in the
        immutable action log.
      </p>
      <ul style={{ paddingLeft: 20 }}>
        <li>
          <a href="/admin/users" style={{ color: '#74b9ff' }}>
            Users
          </a>{' '}
          — search, suspend, restore, soft-delete, revoke devices.
        </li>
        <li>
          <a href="/admin/anomalies" style={{ color: '#74b9ff' }}>
            Anomalies
          </a>{' '}
          — verification anomaly queue; resolve open items.
        </li>
        <li>
          <a href="/admin/verification" style={{ color: '#74b9ff' }}>
            Verification
          </a>{' '}
          — per-user GitHub-billing verification state.
        </li>
        <li>
          <a href="/admin/upload-audits" style={{ color: '#74b9ff' }}>
            Upload audits
          </a>{' '}
          — search the upload-audit log by user, token, signature status, time.
        </li>
        <li>
          <a href="/admin/metrics" style={{ color: '#74b9ff' }}>
            Metrics
          </a>{' '}
          — uploads/hour, signature health, anomaly counts, active users.
        </li>
        <li>
          <a href="/admin/action-log" style={{ color: '#74b9ff' }}>
            Action log
          </a>{' '}
          — read-only audit trail of every admin mutation.
        </li>
      </ul>
      <form action="/api/admin/auth/logout" method="post">
        <button
          type="submit"
          style={{
            padding: '8px 14px',
            background: '#2a2f3a',
            color: '#e6e6e6',
            border: '1px solid #3a4150',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </form>
    </section>
  );
}
