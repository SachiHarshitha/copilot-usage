/**
 * Provider-aware model registry.
 *
 * Two views over the same data:
 * - Legacy view: `MODEL_MULTIPLIERS` keyed by the `copilot/*` ID format used
 *   by the existing Copilot adapter. Kept unchanged for backward compat.
 * - Canonical view: `MODEL_REGISTRY` keyed by canonical model record
 *   (`provider`, `product`, `modelId`, `family`, `multiplier`). New adapters
 *   should populate provider/product on upload; the registry resolves to
 *   the same multiplier as the legacy table for `github/copilot` models.
 */

export interface ModelRecord {
  /** Canonical model identifier, e.g. "gpt-4o", "claude-sonnet-4.6". */
  modelId: string;
  /** Coarse family for grouping in UI (e.g. "gpt", "claude", "gemini", "o-series"). */
  family: string;
  /** Provider that hosts this model (e.g. "github", "anthropic", "openai"). */
  provider: string;
  /** Product that exposes this model to the user (e.g. "copilot", "claude-code"). */
  product: string;
  /**
   * Premium-request multiplier (Copilot semantics). For non-Copilot products
   * this defaults to 0 unless the adapter overrides on upload.
   */
  multiplier: number;
  /** Legacy ID used by older clients (e.g. "copilot/gpt-4o"). */
  legacyId?: string;
}

const COPILOT_RECORDS: ReadonlyArray<ModelRecord> = [
  // Included models on paid plans (multiplier 0)
  { modelId: 'gpt-4.1', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-4.1' },
  { modelId: 'gpt-4.1-mini', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-4.1-mini' },
  { modelId: 'gpt-4o', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-4o' },
  { modelId: 'gpt-4o-mini', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-4o-mini' },
  { modelId: 'claude-sonnet-4', family: 'claude', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/claude-sonnet-4' },
  { modelId: 'gemini-2.5-flash', family: 'gemini', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gemini-2.5-flash' },
  // Premium
  { modelId: 'claude-opus-4.6', family: 'claude', provider: 'github', product: 'copilot', multiplier: 3.0, legacyId: 'copilot/claude-opus-4.6' },
  { modelId: 'o3', family: 'o-series', provider: 'github', product: 'copilot', multiplier: 3.0, legacyId: 'copilot/o3' },
  { modelId: 'o4-mini', family: 'o-series', provider: 'github', product: 'copilot', multiplier: 1.0, legacyId: 'copilot/o4-mini' },
  { modelId: 'gemini-2.5-pro', family: 'gemini', provider: 'github', product: 'copilot', multiplier: 1.0, legacyId: 'copilot/gemini-2.5-pro' },
  { modelId: 'claude-sonnet-4-thinking', family: 'claude', provider: 'github', product: 'copilot', multiplier: 1.0, legacyId: 'copilot/claude-sonnet-4-thinking' },
  // Codex / newer
  { modelId: 'gpt-5.3-codex', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-5.3-codex' },
  { modelId: 'gpt-5.4', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-5.4' },
  { modelId: 'claude-sonnet-4.5', family: 'claude', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/claude-sonnet-4.5' },
  { modelId: 'claude-sonnet-4.6', family: 'claude', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/claude-sonnet-4.6' },
  { modelId: 'auto', family: 'auto', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/auto' },
  // Legacy / fallback
  { modelId: 'gpt-4', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-4' },
  { modelId: 'gpt-3.5-turbo', family: 'gpt', provider: 'github', product: 'copilot', multiplier: 0.0, legacyId: 'copilot/gpt-3.5-turbo' },
];

/** Canonical registry of all known models across providers/products. */
export const MODEL_REGISTRY: ReadonlyArray<ModelRecord> = [...COPILOT_RECORDS];

/**
 * Legacy multiplier map keyed by `copilot/*` model id.
 * Preserved for backward compatibility with existing extension/CLI imports.
 */
export const MODEL_MULTIPLIERS: Record<string, number> = Object.fromEntries(
  COPILOT_RECORDS.filter((r) => r.legacyId).map((r) => [r.legacyId as string, r.multiplier])
);

/** Legacy lookup by raw `copilot/*` id. Unknown ids fall back to 1.0. */
export function getMultiplier(modelId: string): number {
  return MODEL_MULTIPLIERS[modelId] ?? 1.0;
}

/**
 * Provider-aware lookup. Resolves a `(provider, product, modelId)` triple to a
 * canonical record, with fall-back to legacy `copilot/*` matching when
 * `provider`/`product` are omitted.
 */
export function lookupModel(args: {
  provider?: string;
  product?: string;
  modelId: string;
}): ModelRecord | undefined {
  const { provider, product, modelId } = args;

  const exact = MODEL_REGISTRY.find(
    (r) =>
      (provider === undefined || r.provider === provider) &&
      (product === undefined || r.product === product) &&
      r.modelId === modelId
  );
  if (exact) return exact;

  const legacy = MODEL_REGISTRY.find((r) => r.legacyId === modelId);
  if (legacy) return legacy;

  return undefined;
}

/**
 * Provider-aware multiplier. Falls back to 1.0 for unknown models so new
 * adapters never silently report 0 premium cost for an unrecognized model.
 */
export function getMultiplierFor(args: {
  provider?: string;
  product?: string;
  modelId: string;
}): number {
  return lookupModel(args)?.multiplier ?? 1.0;
}
