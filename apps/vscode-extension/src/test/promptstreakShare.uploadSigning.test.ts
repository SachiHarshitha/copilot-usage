import * as assert from 'assert';
import { createHash, createHmac } from 'crypto';
import {
  buildSignedUploadHeaders,
  HEADER_UPLOAD_BODY_HASH,
  HEADER_UPLOAD_NONCE,
  HEADER_UPLOAD_SIGNATURE,
  HEADER_UPLOAD_TIMESTAMP,
  SIGNATURE_VERSION,
} from '../features/promptstreakShare/uploadSigning';

suite('PromptStreak Share: upload signing', () => {
  test('buildSignedUploadHeaders returns null for malformed device token', () => {
    const headers = buildSignedUploadHeaders({
      deviceToken: 'malformed-token-without-dot',
      rawBody: '{"ok":true}',
      timestampMs: 1700000000000,
      nonce: '0123456789abcdefghijkl',
    });

    assert.strictEqual(headers, null);
  });

  test('buildSignedUploadHeaders produces deterministic signature with fixed timestamp and nonce', () => {
    const deviceToken = 'tokenid.supersecret';
    const rawBody = '{"schemaVersion":2}';
    const timestamp = 1700000000000;
    const nonce = '0123456789abcdefghijkl';

    const headers = buildSignedUploadHeaders({
      deviceToken,
      rawBody,
      timestampMs: timestamp,
      nonce,
    });

    assert.ok(headers);

    const expectedBodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const signingInput = `${SIGNATURE_VERSION}\n${timestamp}\n${nonce}\n${expectedBodyHash}`;
    const expectedSignature = createHmac('sha256', 'supersecret')
      .update(signingInput, 'utf8')
      .digest('hex');

    assert.strictEqual(headers?.[HEADER_UPLOAD_TIMESTAMP], String(timestamp));
    assert.strictEqual(headers?.[HEADER_UPLOAD_NONCE], nonce);
    assert.strictEqual(headers?.[HEADER_UPLOAD_BODY_HASH], expectedBodyHash);
    assert.strictEqual(headers?.[HEADER_UPLOAD_SIGNATURE], expectedSignature);
  });

  test('buildSignedUploadHeaders generates a nonce when one is not provided', () => {
    const headers = buildSignedUploadHeaders({
      deviceToken: 'tokenid.supersecret',
      rawBody: '{"schemaVersion":2}',
      timestampMs: 1700000000000,
    });

    assert.ok(headers);
    assert.ok(typeof headers?.[HEADER_UPLOAD_NONCE] === 'string');
    assert.ok((headers?.[HEADER_UPLOAD_NONCE] || '').length >= 22);
  });
});
