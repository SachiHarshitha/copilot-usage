import type { Prisma, PrismaClient } from '@prisma/client';

import { hashEmail } from './clientFingerprint';

/**
 * Status field stored inside `AdminActionLog.metadata` so we can mark a row
 * as ATTEMPTED before the mutation runs and update it to SUCCEEDED/FAILED
 * afterwards without adding another schema column.
 */
export type AdminActionStatus = 'ATTEMPTED' | 'SUCCEEDED' | 'FAILED';

export interface LogAdminActionInput {
  /** Null when the actor is anonymous (e.g., failed login from unknown email). */
  adminUserId?: string | null;
  /** Plaintext email of the acting admin (or attempted email on failure). */
  adminEmail: string;
  /** Coarse action verb, e.g. `LOGIN_PASSWORD`, `LOGIN_2FA`, `LOGOUT`. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ipHash?: string | null;
  userAgentHash?: string | null;
  status?: AdminActionStatus;
  /** Optional pre-mutation snapshot. */
  before?: Prisma.InputJsonValue | null;
  /** Optional post-mutation snapshot. */
  after?: Prisma.InputJsonValue | null;
  /** Free-form metadata. `status` and `reason` are added automatically. */
  metadata?: Record<string, unknown>;
  /** Optional human-readable failure reason (also written into metadata). */
  reason?: string;
}

/**
 * Append a row to `AdminActionLog`. Errors are intentionally re-thrown — the
 * caller (typically {@link withAuditedAction}) must abort the underlying
 * action if we cannot record the audit trail, otherwise we'd silently lose
 * security-relevant evidence.
 */
export async function logAdminAction(
  prisma: PrismaClient,
  input: LogAdminActionInput,
): Promise<{ id: string }> {
  const metadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
    status: input.status ?? 'SUCCEEDED',
  };
  if (input.reason) metadata.reason = input.reason;

  const row = await prisma.adminActionLog.create({
    data: {
      adminUserId: input.adminUserId ?? null,
      adminEmailHash: hashEmail(input.adminEmail),
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      metadata: metadata as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return row;
}

export interface WithAuditedActionInput<T> extends Omit<LogAdminActionInput, 'status'> {
  /** The mutation. Receives the audit log row id in case it needs to attach it. */
  run: (logId: string) => Promise<T>;
}

/**
 * Wrap a mutating admin action in a two-phase audit log:
 *
 *   1. Write `ATTEMPTED` row (failure here aborts the action — no silent loss).
 *   2. Run the handler.
 *   3. Update the row to `SUCCEEDED` (with optional `after` snapshot) or
 *      `FAILED` (with the error message), then re-throw.
 */
export async function withAuditedAction<T>(
  prisma: PrismaClient,
  input: WithAuditedActionInput<T>,
): Promise<T> {
  const { run, ...logInput } = input;
  const { id } = await logAdminAction(prisma, { ...logInput, status: 'ATTEMPTED' });

  try {
    const result = await run(id);
    await prisma.adminActionLog.update({
      where: { id },
      data: {
        metadata: {
          ...(input.metadata ?? {}),
          status: 'SUCCEEDED',
        } as Prisma.InputJsonValue,
      },
    });
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await prisma.adminActionLog
      .update({
        where: { id },
        data: {
          metadata: {
            ...(input.metadata ?? {}),
            status: 'FAILED',
            reason,
          } as Prisma.InputJsonValue,
        },
      })
      .catch(() => {
        // We swallow only the *secondary* update failure so the original
        // error reaches the caller — losing the FAILED marker is bad but
        // hiding the root cause would be worse.
      });
    throw err;
  }
}
