import { RequestEvent } from '../../../core/types';
import { ModelProvider, CostRangeKey } from '../types';
import { MODEL_PRICING } from '../pricing/models';
import { ESTIMATION_MONTH_DAYS, PRICING_METADATA } from '../pricing/metadata';
import { normalizeModelId } from './modelSelection';
import { rangeBoundsFor } from './usage';

interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  share: number;
}

export interface ModelMonthlyUsageEntry {
  modelId: string;
  provider: ModelProvider;
  category: import('../types').ModelCategory;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderModelCostContext {
  monthlyUsd: number;
  monthlyCredits: number;
  knownModelCoveragePct: number;
  providerMonthlyUsage: Partial<Record<ModelProvider, ProviderUsage>>;
  modelMonthlyUsage: ModelMonthlyUsageEntry[];
  totalMonthlyInputTokens: number;
  totalMonthlyOutputTokens: number;
}

interface ModelBucket {
  provider: ModelProvider;
  observedInputTokens: number;
  observedOutputTokens: number;
}

export function buildProviderModelCostContext(
  events: RequestEvent[],
  range: CostRangeKey,
  now: number = Date.now(),
): ProviderModelCostContext | undefined {
  const bounds = rangeBoundsFor(range, events, now);

  let observedTotalTokens = 0;
  let observedKnownTokens = 0;

  const byModel = new Map<string, ModelBucket>();

  for (const e of events) {
    if (typeof e.timestampMs !== 'number') {
      continue;
    }
    if (e.timestampMs < bounds.startMs || e.timestampMs > bounds.endMs) {
      continue;
    }

    const promptTokens = e.promptTokens || 0;
    const outputTokens = e.outputTokens || 0;
    const totalTokens = promptTokens + outputTokens;
    observedTotalTokens += totalTokens;

    if (!e.modelId) {
      continue;
    }

    const modelId = normalizeModelId(e.modelId);
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) {
      continue;
    }

    observedKnownTokens += totalTokens;

    const bucket = byModel.get(modelId) ?? {
      provider: pricing.provider,
      observedInputTokens: 0,
      observedOutputTokens: 0,
    };

    bucket.observedInputTokens += promptTokens;
    bucket.observedOutputTokens += outputTokens;
    byModel.set(modelId, bucket);
  }

  if (byModel.size === 0) {
    return undefined;
  }

  const scale = ESTIMATION_MONTH_DAYS / Math.max(1, bounds.daysInRange);

  let monthlyUsd = 0;
  const providerTotals: Partial<Record<ModelProvider, { input: number; output: number; total: number }>> = {};
  const modelMonthlyUsage: ModelMonthlyUsageEntry[] = [];
  let totalMonthlyInputTokens = 0;
  let totalMonthlyOutputTokens = 0;

  for (const [modelId, bucket] of byModel) {
    const pricing = MODEL_PRICING[modelId];
    if (!pricing) {
      continue;
    }

    const monthlyInput = Math.round(bucket.observedInputTokens * scale);
    const monthlyOutput = Math.round(bucket.observedOutputTokens * scale);

    monthlyUsd += ((monthlyInput / PRICING_METADATA.perTokenUnit) * pricing.inputPerMillion)
      + ((monthlyOutput / PRICING_METADATA.perTokenUnit) * pricing.outputPerMillion);

    const providerTotal = providerTotals[bucket.provider] ?? { input: 0, output: 0, total: 0 };
    providerTotal.input += monthlyInput;
    providerTotal.output += monthlyOutput;
    providerTotal.total += monthlyInput + monthlyOutput;
    providerTotals[bucket.provider] = providerTotal;

    modelMonthlyUsage.push({
      modelId,
      provider: pricing.provider,
      category: pricing.category,
      inputTokens: monthlyInput,
      outputTokens: monthlyOutput,
    });

    totalMonthlyInputTokens += monthlyInput;
    totalMonthlyOutputTokens += monthlyOutput;
  }

  const monthlyRoundedUsd = roundUsd(monthlyUsd);
  const monthlyCredits = Math.ceil(monthlyRoundedUsd / PRICING_METADATA.aiCreditUsdValue);

  const knownCoverage = observedTotalTokens > 0
    ? (observedKnownTokens / observedTotalTokens) * 100
    : 0;

  let knownMonthlyTokens = 0;
  for (const providerTotal of Object.values(providerTotals)) {
    if (!providerTotal) {
      continue;
    }
    knownMonthlyTokens += providerTotal.total;
  }

  const providerMonthlyUsage: ProviderModelCostContext['providerMonthlyUsage'] = {};
  for (const [provider, providerTotal] of Object.entries(providerTotals) as Array<[ModelProvider, { input: number; output: number; total: number }]>) {
    providerMonthlyUsage[provider] = {
      inputTokens: providerTotal.input,
      outputTokens: providerTotal.output,
      totalTokens: providerTotal.total,
      share: knownMonthlyTokens > 0 ? providerTotal.total / knownMonthlyTokens : 0,
    };
  }

  return {
    monthlyUsd: monthlyRoundedUsd,
    monthlyCredits,
    knownModelCoveragePct: roundPct(knownCoverage),
    providerMonthlyUsage,
    modelMonthlyUsage,
    totalMonthlyInputTokens,
    totalMonthlyOutputTokens,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}
