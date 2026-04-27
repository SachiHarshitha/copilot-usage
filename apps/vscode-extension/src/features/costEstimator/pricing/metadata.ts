/** Pricing metadata — mirrors spec §13.3. */

export const PRICING_METADATA = {
  sourceName: 'GitHub Copilot Models and Pricing',
  effectiveDate: '2026-06-01',
  lastVerified: '2026-04-27',
  currency: 'USD',
  perTokenUnit: 1_000_000,
  aiCreditUsdValue: 0.01,
  status: 'preview',
} as const;

/** Standard month length used to normalize range-based observations. */
export const ESTIMATION_MONTH_DAYS = 30;
