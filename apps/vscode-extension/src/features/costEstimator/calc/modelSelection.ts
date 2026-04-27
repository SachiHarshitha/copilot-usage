/** Model selection helpers for Cost Estimator.
 *  Chooses the most-used billable model from current request events. */

import { RequestEvent } from '../../../core/types';
import { CostRangeKey } from '../types';
import { rangeBoundsFor } from './usage';

interface ModelAggregate {
  requests: number;
  totalTokens: number;
}

const MODEL_ALIASES: Record<string, string> = {
  'gpt-5-2': 'gpt-5.2',
  'gpt-5-4': 'gpt-5.4',
};

export function normalizeModelId(raw: string): string {
  let modelId = raw.trim().toLowerCase();
  modelId = modelId.replace(/^copilot\//, '');
  modelId = modelId.replace(/[\s_]+/g, '-');
  modelId = modelId.replace(/(?<=-\d+)-(\d+)$/, '.$1');
  return MODEL_ALIASES[modelId] || modelId;
}

export function filterEventsByCostRange(
  events: RequestEvent[],
  range: CostRangeKey,
  now: number = Date.now(),
): RequestEvent[] {
  const bounds = rangeBoundsFor(range, events, now);
  return events.filter(e => typeof e.timestampMs === 'number' && e.timestampMs >= bounds.startMs && e.timestampMs <= bounds.endMs);
}

export function pickMostUsedModelId(
  events: RequestEvent[],
  availableModelIds: string[],
): string | undefined {
  const available = new Set(availableModelIds.map(m => m.toLowerCase()));
  const stats = new Map<string, ModelAggregate>();

  for (const e of events) {
    if (!e.modelId) { continue; }
    const modelId = normalizeModelId(e.modelId);
    if (!available.has(modelId)) { continue; }

    const existing = stats.get(modelId) || { requests: 0, totalTokens: 0 };
    existing.requests += 1;
    existing.totalTokens += (e.promptTokens || 0) + (e.outputTokens || 0);
    stats.set(modelId, existing);
  }

  let bestModelId: string | undefined;
  let bestRequests = -1;
  let bestTokens = -1;

  for (const [modelId, aggregate] of stats) {
    if (aggregate.requests > bestRequests || (aggregate.requests === bestRequests && aggregate.totalTokens > bestTokens)) {
      bestModelId = modelId;
      bestRequests = aggregate.requests;
      bestTokens = aggregate.totalTokens;
    }
  }

  return bestModelId;
}
