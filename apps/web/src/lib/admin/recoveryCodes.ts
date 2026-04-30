import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const GROUP_LENGTH = 5;
const RECOVERY_BCRYPT_COST = 10;

/**
 * Generate `count` single-use recovery codes formatted as `XXXXX-XXXXX`,
 * drawn uniformly from the RFC 4648 base32 alphabet (~50 bits of entropy
 * per code). Codes are intended to be displayed once and then bcrypt-hashed
 * for storage via {@link hashRecoveryCode}.
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    codes.push(`${randomGroup()}-${randomGroup()}`);
  }
  return codes;
}

function randomGroup(): string {
  // randomInt would also work, but pulling 1 byte per char keeps the flow
  // identical to the TOTP secret generator and makes auditing easier.
  const bytes = randomBytes(GROUP_LENGTH);
  let out = '';
  for (let i = 0; i < GROUP_LENGTH; i += 1) {
    out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
  }
  return out;
}

/** Bcrypt-hash a recovery code at cost {@link RECOVERY_BCRYPT_COST}. */
export async function hashRecoveryCode(code: string): Promise<string> {
  return bcrypt.hash(normalize(code), RECOVERY_BCRYPT_COST);
}

/**
 * Verify a user-supplied recovery code against a stored hash. The input is
 * trimmed and uppercased to forgive case/whitespace mistakes from operators
 * typing codes off a printed sheet. Returns `false` (never throws) for any
 * malformed hash.
 */
export async function verifyRecoveryCode(code: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(normalize(code), hash);
  } catch {
    return false;
  }
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}
