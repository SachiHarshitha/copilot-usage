import * as assert from 'assert';
import { resolveCopilotDebugLogEnabled } from '../core/copilotDebugLogState';

suite('Copilot debug-log setting resolution', () => {
  test('uses canonical value when canonical setting is supported', () => {
    assert.strictEqual(resolveCopilotDebugLogEnabled(true, false, true), false);
    assert.strictEqual(resolveCopilotDebugLogEnabled(true, true, false), true);
  });

  test('falls back to legacy value when canonical setting is not supported', () => {
    assert.strictEqual(resolveCopilotDebugLogEnabled(false, false, true), true);
    assert.strictEqual(resolveCopilotDebugLogEnabled(false, false, false), false);
  });
});
