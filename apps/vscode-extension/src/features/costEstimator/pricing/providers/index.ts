import { ProviderRateCard } from '../../types';
import { PROVIDER_SOURCES } from './sources';
import { SUBSCRIPTION_PROVIDER_RATE_CARDS } from './subscriptionQuota';
import { TOKEN_METERED_PROVIDER_RATE_CARDS } from './tokenMetered';
import { WRAPPER_PROVIDER_RATE_CARDS } from './wrappers';

export { PROVIDER_SOURCES } from './sources';
export { TOKEN_METERED_PROVIDER_RATE_CARDS } from './tokenMetered';
export { SUBSCRIPTION_PROVIDER_RATE_CARDS } from './subscriptionQuota';
export { WRAPPER_PROVIDER_RATE_CARDS } from './wrappers';

export const PROVIDER_RATE_CARDS: ProviderRateCard[] = [
  ...TOKEN_METERED_PROVIDER_RATE_CARDS,
  ...SUBSCRIPTION_PROVIDER_RATE_CARDS,
  ...WRAPPER_PROVIDER_RATE_CARDS,
];

export const PROVIDER_RATE_CARD_BY_ID: Record<string, ProviderRateCard> = PROVIDER_RATE_CARDS
  .reduce<Record<string, ProviderRateCard>>((acc, card) => {
    acc[card.productId] = card;
    return acc;
  }, {});

export function providerCatalogSnapshotDate(): string {
  let latest = 0;
  for (const card of PROVIDER_RATE_CARDS) {
    const ts = card.lastCheckedAt ? Date.parse(card.lastCheckedAt) : Number.NaN;
    if (Number.isFinite(ts) && ts > latest) {
      latest = ts;
    }
  }
  return latest > 0 ? new Date(latest).toISOString().slice(0, 10) : 'unknown';
}

export function providerCatalogHasManualReviewRows(): boolean {
  return PROVIDER_RATE_CARDS.some(card => card.requiresManualReview === true);
}

export function providerSourceCount(): number {
  return Object.keys(PROVIDER_SOURCES).length;
}