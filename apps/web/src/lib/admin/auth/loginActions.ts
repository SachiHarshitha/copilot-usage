import bcrypt from 'bcryptjs';
import type { AdminUser, PrismaClient } from '@prisma/client';

import { decryptToken, encryptToken } from '../../crypto/tokenEncryption';
import { verifyPassword } from '../password';
import { hashRecoveryCode, verifyRecoveryCode as bcryptCompareCode } from '../recoveryCodes';
import { generateRecoveryCodes } from '../recoveryCodes';
import {
  createSession,
  hashSessionToken,
  markTwoFactorCompleted,
  revokeSession,
  validateSession,
} from '../session';
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from '../totp';
import { ADMIN_TOTP_ISSUER } from '../provisioning';
import { logAdminAction, withAuditedAction } from './audit';
import type { MailService } from '../../mail/mailService';

/** Optional dependencies for login flows. Mail is omitted in tests that
 * don't care about side-effect notifications; production wires the
 * SmtpMailService here. */
export interface LoginDeps {
  mail?: MailService;
}

/** How far back we look for a prior login from the same IP fingerprint
 * before treating an IP as "new" for the new-IP notification. */
export const NEW_IP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * After this many consecutive failed login attempts the admin is locked.
 * The window is implicit: a successful login resets the counter, and we
 * also reset whenever a previous lockout has expired (see `loginWithPassword`).
 */
export const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
/** Length of an automatic lockout after the threshold is hit. */
export const FAILED_LOGIN_LOCKOUT_MS = 30 * 60_000;

/**
 * Constant-time decoy hash used when an unknown email is supplied. The
 * bcrypt comparison cost dwarfs the cost of the surrounding lookup, so
 * comparing against this hash makes the unknown-email path indistinguishable
 * (timing-wise) from the wrong-password path. The plaintext is irrelevant —
 * no real password will ever produce this hash.
 */
const DUMMY_BCRYPT_HASH = '$2a$12$abcdefghijklmnopqrstuvCV.KqlGFQEABLp9qF2lGLPeP6Tq5C5n7e';

export interface AuthContext {
  ipHash: string | null;
  userAgentHash: string | null;
}

export interface LoginInput extends AuthContext {
  email: string;
  password: string;
}

export type LoginResult =
  | {
      ok: true;
      /** Raw session token to set in the __Host- cookie. */
      token: string;
      sessionId: string;
      /** "setup" → first-time TOTP enrollment; "verify" → existing TOTP. */
      requires2fa: 'setup' | 'verify';
    }
  | {
      ok: false;
      /** Always a generic "invalid_credentials" string for normal failures. */
      reason: 'invalid_credentials' | 'account_locked';
      /** Seconds the caller should wait before retrying (locked path only). */
      retryAfterSeconds?: number;
    };

/**
 * Step 1 of admin login. Verifies email + password, opens a session whose
 * `twoFactorCompletedAt` is `null` (so it is unusable for protected actions
 * until step 2), and returns `requires2fa: 'setup' | 'verify'` so the UI
 * knows which page to show next.
 *
 * Both the "no such email" and "wrong password" branches:
 * - Spend the same bcrypt cost (`DUMMY_BCRYPT_HASH`) to keep timing uniform.
 * - Return the same `invalid_credentials` reason.
 * - Write a `LOGIN_PASSWORD` audit row tagged FAILED with a structured
 *   `reason` field — observable in the log but not in the response.
 */
export async function loginWithPassword(
  prisma: PrismaClient,
  input: LoginInput,
  deps: LoginDeps = {},
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const admin = email.includes('@')
    ? await prisma.adminUser.findUnique({
        where: { email },
        include: { totpSecret: true },
      })
    : null;

  if (!admin) {
    // Same bcrypt latency as the wrong-password path.
    await verifyPassword(input.password, DUMMY_BCRYPT_HASH);
    await safeLog(prisma, {
      adminEmail: email || '<empty>',
      action: 'LOGIN_PASSWORD',
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
      status: 'FAILED',
      reason: 'unknown_email',
    });
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    await safeLog(prisma, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'LOGIN_PASSWORD',
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
      status: 'FAILED',
      reason: 'account_locked',
    });
    return {
      ok: false,
      reason: 'account_locked',
      retryAfterSeconds: Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000),
    };
  }

  const passwordOk = await verifyPassword(input.password, admin.passwordHash);
  if (!passwordOk) {
    await registerFailedAttempt(prisma, admin, deps.mail);
    await safeLog(prisma, {
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: 'LOGIN_PASSWORD',
      ipHash: input.ipHash,
      userAgentHash: input.userAgentHash,
      status: 'FAILED',
      reason: 'wrong_password',
    });
    return { ok: false, reason: 'invalid_credentials' };
  }

  // Successful password — reset failure state and open a pre-2FA session.
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const { token, session } = await createSession(prisma, {
    adminUserId: admin.id,
    ipHash: input.ipHash ?? undefined,
    userAgentHash: input.userAgentHash ?? undefined,
  });

  const requires2fa: 'setup' | 'verify' =
    admin.totpSecret && admin.totpSecret.confirmedAt ? 'verify' : 'setup';

  await safeLog(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'LOGIN_PASSWORD',
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash,
    status: 'SUCCEEDED',
    metadata: { requires2fa, sessionId: session.id },
  });

  if (deps.mail) {
    await sendNewIpNotificationIfUnknown(prisma, deps.mail, admin, input.ipHash).catch(() => {
      // Don't fail the login if the notification can't be queued.
    });
  }

  return { ok: true, token, sessionId: session.id, requires2fa };
}

/** Resolve a pre-2FA session from a raw cookie token, or null if missing/expired. */
async function resolvePre2faSession(
  prisma: PrismaClient,
  rawToken: string,
): Promise<{ sessionId: string; admin: AdminUser } | null> {
  if (!rawToken) return null;
  // Don't use validateSession here — we DO accept sessions whose
  // twoFactorCompletedAt is null, which validateSession itself doesn't
  // distinguish on. We do, however, enforce both expiry windows.
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(rawToken) },
    include: { adminUser: true },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  const now = Date.now();
  if (session.idleExpiresAt.getTime() <= now) return null;
  if (session.absoluteExpiresAt.getTime() <= now) return null;
  return { sessionId: session.id, admin: session.adminUser };
}

export interface SetupTwoFactorResult {
  /** Raw base32 secret for manual entry. */
  secret: string;
  /** otpauth:// URI to render as a QR code. */
  otpauthUri: string;
}

/**
 * Step 2a (first-time enrollment): generate a fresh, *unconfirmed* TOTP
 * secret and persist it encrypted. Re-running this overwrites a previous
 * unconfirmed secret (so an operator can rescan the QR if their first
 * attempt failed) but refuses to overwrite a *confirmed* secret.
 */
export async function setupTwoFactor(
  prisma: PrismaClient,
  rawToken: string,
  ctx: AuthContext,
): Promise<SetupTwoFactorResult> {
  const sess = await resolvePre2faSession(prisma, rawToken);
  if (!sess) throw new AuthError('invalid_session');

  const existing = await prisma.adminTotpSecret.findUnique({
    where: { adminUserId: sess.admin.id },
  });
  if (existing && existing.confirmedAt) {
    throw new AuthError('totp_already_confirmed');
  }

  const secret = generateTotpSecret();
  const encryptedSecret = encryptToken(secret);
  await prisma.adminTotpSecret.upsert({
    where: { adminUserId: sess.admin.id },
    update: { encryptedSecret, confirmedAt: null },
    create: { adminUserId: sess.admin.id, encryptedSecret },
  });

  await safeLog(prisma, {
    adminUserId: sess.admin.id,
    adminEmail: sess.admin.email,
    action: 'LOGIN_2FA_SETUP',
    ipHash: ctx.ipHash,
    userAgentHash: ctx.userAgentHash,
    status: 'SUCCEEDED',
  });

  return {
    secret,
    otpauthUri: buildOtpauthUri({
      secret,
      accountName: sess.admin.email,
      issuer: ADMIN_TOTP_ISSUER,
    }),
  };
}

export interface ConfirmTwoFactorResult {
  /** Newly generated single-use recovery codes — shown exactly once. */
  recoveryCodes: string[];
}

/**
 * Step 2b (first-time enrollment): verify the operator's first TOTP code,
 * mark the secret confirmed, generate fresh recovery codes (replacing any
 * unused ones from earlier provisioning), and complete the session's 2FA.
 */
export async function confirmTwoFactor(
  prisma: PrismaClient,
  rawToken: string,
  code: string,
  ctx: AuthContext,
): Promise<ConfirmTwoFactorResult> {
  const sess = await resolvePre2faSession(prisma, rawToken);
  if (!sess) throw new AuthError('invalid_session');

  const totp = await prisma.adminTotpSecret.findUnique({
    where: { adminUserId: sess.admin.id },
  });
  if (!totp) throw new AuthError('totp_not_setup');
  if (totp.confirmedAt) throw new AuthError('totp_already_confirmed');

  const secret = decryptToken(totp.encryptedSecret);
  if (!verifyTotp(code, secret)) {
    await safeLog(prisma, {
      adminUserId: sess.admin.id,
      adminEmail: sess.admin.email,
      action: 'LOGIN_2FA_CONFIRM',
      ipHash: ctx.ipHash,
      userAgentHash: ctx.userAgentHash,
      status: 'FAILED',
      reason: 'wrong_code',
    });
    throw new AuthError('invalid_code');
  }

  return withAuditedAction(prisma, {
    adminUserId: sess.admin.id,
    adminEmail: sess.admin.email,
    action: 'LOGIN_2FA_CONFIRM',
    ipHash: ctx.ipHash,
    userAgentHash: ctx.userAgentHash,
    run: async () => {
      await prisma.adminTotpSecret.update({
        where: { adminUserId: sess.admin.id },
        data: { confirmedAt: new Date() },
      });

      // Replace any prior unused codes so the freshly displayed sheet is
      // the only valid one. Used codes (usedAt != null) are kept as audit
      // trail per the data-handling spec.
      await prisma.adminRecoveryCode.deleteMany({
        where: { adminUserId: sess.admin.id, usedAt: null },
      });
      const codes = generateRecoveryCodes(10);
      const hashes = await Promise.all(codes.map((c) => hashRecoveryCode(c)));
      await prisma.adminRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({ adminUserId: sess.admin.id, codeHash })),
      });

      await markTwoFactorCompleted(prisma, sess.sessionId);
      await prisma.adminUser.update({
        where: { id: sess.admin.id },
        data: { lastLoginAt: new Date() },
      });

      return { recoveryCodes: codes };
    },
  });
}

/**
 * Step 2c (returning admin): verify a TOTP code against the confirmed secret
 * and complete the session's 2FA.
 */
export async function verifyTwoFactor(
  prisma: PrismaClient,
  rawToken: string,
  code: string,
  ctx: AuthContext,
): Promise<{ adminUser: AdminUser }> {
  const sess = await resolvePre2faSession(prisma, rawToken);
  if (!sess) throw new AuthError('invalid_session');

  const totp = await prisma.adminTotpSecret.findUnique({
    where: { adminUserId: sess.admin.id },
  });
  if (!totp || !totp.confirmedAt) throw new AuthError('totp_not_setup');

  const secret = decryptToken(totp.encryptedSecret);
  if (!verifyTotp(code, secret)) {
    await safeLog(prisma, {
      adminUserId: sess.admin.id,
      adminEmail: sess.admin.email,
      action: 'LOGIN_2FA',
      ipHash: ctx.ipHash,
      userAgentHash: ctx.userAgentHash,
      status: 'FAILED',
      reason: 'wrong_code',
    });
    throw new AuthError('invalid_code');
  }

  await markTwoFactorCompleted(prisma, sess.sessionId);
  await prisma.adminUser.update({
    where: { id: sess.admin.id },
    data: { lastLoginAt: new Date() },
  });
  await safeLog(prisma, {
    adminUserId: sess.admin.id,
    adminEmail: sess.admin.email,
    action: 'LOGIN_2FA',
    ipHash: ctx.ipHash,
    userAgentHash: ctx.userAgentHash,
    status: 'SUCCEEDED',
  });
  return { adminUser: sess.admin };
}

/**
 * Step 2d (returning admin, lost device): consume a single-use recovery code
 * in lieu of a TOTP code and complete the session's 2FA. The code is matched
 * by trying every unused row's bcrypt hash — N is small (≤10) so this is
 * cheap, and we get the right behaviour without storing a plaintext lookup
 * key.
 */
export async function verifyRecoveryCode(
  prisma: PrismaClient,
  rawToken: string,
  code: string,
  ctx: AuthContext,
): Promise<{ adminUser: AdminUser; remaining: number }> {
  const sess = await resolvePre2faSession(prisma, rawToken);
  if (!sess) throw new AuthError('invalid_session');

  const candidates = await prisma.adminRecoveryCode.findMany({
    where: { adminUserId: sess.admin.id, usedAt: null },
  });

  let matchedId: string | null = null;
  for (const candidate of candidates) {
    if (await bcryptCompareCode(code, candidate.codeHash)) {
      matchedId = candidate.id;
      break;
    }
  }

  if (!matchedId) {
    await safeLog(prisma, {
      adminUserId: sess.admin.id,
      adminEmail: sess.admin.email,
      action: 'LOGIN_RECOVERY',
      ipHash: ctx.ipHash,
      userAgentHash: ctx.userAgentHash,
      status: 'FAILED',
      reason: 'wrong_code',
    });
    throw new AuthError('invalid_code');
  }

  await prisma.adminRecoveryCode.update({
    where: { id: matchedId },
    data: { usedAt: new Date() },
  });
  await markTwoFactorCompleted(prisma, sess.sessionId);
  await prisma.adminUser.update({
    where: { id: sess.admin.id },
    data: { lastLoginAt: new Date() },
  });

  const remaining = await prisma.adminRecoveryCode.count({
    where: { adminUserId: sess.admin.id, usedAt: null },
  });
  await safeLog(prisma, {
    adminUserId: sess.admin.id,
    adminEmail: sess.admin.email,
    action: 'LOGIN_RECOVERY',
    ipHash: ctx.ipHash,
    userAgentHash: ctx.userAgentHash,
    status: 'SUCCEEDED',
    metadata: { remaining },
  });
  return { adminUser: sess.admin, remaining };
}

/**
 * Revoke the session associated with `rawToken`. Idempotent — calling with a
 * stale or unknown token is a no-op (and still audited). The caller is
 * responsible for clearing the cookie on the response.
 */
export async function logout(
  prisma: PrismaClient,
  rawToken: string,
  ctx: AuthContext,
): Promise<void> {
  if (!rawToken) return;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(rawToken) },
    include: { adminUser: true },
  });
  if (!session) return;
  await revokeSession(prisma, session.id);
  await safeLog(prisma, {
    adminUserId: session.adminUserId,
    adminEmail: session.adminUser.email,
    action: 'LOGOUT',
    ipHash: ctx.ipHash,
    userAgentHash: ctx.userAgentHash,
    status: 'SUCCEEDED',
  });
}

/**
 * Resolve a fully-authenticated session (password + 2FA) given the raw
 * cookie token. Returns null on any failure. Slides the idle window forward
 * via {@link validateSession}.
 */
export async function getActiveAdmin(
  prisma: PrismaClient,
  rawToken: string,
): Promise<AdminUser | null> {
  if (!rawToken) return null;
  const result = await validateSession(prisma, rawToken);
  if (!result) return null;
  if (!result.session.twoFactorCompletedAt) return null;
  return result.adminUser;
}

class AuthError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'AuthError';
  }
}

export { AuthError };

async function registerFailedAttempt(
  prisma: PrismaClient,
  admin: AdminUser,
  mail?: MailService,
): Promise<void> {
  // If a previous lockout has expired, treat this as a fresh streak.
  const startsFresh = admin.lockedUntil && admin.lockedUntil.getTime() <= Date.now();
  const next = startsFresh ? 1 : admin.failedLoginCount + 1;
  const shouldLock = next >= FAILED_LOGIN_LOCKOUT_THRESHOLD;
  const unlocksAt = shouldLock ? new Date(Date.now() + FAILED_LOGIN_LOCKOUT_MS) : admin.lockedUntil;
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      failedLoginCount: shouldLock ? 0 : next,
      lockedUntil: unlocksAt,
    },
  });
  if (shouldLock && mail && unlocksAt) {
    await mail
      .send({
        to: [admin.email],
        templateId: 'admin-lockout',
        variables: {
          who: admin.email,
          unlocksAt: unlocksAt.toISOString(),
          duration: `${Math.round(FAILED_LOGIN_LOCKOUT_MS / 60_000)} minutes`,
        },
      })
      .catch(() => {
        // Mail is best-effort; the lockout itself already happened.
      });
  }
}

/**
 * Send `admin-login-from-new-ip` if there's no prior SUCCEEDED LOGIN_PASSWORD
 * row for this admin from the same `ipHash` within the lookback window.
 * Naturally caps at one notification per (admin, ipHash) per 30 days because
 * the *current* successful login row already exists by the time we run.
 */
async function sendNewIpNotificationIfUnknown(
  prisma: PrismaClient,
  mail: MailService,
  admin: AdminUser,
  ipHash: string | null,
): Promise<void> {
  if (!ipHash) return;
  const since = new Date(Date.now() - NEW_IP_LOOKBACK_MS);
  const prior = await prisma.adminActionLog.findFirst({
    where: {
      adminUserId: admin.id,
      action: 'LOGIN_PASSWORD',
      ipHash,
      createdAt: { gte: since },
      metadata: { path: ['status'], equals: 'SUCCEEDED' },
    },
    orderBy: { createdAt: 'desc' },
    // The current SUCCEEDED row was written immediately above, so it sits at
    // the top of the ordering. Skipping past it lets us check whether *any*
    // earlier successful login from this IP exists in the lookback window.
    skip: 1,
  });
  if (prior) return;
  await mail.send({
    to: [admin.email],
    templateId: 'admin-login-from-new-ip',
    variables: {
      who: admin.email,
      loginAt: new Date().toISOString(),
      ipHashShort: ipHash.slice(0, 12),
    },
  });
}

async function safeLog(
  prisma: PrismaClient,
  input: Parameters<typeof logAdminAction>[1],
): Promise<void> {
  try {
    await logAdminAction(prisma, input);
  } catch {
    // We deliberately swallow audit-write failures on the *non-mutating*
    // helpers (loginWithPassword, verifyTwoFactor, …). The mutation has
    // already happened or been declined; failing the response now would
    // be worse for the operator than a missing log row. The mutating
    // wrappers (`withAuditedAction`) keep stricter semantics.
  }
}

// Avoid unused-import lint when bcrypt is referenced only via verifyPassword/etc.
void bcrypt;
