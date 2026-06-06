import * as assert from 'assert';

import { shouldInvalidateLinkForAuthFailure } from '../features/promptstreakShare/sync';

suite('PromptStreak Share: sync auth', () => {
  test('invalidates only on 401 when failing token still matches the active token', () => {
    assert.strictEqual(
      shouldInvalidateLinkForAuthFailure('tokenA.secretA', 'tokenA.secretA', 401),
      true,
    );
    assert.strictEqual(
      shouldInvalidateLinkForAuthFailure('tokenA.secretA', 'tokenA.secretA', 403),
      false,
    );
  });

  test('does not invalidate when link has already rotated to a newer token', () => {
    assert.strictEqual(
      shouldInvalidateLinkForAuthFailure('tokenB.secretB', 'tokenA.secretA', 401),
      false,
    );
  });

  test('does not invalidate when no active token is stored', () => {
    assert.strictEqual(
      shouldInvalidateLinkForAuthFailure(undefined, 'tokenA.secretA', 401),
      false,
    );
  });

  test('compares tokens after trimming whitespace', () => {
    assert.strictEqual(
      shouldInvalidateLinkForAuthFailure('  tokenA.secretA  ', 'tokenA.secretA', 401),
      true,
    );
  });
});
