import * as assert from 'assert';
import { MODEL_PRICING } from '../features/costEstimator/pricing/models';

suite('Cost Estimator: model pricing coverage', () => {
  test('includes expanded model set from GitHub pricing reference', () => {
    // OpenAI
    assert.ok(MODEL_PRICING['gpt-4.1']);
    assert.ok(MODEL_PRICING['gpt-5-mini']);
    assert.ok(MODEL_PRICING['gpt-5.2']);
    assert.ok(MODEL_PRICING['gpt-5.2-codex']);
    assert.ok(MODEL_PRICING['gpt-5.3-codex']);
    assert.ok(MODEL_PRICING['gpt-5.4']);
    assert.ok(MODEL_PRICING['gpt-5.4-mini']);
    assert.ok(MODEL_PRICING['gpt-5.4-nano']);
    assert.ok(MODEL_PRICING['gpt-5.5']);

    // Anthropic
    assert.ok(MODEL_PRICING['claude-haiku-4.5']);
    assert.ok(MODEL_PRICING['claude-sonnet-4']);
    assert.ok(MODEL_PRICING['claude-sonnet-4.5']);
    assert.ok(MODEL_PRICING['claude-sonnet-4.6']);
    assert.ok(MODEL_PRICING['claude-opus-4.5']);
    assert.ok(MODEL_PRICING['claude-opus-4.6']);
    assert.ok(MODEL_PRICING['claude-opus-4.7']);

    // Google / xAI / GitHub fine-tuned
    assert.ok(MODEL_PRICING['gemini-2.5-pro']);
    assert.ok(MODEL_PRICING['gemini-3-flash']);
    assert.ok(MODEL_PRICING['gemini-3.1-pro']);
    assert.ok(MODEL_PRICING['grok-code-fast-1']);
    assert.ok(MODEL_PRICING['raptor-mini']);
    assert.ok(MODEL_PRICING['goldeneye']);
  });

  test('contains at least 20 billable model entries', () => {
    assert.ok(Object.keys(MODEL_PRICING).length >= 20);
  });
});
