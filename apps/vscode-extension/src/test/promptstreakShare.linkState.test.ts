import * as assert from 'assert';

import {
  canUnlinkDevice,
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

  test('canUnlinkDevice stays enabled when auth has expired but token is already cleared', () => {
    assert.strictEqual(canUnlinkDevice(false, 'auth_required'), true);
    assert.strictEqual(canUnlinkDevice(false, 'failed:403'), true);
  });

  test('canUnlinkDevice is disabled only when no token exists and status is not auth-expired', () => {
    assert.strictEqual(canUnlinkDevice(false, undefined), false);
    assert.strictEqual(canUnlinkDevice(true, undefined), true);
  });
});
