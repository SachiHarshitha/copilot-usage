/**
 * User-initiated soft delete (self-deletion).
 *
 * Mirrors the admin-driven `softDeleteUserCore` mutation but writes a
 * `USER_SELF_DELETE` audit row with `adminUserId=null` (the actor is the
 * user themselves). Idempotent: a second call on an already-deleted user
 * returns `{ ok: true, noop: true }`.
 *
 * After the DB transaction commits, all public-cache tags for the user are
 * invalidated so that profile/badges/leaderboard surfaces drop the user
 * immediately (acceptance criterion §10 + §16).
 *
 * The `revalidate` dependency is injected so integration tests can run
 * without a Next.js request context (`revalidateTag` throws outside one).
 */

import type { PrismaClient } from '@prisma/client';
import { revalidateTag } from 'next/cache';

import { withAuditedAction } from '@/lib/admin/auth/audit';
import { tagsForUserChange } from '@/lib/cache/tags';

export interface SelfDeleteResult {
  ok: true;
  noop?: boolean;
}

export interface SelfDeleteOptions {
  /** Override for tests. Default delegates to `next/cache#revalidateTag`. */
  revalidate?: (tag: string) => void;
}

export async function softDeleteSelfCore(
  prisma: PrismaClient,
  userId: string,
  options: SelfDeleteOptions = {}
): Promise<SelfDeleteResult> {
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, deletedAt: true },
  });
  if (!target) throw new Error('user_not_found');
  if (target.deletedAt) return { ok: true, noop: true };

  const tombstoneUsername = `deleted-${target.id}`;

  await withAuditedAction(prisma, {
    adminUserId: null,
    // Synthetic principal label — stored only as a hash in AdminActionLog.
    adminEmail: `self:${target.id}`,
    action: 'USER_SELF_DELETE',
    targetType: 'User',
    targetId: target.id,
    before: { username: target.username },
    after: { username: tombstoneUsername },
    run: async () => {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: target.id },
          data: {
            deletedAt: new Date(),
            username: tombstoneUsername,
            displayName: null,
            avatarUrl: null,
            profilePublic: false,
          },
        }),
        prisma.device.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    },
  });

  const revalidate = options.revalidate ?? revalidateTag;
  for (const tag of tagsForUserChange(target.id, target.username)) {
    try {
      revalidate(tag);
    } catch {
      // revalidateTag is best-effort — never let cache-invalidation failures
      // mask a successful deletion. The next TTL refresh will catch up.
    }
  }

  return { ok: true };
}
