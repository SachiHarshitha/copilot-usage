import * as assert from 'assert';

import {
  deriveDeviceLinkState,
  isAuthExpiredLinkStatus,
} from '../features/promptstreakShare/linkState';

suite('PromptStreak Share: link state', () => {
  test('treats 401 sync status as expired auth', () => {
    assert.strictEqual(isAuthExpiredLinkStatus('failed:401'), true);
  });

  test('treats 403 sync status as expired auth', () => {
    assert.strictEqual(isAuthExpiredLinkStatus('failed:403'), true);
  });

  test('keeps linked state when token exists and status is non-auth failure', () => {
    const state = deriveDeviceLinkState({
      hasToken: true,
      lastSyncStatus: 'failed:500',
    });

    assert.strictEqual(state.linked, true);
    assert.strictEqual(state.disableRelinkActions, true);
    assert.strictEqual(state.statusLabel, 'Linked');
  });

  test('forces relink path when auth is expired even if token still exists', () => {
    const state = deriveDeviceLinkState({
      hasToken: true,
      lastSyncStatus: 'failed:401',
    });

    assert.strictEqual(state.linked, false);
    assert.strictEqual(state.disableRelinkActions, false);
    assert.strictEqual(state.statusLabel, 'Link expired');
  });

  test('shows not linked when no token exists', () => {
    const state = deriveDeviceLinkState({
      hasToken: false,
      lastSyncStatus: undefined,
    });

    assert.strictEqual(state.linked, false);
    assert.strictEqual(state.disableRelinkActions, false);
    assert.strictEqual(state.statusLabel, 'Not linked');
  });
});
