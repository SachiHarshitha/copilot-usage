import * as assert from 'assert';

import {
  decodePromptstreakLinkCallback,
  PROMPTSTREAK_LINK_PATH,
} from '../features/promptstreakShare/linkCallback';

const VALID_TOKEN = 'abcdefghijklmnop.abcdefghijklmnopqrstuvwxyz';

suite('PromptStreak Share: uri handler', () => {
  test('ignores callbacks for unrelated paths', () => {
    const uri = {
      path: '/not-ours',
      query: `state=abc&deviceToken=${encodeURIComponent(VALID_TOKEN)}`,
    };
    const result = decodePromptstreakLinkCallback(uri, 'abc');

    assert.deepStrictEqual(result, { type: 'ignore' });
  });

  test('accepts callback when state matches and token is valid', () => {
    const uri = {
      path: PROMPTSTREAK_LINK_PATH,
      query: `state=abc&deviceToken=${encodeURIComponent(VALID_TOKEN)}`,
    };
    const result = decodePromptstreakLinkCallback(uri, 'abc');

    assert.deepStrictEqual(result, {
      type: 'link',
      token: VALID_TOKEN,
      clearPendingState: true,
      requireUserConfirmation: false,
    });
  });

  test('allows guarded fallback when no pending state exists but token is valid', () => {
    const uri = {
      path: PROMPTSTREAK_LINK_PATH,
      query: `state=abc&deviceToken=${encodeURIComponent(VALID_TOKEN)}`,
    };
    const result = decodePromptstreakLinkCallback(uri, undefined);

    assert.deepStrictEqual(result, {
      type: 'link',
      token: VALID_TOKEN,
      clearPendingState: false,
      requireUserConfirmation: true,
      warning:
        'PromptStreak callback arrived without a pending state in this window. Link this device anyway?',
    });
  });

  test('rejects callbacks with mismatched state', () => {
    const uri = {
      path: PROMPTSTREAK_LINK_PATH,
      query: `state=wrong&deviceToken=${encodeURIComponent(VALID_TOKEN)}`,
    };
    const result = decodePromptstreakLinkCallback(uri, 'expected');

    assert.deepStrictEqual(result, {
      type: 'reject',
      clearPendingState: false,
      message: 'PromptStreak link callback state is invalid or expired.',
    });
  });

  test('rejects callbacks with malformed token payload', () => {
    const uri = {
      path: PROMPTSTREAK_LINK_PATH,
      query: 'state=abc&deviceToken=bad-token',
    };
    const result = decodePromptstreakLinkCallback(uri, 'abc');

    assert.deepStrictEqual(result, {
      type: 'reject',
      clearPendingState: false,
      message: 'PromptStreak link callback did not include a valid device token.',
    });
  });

  test('returns callback error and clears pending state when state matches', () => {
    const uri = {
      path: PROMPTSTREAK_LINK_PATH,
      query: 'state=abc&error=denied',
    };
    const result = decodePromptstreakLinkCallback(uri, 'abc');

    assert.deepStrictEqual(result, {
      type: 'reject',
      clearPendingState: true,
      message: 'PromptStreak link failed: denied',
    });
  });
});
