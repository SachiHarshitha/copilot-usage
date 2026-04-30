import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const MIN_LENGTH = 12;

/**
 * Tiny built-in deny list of obvious weak patterns. Not a substitute for a
 * proper compromised-password check, but cheap protection against the worst
 * offenders. Comparison is case-insensitive against the password's
 * lowercased form with non-letter characters stripped.
 */
const COMMON_WEAK_PATTERNS = [
  'password',
  'qwerty',
  'letmein',
  'admin',
  'welcome',
  'iloveyou',
  'abc123',
  'monkey',
  'dragon',
];

/** bcrypt-hash a plaintext password at cost {@link BCRYPT_COST}. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Verify a plaintext password against a bcrypt hash. Returns `false` (rather
 * than throwing) when the stored hash is malformed so callers can treat all
 * mismatches uniformly without leaking error timing/details.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Reject obviously weak admin passwords. Throws an `Error` with a
 * human-readable message describing the first failed criterion.
 */
export function assertPasswordStrength(plain: string): void {
  if (plain.length < MIN_LENGTH) {
    throw new Error(`Password must be at least ${MIN_LENGTH} characters`);
  }

  const hasLower = /[a-z]/.test(plain);
  const hasUpper = /[A-Z]/.test(plain);
  const hasDigit = /[0-9]/.test(plain);
  const hasSymbol = /[^A-Za-z0-9]/.test(plain);
  const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (!hasDigit) {
    throw new Error('Password must contain at least one digit');
  }
  if (classCount < 3) {
    throw new Error(
      'Password must contain at least three character classes (lowercase, uppercase, digit, symbol)',
    );
  }

  const lettersOnly = plain.toLowerCase().replace(/[^a-z]/g, '');
  for (const pattern of COMMON_WEAK_PATTERNS) {
    if (lettersOnly.includes(pattern)) {
      throw new Error('Password is too common or weak');
    }
  }
}
