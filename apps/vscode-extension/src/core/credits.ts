/** Credit accounting for Copilot usage.
 *
 *  GitHub Copilot meters usage in "AI credits" where 1 credit = $0.01 of token
 *  cost. The real per-token credit rates ship with the user's account in the
 *  Copilot Chat catalog (`models.json` → `billing.token_prices`), whose
 *  `input_price` / `output_price` values are already denominated in credits per
 *  1,000,000 tokens. We use those real rates when available and fall back to the
 *  maintained MODEL_PRICING table (USD × 100) otherwise.
 *
 *  The session logs record only the total prompt-token count (not the
 *  cached/uncached split), so prompt tokens are priced at the standard input
 *  rate — a slightly conservative approximation. */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MODEL_PRICING } from '../features/costEstimator/pricing/models';
import { normalizeModelId } from '../features/costEstimator/calc/modelSelection';
import { getWorkspaceStorageRoot } from './discovery';

/** USD value of a single AI credit. */
export const AI_CREDIT_USD_VALUE = 0.01;

const TOKENS_PER_UNIT = 1_000_000;

/** Per-model credit rates, in credits per 1,000,000 tokens. */
export interface CreditRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

/** Map of normalized model id → credit rate. */
export type CreditRateMap = Map<string, CreditRate>;

/** Fallback rate derived from the maintained MODEL_PRICING table (USD → credits). */
export function fallbackRateFor(modelId: string): CreditRate | undefined {
  const pricing = MODEL_PRICING[normalizeModelId(modelId)];
  if (!pricing) { return undefined; }
  return {
    inputPerMillion: pricing.inputPerMillion / AI_CREDIT_USD_VALUE,
    outputPerMillion: pricing.outputPerMillion / AI_CREDIT_USD_VALUE,
  };
}

/** Credits consumed by a single request. Returns 0 when the model is unknown. */
export function creditsForRequest(
  modelId: string | undefined,
  inputTokens: number,
  outputTokens: number,
  rates?: CreditRateMap,
): number {
  if (!modelId) { return 0; }
  const rate = rates?.get(normalizeModelId(modelId)) ?? fallbackRateFor(modelId);
  if (!rate) { return 0; }
  return (inputTokens / TOKENS_PER_UNIT) * rate.inputPerMillion
       + (outputTokens / TOKENS_PER_UNIT) * rate.outputPerMillion;
}

interface CatalogEntry {
  id?: string;
  capabilities?: { family?: string };
  billing?: {
    token_prices?: {
      default?: { input_price?: number; output_price?: number };
    };
  };
}

/** Parse a Copilot `models.json` catalog into a credit-rate map. */
export function parseCreditRatesFromCatalog(raw: string): CreditRateMap {
  const map: CreditRateMap = new Map();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!Array.isArray(data)) { return map; }

  for (const entry of data as CatalogEntry[]) {
    const prices = entry?.billing?.token_prices?.default;
    if (!prices) { continue; }
    const inputPerMillion = prices.input_price;
    const outputPerMillion = prices.output_price;
    if (typeof inputPerMillion !== 'number' || typeof outputPerMillion !== 'number') { continue; }

    const rate: CreditRate = { inputPerMillion, outputPerMillion };
    // Key by both the model id and its family so resolved ids and picker ids match.
    for (const key of [entry.id, entry.capabilities?.family]) {
      if (key) { map.set(normalizeModelId(key), rate); }
    }
  }
  return map;
}

/** Locate the most recently written `models.json` catalog across all workspaces. */
async function findNewestCatalog(storageRoot: string): Promise<string | undefined> {
  let workspaceDirs: string[];
  try {
    workspaceDirs = await fs.readdir(storageRoot);
  } catch {
    return undefined;
  }

  let newestPath: string | undefined;
  let newestMtime = -Infinity;

  for (const wsDir of workspaceDirs) {
    const logsDir = path.join(storageRoot, wsDir, 'GitHub.copilot-chat', 'debug-logs');
    let sessions: string[];
    try {
      sessions = await fs.readdir(logsDir);
    } catch {
      continue;
    }
    for (const session of sessions) {
      const candidate = path.join(logsDir, session, 'models.json');
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile() && stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
          newestPath = candidate;
        }
      } catch {
        // not present for this session
      }
    }
  }
  return newestPath;
}

/** Load real credit rates from the Copilot catalog; empty map when unavailable. */
export async function loadCreditRates(storageRoot?: string): Promise<CreditRateMap> {
  const root = storageRoot ?? getWorkspaceStorageRoot();
  const catalogPath = await findNewestCatalog(root);
  if (!catalogPath) { return new Map(); }
  try {
    const raw = await fs.readFile(catalogPath, 'utf-8');
    return parseCreditRatesFromCatalog(raw);
  } catch {
    return new Map();
  }
}
