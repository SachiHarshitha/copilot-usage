import * as assert from 'assert';
import { PROVIDER_RATE_CARDS } from '../features/costEstimator/pricing/providers';

suite('Cost Estimator: provider catalog integrity', () => {
  test('provider product ids are unique', () => {
    const ids = PROVIDER_RATE_CARDS.map(card => card.productId);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length);
  });

  test('all rows include source metadata and freshness fields', () => {
    for (const card of PROVIDER_RATE_CARDS) {
      assert.ok(card.source.sourceUrl.startsWith('http'));
      assert.ok(card.lastCheckedAt);
      assert.ok((card.staleAfterDays ?? 0) > 0);
    }
  });

  test('subscription and quota billing rows never claim exact formula estimates', () => {
    const nonExactBilling = new Set([
      'subscription_allowance',
      'subscription_quota',
      'hybrid_subscription_usage',
      'seat_license',
      'credit_metered',
    ]);

    const offenders = PROVIDER_RATE_CARDS
      .filter(card => nonExactBilling.has(card.billingKind))
      .filter(card => card.estimateKind === 'exact_formula')
      .map(card => card.productId);

    assert.deepStrictEqual(offenders, []);
  });
});