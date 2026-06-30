import * as assert from 'assert';
import {
  getMultiplier,
  MULTIPLIER_REBASE_CUTOFF_MS,
  MODEL_MULTIPLIERS_PRE_2026_06,
  MODEL_MULTIPLIERS_2026_06,
} from '../core/config';

suite('Date-versioned model multipliers', () => {
  const beforeCutoff = MULTIPLIER_REBASE_CUTOFF_MS - 1;
  const afterCutoff = MULTIPLIER_REBASE_CUTOFF_MS;

  test('uses pre-cutoff (original) scale for events before 2026-06-01', () => {
    assert.strictEqual(getMultiplier('copilot/gpt-5.5', beforeCutoff), 7.5);
    assert.strictEqual(getMultiplier('copilot/claude-sonnet-4.6', beforeCutoff), 1.0);
    assert.strictEqual(getMultiplier('copilot/gpt-5-mini', beforeCutoff), 0.0);
    assert.strictEqual(getMultiplier('copilot/claude-opus-4.7', beforeCutoff), 15.0);
  });

  test('uses rebased scale for events on/after 2026-06-01', () => {
    assert.strictEqual(getMultiplier('copilot/gpt-5.5', afterCutoff), 57.0);
    assert.strictEqual(getMultiplier('copilot/claude-sonnet-4.6', afterCutoff), 9.0);
    assert.strictEqual(getMultiplier('copilot/gpt-5-mini', afterCutoff), 0.33);
    assert.strictEqual(getMultiplier('copilot/claude-opus-4.7', afterCutoff), 27.0);
    assert.strictEqual(getMultiplier('copilot/claude-opus-4.8', afterCutoff), 27.0);
  });

  test('undefined timestamp defaults to current (rebased) era', () => {
    assert.strictEqual(getMultiplier('copilot/gpt-5.5'), 57.0);
    assert.strictEqual(getMultiplier('copilot/gpt-5.5', undefined), 57.0);
  });

  test('unknown models default to 1.0 in both eras', () => {
    assert.strictEqual(getMultiplier('copilot/does-not-exist', beforeCutoff), 1.0);
    assert.strictEqual(getMultiplier('copilot/does-not-exist', afterCutoff), 1.0);
  });

  test('auto-mode is 0 in both eras (discount applied separately)', () => {
    assert.strictEqual(MODEL_MULTIPLIERS_PRE_2026_06['copilot/auto'], 0.0);
    assert.strictEqual(MODEL_MULTIPLIERS_2026_06['copilot/auto'], 0.0);
  });
});
