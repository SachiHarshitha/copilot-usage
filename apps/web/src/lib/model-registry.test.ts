import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL_MULTIPLIERS,
  MODEL_REGISTRY,
  getMultiplier,
  getMultiplierFor,
  lookupModel,
} from '@copilot-usage/shared-schema';

test('legacy MODEL_MULTIPLIERS preserves all previously-known copilot/* keys with same values', () => {
  // Spot-check that the historical contract is preserved exactly.
  assert.equal(MODEL_MULTIPLIERS['copilot/gpt-4o'], 0.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/gpt-4o-mini'], 0.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/claude-opus-4.6'], 3.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/o3'], 3.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/o4-mini'], 1.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/gemini-2.5-pro'], 1.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/claude-sonnet-4-thinking'], 1.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/auto'], 0.0);
  assert.equal(MODEL_MULTIPLIERS['copilot/gpt-3.5-turbo'], 0.0);
});

test('getMultiplier returns 1.0 fallback for unknown ids', () => {
  assert.equal(getMultiplier('copilot/unknown-model'), 1.0);
  assert.equal(getMultiplier('not-even-prefixed'), 1.0);
});

test('getMultiplier matches MODEL_MULTIPLIERS for every legacy key', () => {
  for (const [key, value] of Object.entries(MODEL_MULTIPLIERS)) {
    assert.equal(getMultiplier(key), value, `mismatch for ${key}`);
  }
});

test('lookupModel resolves legacy copilot/* ids to canonical records', () => {
  const r = lookupModel({ modelId: 'copilot/claude-opus-4.6' });
  assert.ok(r);
  assert.equal(r?.provider, 'github');
  assert.equal(r?.product, 'copilot');
  assert.equal(r?.modelId, 'claude-opus-4.6');
  assert.equal(r?.multiplier, 3.0);
});

test('lookupModel resolves canonical (provider, product, modelId) triples', () => {
  const r = lookupModel({ provider: 'github', product: 'copilot', modelId: 'gpt-4o' });
  assert.ok(r);
  assert.equal(r?.legacyId, 'copilot/gpt-4o');
  assert.equal(r?.multiplier, 0.0);
});

test('lookupModel returns undefined for unknown models', () => {
  assert.equal(lookupModel({ modelId: 'totally-made-up' }), undefined);
});

test('getMultiplierFor falls back to 1.0 for unknown models', () => {
  assert.equal(
    getMultiplierFor({ provider: 'anthropic', product: 'claude-code', modelId: 'made-up' }),
    1.0
  );
});

test('MODEL_REGISTRY contains every legacy copilot model exactly once', () => {
  const legacyKeys = Object.keys(MODEL_MULTIPLIERS);
  for (const key of legacyKeys) {
    const matches = MODEL_REGISTRY.filter((r) => r.legacyId === key);
    assert.equal(matches.length, 1, `legacy id ${key} must appear exactly once in registry`);
  }
});
