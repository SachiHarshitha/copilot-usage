import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';

export interface PanelEntry {
  id: string;
  action: string;
  adminEmailHash: string;
  createdAt: string;
  metadata: unknown;
}

interface PanelProps {
  /** When provided, scopes to a single target (e.g. user or device). */
  targetType?: string;
  targetId?: string;
  /** When provided, scopes to a single admin actor. */
  adminUserId?: string;
  limit?: number;
}

/**
 * Server component: a compact, reusable audit-log panel. Drop it into any
 * detail page that has a `targetType + targetId` to surface the change
 * history for that record.
 */
export async function ActionLogPanel(props: PanelProps) {
  const limit = Math.min(props.limit ?? 25, 100);
  const where: Prisma.AdminActionLogWhereInput = {};
  if (props.targetType) where.targetType = props.targetType;
  if (props.targetId) where.targetId = props.targetId;
  if (props.adminUserId) where.adminUserId = props.adminUserId;

  const rows = await prisma.adminActionLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      action: true,
      adminEmailHash: true,
      createdAt: true,
      metadata: true,
    },
  });

  const entries: PanelEntry[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    adminEmailHash: r.adminEmailHash,
    createdAt: r.createdAt.toISOString(),
    metadata: r.metadata,
  }));

  return (
    <aside
      style={{
        marginTop: 24,
        padding: 16,
        border: '1px solid #2a2f3a',
        borderRadius: 8,
        background: '#11151c',
      }}
    >
      <h3 style={{ marginTop: 0, fontSize: 14, color: '#9aa0aa' }}>Recent admin actions</h3>
      {entries.length === 0 ? (
        <p style={{ color: '#9aa0aa', margin: 0 }}>No actions logged.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {entries.map((e) => {
            const meta = e.metadata as { status?: string } | null;
            const status = meta?.status;
            return (
              <li
                key={e.id}
                style={{
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#cdd6f4',
                  borderBottom: '1px solid #1a1f2a',
                  paddingBottom: 6,
                }}
              >
                <span style={{ color: '#9aa0aa' }}>{e.createdAt}</span>{' '}
                <strong>{e.action}</strong>
                {status && (
                  <span
                    style={{
                      marginLeft: 8,
                      color:
                        status === 'SUCCEEDED'
                          ? '#55efc4'
                          : status === 'FAILED'
                            ? '#ff7675'
                            : '#fdcb6e',
                    }}
                  >
                    [{status}]
                  </span>
                )}
                <div style={{ color: '#74b9ff' }}>by {e.adminEmailHash.slice(0, 12)}…</div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
