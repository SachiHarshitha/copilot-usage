import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Versioned AES-256-GCM key ring used for symmetric encryption of
 * server-managed secrets (GitHub user-access tokens, admin TOTP seeds, etc.).
 *
 * Ciphertexts are formatted as `<keyVersion>:<iv_b64>:<tag_b64>:<ct_b64>`
 * so historical ciphertexts remain decryptable after the active key rotates.
 */
export interface KeyRing {
  /** Version label of the key currently used for new encryptions. */
  activeVersion: string;
  /** Map of `version → 32-byte AES-256 key` for both encrypt and decrypt. */
  keys: Map<string, Buffer>;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const REQUIRED_KEY_BYTES = 32;

/**
 * Parse and validate a key ring from environment variables.
 *
 * - `GITHUB_TOKEN_ENCRYPTION_KEYS`: JSON object mapping version → base64 key.
 * - `GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY`: version label of the encrypt-side key.
 *
 * Throws synchronously on any misconfiguration so the process fails fast at
 * startup rather than at first use.
 */
export function loadKeyRingFromEnv(env: NodeJS.ProcessEnv = process.env): KeyRing {
  const raw = env.GITHUB_TOKEN_ENCRYPTION_KEYS;
  const active = env.GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY;
  if (!raw) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEYS is required');
  }
  if (!active) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_ACTIVE_KEY is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEYS is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEYS must be a JSON object of version → base64 key');
  }

  const keys = new Map<string, Buffer>();
  for (const [version, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw new Error(`Encryption key "${version}" must be a base64 string`);
    }
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== REQUIRED_KEY_BYTES) {
      throw new Error(
        `Encryption key "${version}" must decode to ${REQUIRED_KEY_BYTES} bytes (got ${buf.length})`,
      );
    }
    keys.set(version, buf);
  }

  if (keys.size === 0) {
    throw new Error('GITHUB_TOKEN_ENCRYPTION_KEYS must contain at least one key');
  }
  if (!keys.has(active)) {
    throw new Error(`Active key version "${active}" not present in GITHUB_TOKEN_ENCRYPTION_KEYS`);
  }

  return { activeVersion: active, keys };
}

/** Encrypt `plaintext` using the active key in the supplied ring. */
export function encryptWithKeyRing(plaintext: string, ring: KeyRing): string {
  const key = ring.keys.get(ring.activeVersion);
  if (!key) {
    throw new Error(`Active key version "${ring.activeVersion}" missing from key ring`);
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ring.activeVersion,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

/** Decrypt a ciphertext produced by {@link encryptWithKeyRing}. */
export function decryptWithKeyRing(ciphertext: string, ring: KeyRing): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format');
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  const key = ring.keys.get(version);
  if (!key) {
    throw new Error(`Unknown key version "${version}"`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

let _ring: KeyRing | null = null;

function getRing(): KeyRing {
  if (!_ring) {
    _ring = loadKeyRingFromEnv();
  }
  return _ring;
}

/** Encrypt using the process-env-loaded key ring. Loads lazily on first use. */
export function encryptToken(plaintext: string): string {
  return encryptWithKeyRing(plaintext, getRing());
}

/** Decrypt using the process-env-loaded key ring. Loads lazily on first use. */
export function decryptToken(ciphertext: string): string {
  return decryptWithKeyRing(ciphertext, getRing());
}

/** Version label of the key that {@link encryptToken} will use for new ciphertexts. */
export function currentKeyVersion(): string {
  return getRing().activeVersion;
}

/**
 * Reset the cached key ring. Test-only helper — production code should not
 * mutate the key ring at runtime.
 */
export function __resetTokenEncryptionForTests(): void {
  _ring = null;
}
