import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Phase 1b — encryption + blind-index helpers for personally identifiable
 * GitHub-issued identifiers (numeric user id, email).
 *
 * Design goals:
 *  - At-rest confidentiality (AES-256-GCM, per-record IV).
 *  - Equality lookup via deterministic HMAC blind index (peppered HMAC-SHA-256).
 *  - Key rotation without re-encrypting historical rows: ciphertext carries
 *    its key version; the HMAC pepper is rotated separately and tracked by the
 *    `UserIdentity.keyVersion` column (see Phase 1c rotation runbook).
 *
 * NOTHING in this module logs, returns, or accepts plaintext outside the
 * narrow encrypt/decrypt boundary — callers must avoid persisting plaintext
 * GitHub IDs or emails to logs / analytics / error messages.
 */

export interface IdentityKeyRing {
  /** Numeric version of the active encryption key (matches `UserIdentity.keyVersion`). */
  activeVersion: number;
  /** Map of `version → 32-byte AES-256 key`. */
  keys: Map<number, Buffer>;
  /** HMAC pepper (32 bytes, secret) shared across the active version. */
  pepper: Buffer;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const REQUIRED_KEY_BYTES = 32;
const REQUIRED_PEPPER_BYTES = 32;

/* ----------------------------------------------------------------------- */
/* Env loading                                                              */
/* ----------------------------------------------------------------------- */

/**
 * Load the identity key ring from environment variables.
 *
 *  - `IDENTITY_ENCRYPTION_KEYS`: JSON object `{ "1": "<base64-32B>", ... }`
 *  - `IDENTITY_ENCRYPTION_ACTIVE_KEY`: integer version label of the encrypt-side key
 *  - `IDENTITY_HMAC_PEPPER`: base64-encoded 32-byte secret pepper for the blind index
 */
export function loadIdentityKeyRingFromEnv(env: NodeJS.ProcessEnv = process.env): IdentityKeyRing {
  const raw = env.IDENTITY_ENCRYPTION_KEYS;
  const active = env.IDENTITY_ENCRYPTION_ACTIVE_KEY;
  const pepperRaw = env.IDENTITY_HMAC_PEPPER;
  if (!raw) {
    throw new Error('IDENTITY_ENCRYPTION_KEYS is required');
  }
  if (!active) {
    throw new Error('IDENTITY_ENCRYPTION_ACTIVE_KEY is required');
  }
  if (!pepperRaw) {
    throw new Error('IDENTITY_HMAC_PEPPER is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('IDENTITY_ENCRYPTION_KEYS is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('IDENTITY_ENCRYPTION_KEYS must be a JSON object of integer-version → base64 key');
  }

  const keys = new Map<number, Buffer>();
  for (const [version, value] of Object.entries(parsed as Record<string, unknown>)) {
    const v = parseVersion(version, 'IDENTITY_ENCRYPTION_KEYS');
    if (typeof value !== 'string') {
      throw new Error(`Identity encryption key "${version}" must be a base64 string`);
    }
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== REQUIRED_KEY_BYTES) {
      throw new Error(
        `Identity encryption key "${version}" must decode to ${REQUIRED_KEY_BYTES} bytes (got ${buf.length})`,
      );
    }
    keys.set(v, buf);
  }
  if (keys.size === 0) {
    throw new Error('IDENTITY_ENCRYPTION_KEYS must contain at least one key');
  }

  const activeVersion = parseVersion(active, 'IDENTITY_ENCRYPTION_ACTIVE_KEY');
  if (!keys.has(activeVersion)) {
    throw new Error(`Active identity key version "${activeVersion}" not present in IDENTITY_ENCRYPTION_KEYS`);
  }

  const pepper = Buffer.from(pepperRaw, 'base64');
  if (pepper.length !== REQUIRED_PEPPER_BYTES) {
    throw new Error(
      `IDENTITY_HMAC_PEPPER must decode to ${REQUIRED_PEPPER_BYTES} bytes (got ${pepper.length})`,
    );
  }

  return { activeVersion, keys, pepper };
}

function parseVersion(label: string, source: string): number {
  if (!/^\d+$/.test(label)) {
    throw new Error(`${source} version "${label}" must be a positive integer`);
  }
  const n = Number(label);
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new Error(`${source} version "${label}" must be a positive integer`);
  }
  return n;
}

/* ----------------------------------------------------------------------- */
/* Encrypt / decrypt primitives                                             */
/* ----------------------------------------------------------------------- */

/** Ciphertext format: `<intVersion>:<iv_b64>:<tag_b64>:<ct_b64>`. */
export function encryptWithIdentityRing(plaintext: string, ring: IdentityKeyRing): string {
  const key = ring.keys.get(ring.activeVersion);
  if (!key) {
    throw new Error(`Active identity key version "${ring.activeVersion}" missing from ring`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    String(ring.activeVersion),
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function decryptWithIdentityRing(ciphertext: string, ring: IdentityKeyRing): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid identity ciphertext format');
  }
  const [versionStr, ivB64, tagB64, ctB64] = parts;
  const version = parseVersion(versionStr, 'identity ciphertext');
  const key = ring.keys.get(version);
  if (!key) {
    throw new Error(`Unknown identity key version "${version}"`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/* ----------------------------------------------------------------------- */
/* Blind-index HMAC                                                         */
/* ----------------------------------------------------------------------- */

/**
 * Deterministic HMAC-SHA-256 blind index, base64url-encoded (43 chars, no padding).
 *
 * The `domain` separator prevents cross-protocol equality between, e.g.,
 * a numeric GitHub ID equal to "12345" and an email address "12345".
 */
function blindIndex(domain: string, normalized: string, ring: IdentityKeyRing): string {
  return createHmac('sha256', ring.pepper)
    .update(domain)
    .update('|')
    .update(normalized, 'utf8')
    .digest('base64url');
}

/** Constant-time comparison helper for blind-index equality checks. */
export function blindIndexEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/* ----------------------------------------------------------------------- */
/* Normalization                                                            */
/* ----------------------------------------------------------------------- */

/** Canonical decimal string for a GitHub numeric user id. */
export function normalizeGithubId(githubId: string | number | bigint): string {
  if (typeof githubId === 'number') {
    if (!Number.isSafeInteger(githubId) || githubId <= 0) {
      throw new Error('githubId must be a positive integer');
    }
    return String(githubId);
  }
  if (typeof githubId === 'bigint') {
    if (githubId <= 0n) {
      throw new Error('githubId must be a positive integer');
    }
    return githubId.toString(10);
  }
  if (!/^[1-9]\d*$/.test(githubId)) {
    throw new Error('githubId must be a positive integer string');
  }
  return githubId;
}

/** RFC-5321 enough: lower-case, trim, reject obviously malformed. */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) {
    throw new Error('email must be 1..254 characters');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('email is not a valid address');
  }
  return trimmed;
}

/* ----------------------------------------------------------------------- */
/* Public, env-bound API                                                    */
/* ----------------------------------------------------------------------- */

let _ring: IdentityKeyRing | null = null;

function getRing(): IdentityKeyRing {
  if (!_ring) {
    _ring = loadIdentityKeyRingFromEnv();
  }
  return _ring;
}

export function activeIdentityKeyVersion(): number {
  return getRing().activeVersion;
}

export function encryptGithubId(githubId: string | number | bigint): string {
  return encryptWithIdentityRing(normalizeGithubId(githubId), getRing());
}

export function decryptGithubId(ciphertext: string): string {
  return decryptWithIdentityRing(ciphertext, getRing());
}

export function hmacGithubId(githubId: string | number | bigint): string {
  return blindIndex('github_id', normalizeGithubId(githubId), getRing());
}

export function encryptEmail(email: string): string {
  return encryptWithIdentityRing(normalizeEmail(email), getRing());
}

export function decryptEmail(ciphertext: string): string {
  return decryptWithIdentityRing(ciphertext, getRing());
}

export function hmacEmail(email: string): string {
  return blindIndex('email', normalizeEmail(email), getRing());
}

/** Test-only — clears the cached ring so tests can swap env vars. */
export function __resetIdentityCryptoForTests(): void {
  _ring = null;
}
