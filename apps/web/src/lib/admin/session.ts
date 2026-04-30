import { createHash, randomBytes } from 'node:crypto';

import type { AdminSession, AdminUser, PrismaClient } from '@prisma/client';

/** 30 minutes of inactivity before a session is treated as expired. */
export const IDLE_TIMEOUT_MS = 30 * 60_000;
/** 8-hour hard ceiling regardless of activity, mirrors plan's threat model. */
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60_000;

/** Generate a 32-byte (256-bit) opaque session token, base64url-encoded. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 of the raw session token. The DB only ever stores this digest. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface CreateSessionInput {
  adminUserId: string;
  ipHash?: string;
  userAgentHash?: string;
}

interface CreateSessionResult {
  token: string;
  session: AdminSession;
}

/**
 * Create a new admin session row and return the raw token to set as a cookie.
 * The raw token is *only* returned here — every later read goes through the
 * stored hash.
 */
export async function createSession(
  prisma: PrismaClient,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const token = generateSessionToken();
  const now = Date.now();
  const session = await prisma.adminSession.create({
    data: {
      adminUserId: input.adminUserId,
      tokenHash: hashSessionToken(token),
      idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_TIMEOUT_MS),
      ipHash: input.ipHash ?? null,
      userAgentHash: input.userAgentHash ?? null,
    },
  });
  return { token, session };
}

interface ValidateResult {
  session: AdminSession;
  adminUser: AdminUser;
}

/**
 * Look up a session by its raw token, enforce both expiry windows, and slide
 * the idle window forward on success. Returns `null` on any miss/expiry —
 * never throws — so call sites can treat all auth failures uniformly.
 */
export async function validateSession(
  prisma: PrismaClient,
  rawToken: string,
): Promise<ValidateResult | null> {
  if (!rawToken) return null;
  const tokenHash = hashSessionToken(rawToken);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;

  const now = Date.now();
  if (session.absoluteExpiresAt.getTime() <= now) return null;
  if (session.idleExpiresAt.getTime() <= now) return null;

  const slid = await prisma.adminSession.update({
    where: { id: session.id },
    data: { idleExpiresAt: new Date(now + IDLE_TIMEOUT_MS) },
  });
  return { session: slid, adminUser: session.adminUser };
}

/**
 * Promote a session from "password verified" to "fully authenticated" by
 * stamping `twoFactorCompletedAt`. Idempotent — repeated calls keep the
 * earliest stamp so audit trails are unambiguous.
 */
export async function markTwoFactorCompleted(
  prisma: PrismaClient,
  sessionId: string,
): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, twoFactorCompletedAt: null },
    data: { twoFactorCompletedAt: new Date() },
  });
}

/** Mark a single session as revoked. Subsequent validateSession calls fail. */
export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke every active session for an admin. Used after password rotation and
 * when an operator is locked or removed.
 */
export async function revokeAllSessionsForAdmin(
  prisma: PrismaClient,
  adminUserId: string,
): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
