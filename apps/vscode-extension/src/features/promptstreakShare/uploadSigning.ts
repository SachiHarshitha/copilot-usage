/** Upload request signing helpers for PromptStreak ingestion. */

import { createHash, createHmac, randomBytes } from 'crypto';

export const SIGNATURE_VERSION = 'v1';
export const HEADER_UPLOAD_TIMESTAMP = 'x-upload-timestamp';
export const HEADER_UPLOAD_NONCE = 'x-upload-nonce';
export const HEADER_UPLOAD_SIGNATURE = 'x-upload-signature';
export const HEADER_UPLOAD_BODY_HASH = 'x-upload-body-hash';

export interface SignedUploadHeaderInput {
  deviceToken: string;
  rawBody: string;
  timestampMs?: number;
  nonce?: string;
}

function getDeviceSecret(deviceToken: string): string | null {
  const dot = deviceToken.indexOf('.');
  if (dot <= 0 || dot >= deviceToken.length - 1) {
    return null;
  }

  return deviceToken.slice(dot + 1);
}

export function buildSignedUploadHeaders(
  input: SignedUploadHeaderInput,
): Record<string, string> | null {
  const secret = getDeviceSecret(input.deviceToken);
  if (!secret) {
    return null;
  }

  const timestamp = String(input.timestampMs ?? Date.now());
  const nonce = input.nonce ?? randomBytes(16).toString('base64url');
  const bodyHash = createHash('sha256').update(input.rawBody, 'utf8').digest('hex');
  const signingInput = `${SIGNATURE_VERSION}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = createHmac('sha256', secret).update(signingInput, 'utf8').digest('hex');

  return {
    [HEADER_UPLOAD_TIMESTAMP]: timestamp,
    [HEADER_UPLOAD_NONCE]: nonce,
    [HEADER_UPLOAD_BODY_HASH]: bodyHash,
    [HEADER_UPLOAD_SIGNATURE]: signature,
  };
}
