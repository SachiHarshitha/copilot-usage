/** Compare last 30 days monthly estimate vs ~3 month average. */

import { RequestEvent } from '../../../core/types';
import { TrendInsight } from '../types';

const DAY_MS = 86400000;

function tokensInWindow(events: RequestEvent[], startMs: number, endMs: number): number {
  let total = 0;
  for (const e of events) {
    if (typeof e.timestampMs !== 'number') { continue; }
    if (e.timestampMs < startMs || e.timestampMs > endMs) { continue; }
    total += (e.promptTokens || 0) + (e.outputTokens || 0);
  }
  return total;
}

export function computeTrendInsight(events: RequestEvent[], now: number = Date.now()): TrendInsight | null {
  // Need at least 30 days of data for the 3-month window to be meaningful.
  let earliest = now;
  for (const e of events) {
    if (typeof e.timestampMs === 'number' && e.timestampMs < earliest) { earliest = e.timestampMs; }
  }
  const daysCovered = (now - earliest) / DAY_MS;
  if (daysCovered < 30) { return null; }

  const recent30 = tokensInWindow(events, now - 30 * DAY_MS, now);
  const last90 = tokensInWindow(events, now - 90 * DAY_MS, now);
  if (last90 === 0) { return null; }

  const recentMonthly = recent30;          // already 30 days
  const longTermMonthly = last90 / 3;      // 90-day average per month
  if (longTermMonthly === 0) { return null; }

  const deltaPct = ((recentMonthly - longTermMonthly) / longTermMonthly) * 100;
  const rounded = Math.round(deltaPct);

  const label = rounded >= 0
    ? `Your last 30 days are ${rounded}% higher than your 3-month average.`
    : `Your last 30 days are ${Math.abs(rounded)}% lower than your 3-month average.`;

  return { label, deltaPct: rounded };
}
