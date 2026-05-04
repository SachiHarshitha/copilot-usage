/**
 * Canonical (agent-agnostic) ingestion.
 *
 * Two layers:
 * - Pure aggregation (`aggregateCanonical`): given a normalized
 *   `AgentSnapshot`, produce write-ready rollups and fact rows. No I/O,
 *   fully unit-testable.
 * - Transactional writer (`writeCanonical`): given the aggregation result
 *   and an active Prisma transaction, upsert into the v2 tables
 *   (AgentRun, ModelUsageDaily, ActionUsageDaily, ProductStat,
 *   ProviderStat, ModelStat).
 */

import { Prisma } from '@prisma/client';

import type {
  AgentModelCall,
  AgentRun,
  AgentSnapshot,
} from '@copilot-usage/shared-schema';

// ---------- Aggregation -----------------------------------------------------

export interface ModelDailyRow {
  date: string; // YYYY-MM-DD
  provider: string;
  product: string;
  surface: string;
  modelId: string;
  repoIdentity: string | null;
  trustLevel: string;
  requestCount: number;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
  costMicros: bigint;
}

export interface ActionDailyRow {
  date: string;
  provider: string;
  product: string;
  surface: string;
  repoIdentity: string | null;
  actionType: string;
  count: number;
  filesTouched: number;
}

export interface RollupTotals {
  totalRequests: number;
  totalTokens: bigint;
  costMicros: bigint;
}

export interface CanonicalAggregation {
  source: AgentSnapshot['source'];
  runs: Array<{
    runExternalId: string;
    startedAt: Date | null;
    endedAt: Date | null;
    repoIdentity: string | null;
    trustLevel: string;
  }>;
  modelDaily: ModelDailyRow[];
  actionDaily: ActionDailyRow[];
  productTotals: Map<string, RollupTotals>; // key: provider|product
  providerTotals: Map<string, RollupTotals>; // key: provider
  modelTotals: Map<string, RollupTotals>; // key: provider|product|modelId
}

const ZERO: RollupTotals = {
  totalRequests: 0,
  totalTokens: BigInt(0),
  costMicros: BigInt(0),
};

function addTotals(map: Map<string, RollupTotals>, key: string, delta: RollupTotals) {
  const cur = map.get(key) ?? { ...ZERO };

  cur.totalRequests += delta.totalRequests;
  cur.totalTokens += delta.totalTokens;
  cur.costMicros += delta.costMicros;
  map.set(key, cur);
}

function dateOnly(iso: string | undefined, fallback: string): string {
  const src = iso ?? fallback;
  return src.slice(0, 10);
}

function repoIdentityOf(run: AgentRun): string | null {
  if (!run.repoRef) return null;
  if (run.repoRef.mode === 'github' && run.repoRef.githubRepo) {
    return `github:${run.repoRef.githubRepo}`;
  }
  if (run.repoRef.mode === 'alias' && run.repoRef.aliasLabel) {
    return `alias:${run.repoRef.aliasLabel}`;
  }
  return null;
}

function callTotals(call: AgentModelCall): RollupTotals {
  const inTok = BigInt(call.inputTokens ?? 0);
  const outTok = BigInt(call.outputTokens ?? 0);
  return {
    totalRequests: call.requestCount ?? 0,
    totalTokens: inTok + outTok,
    costMicros: BigInt(call.costMicros ?? 0),
  };
}

/**
 * Pure aggregation. Walks the snapshot and produces write-ready rows and
 * rollup totals keyed by canonical dimensions.
 */
export function aggregateCanonical(snapshot: AgentSnapshot): CanonicalAggregation {
  const { source, observedAt } = snapshot;
  const provider = source.provider;
  const product = source.product;
  const surface = source.surface;

  const result: CanonicalAggregation = {
    source,
    runs: [],
    modelDaily: [],
    actionDaily: [],
    productTotals: new Map(),
    providerTotals: new Map(),
    modelTotals: new Map(),
  };

  // ---- Runs (with modelCalls + actions) ----
  for (const run of snapshot.runs ?? []) {
    const repoIdentity = repoIdentityOf(run);
    result.runs.push({
      runExternalId: run.runId,
      startedAt: run.startedAt ? new Date(run.startedAt) : null,
      endedAt: run.endedAt ? new Date(run.endedAt) : null,
      repoIdentity,
      trustLevel: run.modelCalls?.[0]?.sourceOfTruth ?? 'observed',
    });

    const runDate = dateOnly(run.startedAt, observedAt);

    // Model calls → ModelUsageDaily + rollups
    const dailyByKey = new Map<string, ModelDailyRow>();
    for (const call of run.modelCalls ?? []) {
      const key = [runDate, call.modelId, repoIdentity ?? ''].join('|');
      const inTok = BigInt(call.inputTokens ?? 0);
      const outTok = BigInt(call.outputTokens ?? 0);
      const cur = dailyByKey.get(key) ?? {
        date: runDate,
        provider,
        product,
        surface,
        modelId: call.modelId,
        repoIdentity,
        trustLevel: call.sourceOfTruth,
        requestCount: 0,
        inputTokens: BigInt(0),
        outputTokens: BigInt(0),
        cacheReadTokens: BigInt(0),
        cacheWriteTokens: BigInt(0),
        costMicros: BigInt(0),
      };
      cur.requestCount += call.requestCount ?? 0;
      cur.inputTokens += inTok;
      cur.outputTokens += outTok;
      cur.cacheReadTokens += BigInt(call.cacheReadTokens ?? 0);
      cur.cacheWriteTokens += BigInt(call.cacheWriteTokens ?? 0);
      cur.costMicros += BigInt(call.costMicros ?? 0);
      dailyByKey.set(key, cur);

      const totals = callTotals(call);
      addTotals(result.productTotals, `${provider}|${product}`, totals);
      addTotals(result.providerTotals, provider, totals);
      addTotals(result.modelTotals, `${provider}|${product}|${call.modelId}`, totals);
    }
    result.modelDaily.push(...dailyByKey.values());

    // Actions → ActionUsageDaily
    const actionByKey = new Map<string, ActionDailyRow>();
    for (const action of run.actions ?? []) {
      const key = [runDate, action.type, repoIdentity ?? ''].join('|');
      const cur = actionByKey.get(key) ?? {
        date: runDate,
        provider,
        product,
        surface,
        repoIdentity,
        actionType: action.type,
        count: 0,
        filesTouched: 0,
      };
      cur.count += action.count ?? 0;
      cur.filesTouched += action.filesTouched ?? 0;
      actionByKey.set(key, cur);
    }
    result.actionDaily.push(...actionByKey.values());
  }

  // ---- Daily buckets (product-level aggregates, no modelId) ----
  // These contribute to ProductStat / ProviderStat only — not ModelStat or
  // ModelUsageDaily, since the modelId dimension isn't carried at this level.
  for (const bucket of snapshot.dailyBuckets ?? []) {
    const inTok = BigInt(bucket.inputTokens ?? 0);
    const outTok = BigInt(bucket.outputTokens ?? 0);
    const totals: RollupTotals = {
      totalRequests: bucket.requests ?? 0,
      totalTokens: inTok + outTok,
      costMicros: BigInt(bucket.costMicros ?? 0),
    };
    addTotals(result.productTotals, `${provider}|${product}`, totals);
    addTotals(result.providerTotals, provider, totals);
  }

  return result;
}

// ---------- Transactional writes -------------------------------------------

type Tx = Prisma.TransactionClient;

/**
 * Persist a canonical aggregation. Idempotent on `(userId, adapter, runExternalId)`
 * for AgentRun and on the dimensioned uniques for ModelUsageDaily / ActionUsageDaily.
 *
 * Rollup tables are upserted by overwriting with the **delta** added to the
 * existing row (since the snapshot represents incremental usage observed by
 * the adapter, not a full re-statement).
 */
export async function writeCanonical(
  tx: Tx,
  userId: string,
  deviceId: string,
  agg: CanonicalAggregation
): Promise<void> {
  const { source } = agg;
  const adapter = source.adapter;
  const provider = source.provider;
  const product = source.product;
  const surface = source.surface;

  // 1) AgentRun upserts
  for (const run of agg.runs) {
    await tx.agentRun.upsert({
      where: {
        userId_adapter_runExternalId: {
          userId,
          adapter,
          runExternalId: run.runExternalId,
        },
      },
      update: {
        provider,
        product,
        surface,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        repoIdentity: run.repoIdentity,
        trustLevel: run.trustLevel,
      },
      create: {
        userId,
        deviceId,
        adapter,
        provider,
        product,
        surface,
        runExternalId: run.runExternalId,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        repoIdentity: run.repoIdentity,
        trustLevel: run.trustLevel,
      },
    });
  }

  // 2) ModelUsageDaily upserts (overwrite — full daily restatement)
  for (const m of agg.modelDaily) {
    const date = new Date(m.date);
    const totalTokens = m.inputTokens + m.outputTokens;
    await tx.modelUsageDaily.upsert({
      where: {
        userId_deviceId_date_provider_product_surface_modelId_repoIdentity: {
          userId,
          deviceId,
          date,
          provider,
          product,
          surface,
          modelId: m.modelId,
          repoIdentity: m.repoIdentity ?? '',
        },
      },
      update: {
        trustLevel: m.trustLevel,
        requestCount: m.requestCount,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        totalTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
        costMicros: m.costMicros,
      },
      create: {
        userId,
        deviceId,
        date,
        provider,
        product,
        surface,
        modelId: m.modelId,
        repoIdentity: m.repoIdentity ?? '',
        trustLevel: m.trustLevel,
        requestCount: m.requestCount,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        totalTokens,
        cacheReadTokens: m.cacheReadTokens,
        cacheWriteTokens: m.cacheWriteTokens,
        costMicros: m.costMicros,
      },
    });
  }

  // 3) ActionUsageDaily upserts
  for (const a of agg.actionDaily) {
    const date = new Date(a.date);
    await tx.actionUsageDaily.upsert({
      where: {
        userId_deviceId_date_provider_product_surface_actionType_repoIdentity: {
          userId,
          deviceId,
          date,
          provider,
          product,
          surface,
          actionType: a.actionType,
          repoIdentity: a.repoIdentity ?? '',
        },
      },
      update: { count: a.count, filesTouched: a.filesTouched },
      create: {
        userId,
        deviceId,
        date,
        provider,
        product,
        surface,
        actionType: a.actionType,
        repoIdentity: a.repoIdentity ?? '',
        count: a.count,
        filesTouched: a.filesTouched,
      },
    });
  }

  // 4) ProductStat / ProviderStat / ModelStat — recompute from facts
  //    (idempotent; no double-counting on retried uploads).
  const now = new Date();
  for (const [key] of agg.productTotals) {
    const [pProvider, pProduct] = key.split('|');
    const facts = await tx.modelUsageDaily.aggregate({
      where: { userId, provider: pProvider, product: pProduct },
      _sum: { requestCount: true, totalTokens: true, costMicros: true, premiumRequests: true },
    });
    await tx.productStat.upsert({
      where: { userId_provider_product: { userId, provider: pProvider, product: pProduct } },
      update: {
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
      create: {
        userId,
        provider: pProvider,
        product: pProduct,
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
    });
  }

  for (const [pProvider] of agg.providerTotals) {
    const facts = await tx.modelUsageDaily.aggregate({
      where: { userId, provider: pProvider },
      _sum: { requestCount: true, totalTokens: true, costMicros: true, premiumRequests: true },
    });
    await tx.providerStat.upsert({
      where: { userId_provider: { userId, provider: pProvider } },
      update: {
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
      create: {
        userId,
        provider: pProvider,
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
    });
  }

  for (const [key] of agg.modelTotals) {
    const [mProvider, mProduct, mModelId] = key.split('|');
    const facts = await tx.modelUsageDaily.aggregate({
      where: { userId, provider: mProvider, product: mProduct, modelId: mModelId },
      _sum: { requestCount: true, totalTokens: true, costMicros: true, premiumRequests: true },
    });
    await tx.modelStat.upsert({
      where: {
        userId_provider_product_modelId: {
          userId,
          provider: mProvider,
          product: mProduct,
          modelId: mModelId,
        },
      },
      update: {
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
      create: {
        userId,
        provider: mProvider,
        product: mProduct,
        modelId: mModelId,
        totalRequests: facts._sum.requestCount ?? 0,
        totalTokens: facts._sum.totalTokens ?? BigInt(0),
        costMicros: facts._sum.costMicros ?? BigInt(0),
        premiumRequests: facts._sum.premiumRequests ?? 0,
        lastSyncedAt: now,
      },
    });
  }

}
