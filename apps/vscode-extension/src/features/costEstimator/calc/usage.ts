/** Build a UsageEstimate by aggregating RequestEvent[] over a date range and
 *  normalizing observed tokens to a 30-day monthly projection. */

import { RequestEvent } from '../../../core/types';
import { CostRangeKey, UsageEstimate } from '../types';
import { ESTIMATION_MONTH_DAYS } from '../pricing/metadata';

const DAY_MS = 86400000;

export interface RangeBounds {
  startMs: number;
  endMs: number;
  daysInRange: number;
  rangeLabel: string;
}

export function rangeBoundsFor(range: CostRangeKey, events: RequestEvent[], now = Date.now()): RangeBounds {
  switch (range) {
    case 'last_7_days':
      return { startMs: now - 7 * DAY_MS, endMs: now, daysInRange: 7, rangeLabel: 'Last 7 days' };
    case 'last_30_days':
      return { startMs: now - 30 * DAY_MS, endMs: now, daysInRange: 30, rangeLabel: 'Last 30 days' };
    case 'last_3_months':
      return { startMs: now - 90 * DAY_MS, endMs: now, daysInRange: 90, rangeLabel: 'Last 3 months' };
    case 'all_time': {
      let earliest: number | undefined;
      let latest: number | undefined;
      for (const e of events) {
        if (typeof e.timestampMs !== 'number') { continue; }
        if (earliest === undefined || e.timestampMs < earliest) {
          earliest = e.timestampMs;
        }
        if (latest === undefined || e.timestampMs > latest) {
          latest = e.timestampMs;
        }
      }

      if (earliest === undefined || latest === undefined) {
        return { startMs: now, endMs: now, daysInRange: 1, rangeLabel: 'All time' };
      }

      // For all-time, use the observed dataset span (first event to last event),
      // not "first event to now".
      const days = Math.max(1, Math.ceil((latest - earliest) / DAY_MS));
      return { startMs: earliest, endMs: latest, daysInRange: days, rangeLabel: 'All time' };
    }
  }
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function buildUsageEstimate(
  events: RequestEvent[],
  range: CostRangeKey,
  now: number = Date.now(),
): UsageEstimate {
  const bounds = rangeBoundsFor(range, events, now);

  let observedInputTokens = 0;
  let observedOutputTokens = 0;
  let count = 0;

  for (const e of events) {
    if (typeof e.timestampMs !== 'number') { continue; }
    if (e.timestampMs < bounds.startMs || e.timestampMs > bounds.endMs) { continue; }
    observedInputTokens += e.promptTokens || 0;
    observedOutputTokens += e.outputTokens || 0;
    count++;
  }

  const days = Math.max(1, bounds.daysInRange);
  const scale = ESTIMATION_MONTH_DAYS / days;

  return {
    rangeLabel: bounds.rangeLabel,
    rangeStart: isoDate(bounds.startMs),
    rangeEnd: isoDate(bounds.endMs),
    daysInRange: bounds.daysInRange,

    observedInputTokens,
    observedOutputTokens,
    observedCachedInputTokens: undefined,
    observedCacheWriteTokens: undefined,

    monthlyInputTokens: Math.round(observedInputTokens * scale),
    monthlyOutputTokens: Math.round(observedOutputTokens * scale),
    monthlyCachedInputTokens: undefined,
    monthlyCacheWriteTokens: undefined,

    dataCompleteness: count === 0 ? 'missing_cache_data' : 'partial',
  };
}
