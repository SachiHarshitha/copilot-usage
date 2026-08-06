import * as assert from 'assert';
import { MODEL_PRICING, MODEL_PRICING_LIST } from '../features/costEstimator/pricing/models';

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

  test('includes newly added models', () => {
    assert.ok(MODEL_PRICING['claude-opus-4.8']);
    assert.ok(MODEL_PRICING['claude-opus-4.8-fast']);
    assert.ok(MODEL_PRICING['claude-fable-5']);
    assert.ok(MODEL_PRICING['gemini-3.5-flash']);
    assert.ok(MODEL_PRICING['mai-code-1-flash']);

    // New Microsoft provider
    assert.strictEqual(MODEL_PRICING['mai-code-1-flash'].provider, 'Microsoft');
  });

  test('covers the 2026-08-06 pricing table additions', () => {
    // GPT-5.6 family — the first OpenAI models with a cache write cost.
    for (const id of ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']) {
      assert.ok(MODEL_PRICING[id], `${id} missing`);
      assert.ok(MODEL_PRICING[id].cacheWritePerMillion, `${id} should price cache writes`);
    }

    assert.strictEqual(MODEL_PRICING['gpt-5.6-luna'].outputPerMillion, 1.2);
    assert.strictEqual(MODEL_PRICING['gpt-5.6-terra'].outputPerMillion, 12);
    assert.strictEqual(MODEL_PRICING['gpt-5.6-sol'].outputPerMillion, 30);

    assert.strictEqual(MODEL_PRICING['claude-opus-5'].outputPerMillion, 25);
    assert.strictEqual(MODEL_PRICING['claude-sonnet-5'].inputPerMillion, 2);
    assert.strictEqual(MODEL_PRICING['gemini-3.6-flash'].outputPerMillion, 7.5);
    assert.strictEqual(MODEL_PRICING['grok-4.5'].outputPerMillion, 6);

    // New Moonshot AI provider
    assert.strictEqual(MODEL_PRICING['kimi-k2.7-code'].provider, 'Moonshot AI');
    assert.strictEqual(MODEL_PRICING['kimi-k2.7-code'].outputPerMillion, 4);
  });

  test('Claude Sonnet 4 is still listed as GA by GitHub', () => {
    assert.strictEqual(MODEL_PRICING['claude-sonnet-4'].releaseStatus, 'GA');
    assert.strictEqual(MODEL_PRICING['claude-sonnet-4'].retiredDate, undefined);
  });

  test('marks retired models with status, date, and (where known) successor', () => {
    const retired: Record<string, string | undefined> = {
      'gpt-4.1': 'gpt-5.5',
      'gpt-5.2': 'gpt-5.5',
      'gpt-5.2-codex': 'gpt-5.3-codex',
      'grok-code-fast-1': 'gpt-5-mini',
      'gemini-2.5-pro': 'gemini-3.1-pro',
      'gemini-3-flash': 'gemini-3.5-flash',
      'goldeneye': undefined,
    };
    for (const [id, successor] of Object.entries(retired)) {
      assert.strictEqual(MODEL_PRICING[id].releaseStatus, 'Retired', `${id} should be Retired`);
      assert.ok(MODEL_PRICING[id].retiredDate, `${id} should have a retiredDate`);
      if (successor) {
        assert.strictEqual(MODEL_PRICING[id].successorId, successor, `${id} successor`);
      }
    }
  });

  test('raptor-mini is GA', () => {
    assert.strictEqual(MODEL_PRICING['raptor-mini'].releaseStatus, 'GA');
  });

  test('MODEL_PRICING_LIST sorts retired models last', () => {
    const firstRetiredIndex = MODEL_PRICING_LIST.findIndex(m => m.releaseStatus === 'Retired');
    const lastActiveIndex = MODEL_PRICING_LIST.map(m => m.releaseStatus !== 'Retired')
      .lastIndexOf(true);
    assert.ok(firstRetiredIndex > lastActiveIndex, 'all active models should precede retired ones');
  });

  test('contains at least 20 billable model entries', () => {
    assert.ok(Object.keys(MODEL_PRICING).length >= 20);
  });
});
