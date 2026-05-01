import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const UPLOAD_PROXY_SECRET_HEADER = 'x-upload-proxy-secret';

interface UploadProxyEnv {
  NODE_ENV?: string;
  UPLOAD_INTERNAL_PROXY_SECRET?: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isTrustedUploadProxyRequest(
  headers: Headers,
  env: UploadProxyEnv = process.env
): boolean {
  if (env.NODE_ENV !== 'production') {
    return true;
  }

  const expectedSecret = (env.UPLOAD_INTERNAL_PROXY_SECRET || '').trim();
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = (headers.get(UPLOAD_PROXY_SECRET_HEADER) || '').trim();
  if (!providedSecret) {
    return false;
  }

  return safeEqual(providedSecret, expectedSecret);
}

export function getUploadClientIp(headers: Headers): string {
  // Trust only the reverse-proxy-normalized IP header.
  const realIp = (headers.get('x-real-ip') || '').trim();
  if (realIp && isIP(realIp)) {
    return realIp;
  }

  return 'unknown';
}