import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode a buffer to RFC 4648 base32 (uppercase, padded to multiples of 8). */
export function encodeBase32(buf: Buffer): string {
  if (buf.length === 0) return '';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  while (out.length % 8 !== 0) {
    out += '=';
  }
  return out;
}

/** Decode an RFC 4648 base32 string. Case-insensitive; tolerates spaces and missing padding. */
export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  if (cleaned.length === 0) return Buffer.alloc(0);
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a fresh 160-bit (20-byte) TOTP shared secret as base32. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

interface TotpOptions {
  /** Unix time in seconds. Defaults to `Date.now() / 1000`. */
  time?: number;
  /** TOTP step in seconds. RFC 6238 default is 30. */
  period?: number;
  /** Number of decimal digits in the generated code. Default 6. */
  digits?: number;
}

/**
 * Generate a TOTP code per RFC 6238 (HMAC-SHA1, dynamic truncation).
 *
 * The `secret` is the shared base32-encoded seed; we decode it back to bytes
 * before HMAC-ing the 8-byte big-endian counter `floor(time / period)`.
 */
export function generateTotp(secret: string, opts: TotpOptions = {}): string {
  const { time = Math.floor(Date.now() / 1000), period = 30, digits = 6 } = opts;
  const counter = Math.floor(time / period);
  const counterBuf = Buffer.alloc(8);
  // 32-bit high half then low half — JS bit-ops are 32-bit, so split safely.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const key = decodeBase32(secret);
  const hmac = createHmac('sha1', key).update(counterBuf).digest();

  // RFC 4226 §5.3 dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const mod = 10 ** digits;
  return String(code % mod).padStart(digits, '0');
}

interface VerifyOptions extends TotpOptions {
  /** Number of steps before/after `time` to also accept. Default 1 (±30s). */
  window?: number;
}

/**
 * Verify a candidate TOTP code in constant time across a small skew window.
 *
 * Returns `false` for any non-numeric, wrong-length, or otherwise malformed
 * input rather than throwing.
 */
export function verifyTotp(code: string, secret: string, opts: VerifyOptions = {}): boolean {
  const { time = Math.floor(Date.now() / 1000), period = 30, digits = 6, window = 1 } = opts;
  if (typeof code !== 'string' || code.length !== digits || !/^\d+$/.test(code)) {
    return false;
  }
  const candidate = Buffer.from(code, 'utf8');
  let match = false;
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotp(secret, { time: time + offset * period, period, digits });
    const expectedBuf = Buffer.from(expected, 'utf8');
    if (timingSafeEqual(candidate, expectedBuf)) {
      // Don't break — finish the loop so timing stays uniform across all offsets.
      match = true;
    }
  }
  return match;
}

interface OtpauthUriParams {
  secret: string;
  accountName: string;
  issuer: string;
  digits?: number;
  period?: number;
}

/**
 * Build an `otpauth://` provisioning URI per the Google Authenticator
 * key URI format. Render this as a QR code in the enrolment UI.
 */
export function buildOtpauthUri(params: OtpauthUriParams): string {
  const { secret, accountName, issuer, digits = 6, period = 30 } = params;
  // Per the Google Authenticator key URI format the label is
  // "Issuer:AccountName" with each component percent-encoded *separately*
  // and joined by a literal colon. We hand-encode the query string too so
  // spaces become %20 (URLSearchParams would emit `+`, which authenticator
  // apps generally accept but which deviates from the spec example).
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params2: Record<string, string> = {
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(digits),
    period: String(period),
  };
  const query = Object.entries(params2)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `otpauth://totp/${label}?${query}`;
}
