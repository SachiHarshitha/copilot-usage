import type { AdminRole, AdminUser, PrismaClient } from '@prisma/client';

import { encryptToken } from '../crypto/tokenEncryption';
import { assertPasswordStrength, hashPassword } from './password';
import { generateRecoveryCodes, hashRecoveryCode } from './recoveryCodes';
import { buildOtpauthUri, generateTotpSecret } from './totp';

/** Display name shown in authenticator apps next to the TOTP entry. */
export const ADMIN_TOTP_ISSUER = 'Promptstreak Admin';

export interface ProvisionAdminInput {
  email: string;
  password: string;
  /** Defaults to READ_ONLY — bootstrap CLI overrides to ADMIN/SUPER_ADMIN. */
  role?: AdminRole;
}

export interface ProvisionAdminResult {
  adminUser: AdminUser;
  /** Raw base32 TOTP secret. Returned exactly once for QR / manual entry. */
  totpSecret: string;
  /** otpauth:// URI to render as a QR code in the bootstrap output. */
  otpauthUri: string;
  /** Plaintext recovery codes. Returned exactly once; only hashes are stored. */
  recoveryCodes: string[];
}

/**
 * Create the persistent state required to authenticate a fresh admin: the
 * AdminUser row, an unconfirmed TOTP secret (encrypted with the active key
 * ring), and 10 single-use recovery codes (bcrypt-hashed before storage).
 *
 * Side-effect-free until validation passes — a weak password or duplicate
 * email throws before any rows are written, so the bootstrap CLI can retry
 * without leaving partially provisioned state behind.
 */
export async function provisionAdmin(
  prisma: PrismaClient,
  input: ProvisionAdminInput,
): Promise<ProvisionAdminResult> {
  assertPasswordStrength(input.password);

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Email must be a valid address');
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Admin with email "${email}" already exists`);
  }

  const passwordHash = await hashPassword(input.password);
  const totpSecret = generateTotpSecret();
  const encryptedSecret = encryptToken(totpSecret);
  const recoveryCodes = generateRecoveryCodes(10);
  const recoveryHashes = await Promise.all(recoveryCodes.map((c) => hashRecoveryCode(c)));

  const adminUser = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      role: input.role ?? 'READ_ONLY',
      totpSecret: {
        create: { encryptedSecret },
      },
      recoveryCodes: {
        create: recoveryHashes.map((codeHash) => ({ codeHash })),
      },
    },
  });

  const otpauthUri = buildOtpauthUri({
    secret: totpSecret,
    accountName: email,
    issuer: ADMIN_TOTP_ISSUER,
  });

  return { adminUser, totpSecret, otpauthUri, recoveryCodes };
}
