// Model multiplier tables for legacy premium-request (request-based) billing.
// Source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests#model-multipliers
//
// GitHub moved to usage-based (AI credit) billing on 2026-06-01 and, at the same time,
// REBASED the legacy request-multiplier scale used by Copilot Pro/Pro+ annual subscribers
// who stayed on request-based billing. To keep historical premium-request counts accurate,
// multipliers are selected per event by timestamp relative to this cutoff.
export const MULTIPLIER_REBASE_CUTOFF_MS = Date.UTC(2026, 5, 1, 0, 0, 0); // 2026-06-01T00:00:00Z

// ── Pre-cutoff (before 2026-06-01) — original scale ─────────────────────────
export const MODEL_MULTIPLIERS_PRE_2026_06: Record<string, number> = {
  // ── Included models (0× on paid plans) ──────────────────────────────────
  'copilot/gpt-4.1': 0.0,
  'copilot/gpt-4.1-mini': 0.0,        // legacy alias
  'copilot/gpt-4o': 0.0,
  'copilot/gpt-4o-mini': 0.0,         // legacy
  'copilot/gpt-5-mini': 0.0,          // GPT-5 mini (included)
  'copilot/raptor-mini': 0.0,         // Raptor mini (included)
  // ── 0.25× ───────────────────────────────────────────────────────────────
  'copilot/gpt-5.4-nano': 0.25,
  'copilot/grok-code-fast-1': 0.25,
  // ── 0.33× ───────────────────────────────────────────────────────────────
  'copilot/claude-haiku-4.5': 0.33,
  'copilot/gemini-3-flash': 0.33,
  'copilot/gpt-5.4-mini': 0.33,
  // ── 1× ──────────────────────────────────────────────────────────────────
  'copilot/claude-sonnet-4': 1.0,
  'copilot/claude-sonnet-4.5': 1.0,
  'copilot/claude-sonnet-4.6': 1.0,
  'copilot/claude-sonnet-4-thinking': 1.0,
  'copilot/gemini-2.5-pro': 1.0,
  'copilot/gemini-3.1-pro': 1.0,
  'copilot/gpt-5.2': 1.0,
  'copilot/gpt-5.2-codex': 1.0,
  'copilot/gpt-5.3-codex': 1.0,
  'copilot/gpt-5.4': 1.0,
  'copilot/o4-mini': 1.0,
  // ── 3× ──────────────────────────────────────────────────────────────────
  'copilot/claude-opus-4.5': 3.0,
  'copilot/claude-opus-4.6': 3.0,
  'copilot/o3': 3.0,
  // ── 7.5× ────────────────────────────────────────────────────────────────
  'copilot/gpt-5.5': 7.5,
  // ── 15× ─────────────────────────────────────────────────────────────────
  'copilot/claude-opus-4.7': 15.0,
  // ── 30× ─────────────────────────────────────────────────────────────────
  'copilot/claude-opus-4.6-fast': 30.0,  // Opus 4.6 fast mode (preview)
  // ── auto-mode ───────────────────────────────────────────────────────────
  'copilot/auto': 0.0,                // auto-mode; 10% discount applied separately
  // ── Legacy / fallback ───────────────────────────────────────────────────
  'copilot/gpt-4': 0.0,
  'copilot/gpt-3.5-turbo': 0.0,
  'copilot/gemini-2.5-flash': 0.0,   // legacy; succeeded by Gemini 3 Flash
};

// ── On/after cutoff (2026-06-01) — rebased legacy scale ─────────────────────
export const MODEL_MULTIPLIERS_2026_06: Record<string, number> = {
  // ── 0.33× ───────────────────────────────────────────────────────────────
  'copilot/gpt-5-mini': 0.33,
  'copilot/raptor-mini': 0.33,
  'copilot/mai-code-1-flash': 0.33,   // promotional rate
  'copilot/claude-haiku-4.5': 0.33,
  'copilot/gemini-3-flash': 0.33,
  // ── 1× ──────────────────────────────────────────────────────────────────
  'copilot/gemini-2.5-pro': 1.0,
  // ── 6× ──────────────────────────────────────────────────────────────────
  'copilot/gpt-5.3-codex': 6.0,
  'copilot/gpt-5.4': 6.0,
  'copilot/gpt-5.4-mini': 6.0,
  'copilot/gemini-3.1-pro': 6.0,
  'copilot/claude-sonnet-4.5': 6.0,
  // ── 9× ──────────────────────────────────────────────────────────────────
  'copilot/claude-sonnet-4.6': 9.0,
  // ── 14× ─────────────────────────────────────────────────────────────────
  'copilot/gemini-3.5-flash': 14.0,
  // ── 27× ─────────────────────────────────────────────────────────────────
  'copilot/claude-opus-4.5': 27.0,
  'copilot/claude-opus-4.6': 27.0,
  'copilot/claude-opus-4.7': 27.0,
  'copilot/claude-opus-4.8': 27.0,
  // ── 54× ─────────────────────────────────────────────────────────────────
  'copilot/claude-opus-4.8-fast': 54.0,  // Opus 4.8 fast mode (preview); 2× base
  // ── 57× ─────────────────────────────────────────────────────────────────
  'copilot/gpt-5.5': 57.0,
  // ── auto-mode ───────────────────────────────────────────────────────────
  'copilot/auto': 0.0,                // auto-mode; 10% discount applied separately
};

/** Backward-compatible alias for the current-era (post-cutoff) multiplier table. */
export const MODEL_MULTIPLIERS = MODEL_MULTIPLIERS_2026_06;

/**
 * Resolve the legacy request multiplier for a model.
 * When `timestampMs` is provided and falls before the 2026-06-01 rebase cutoff,
 * the original scale is used; otherwise the rebased (current-era) scale applies.
 * Unknown models default to 1.0.
 */
export function getMultiplier(modelId: string, timestampMs?: number): number {
  const table = timestampMs !== undefined && timestampMs < MULTIPLIER_REBASE_CUTOFF_MS
    ? MODEL_MULTIPLIERS_PRE_2026_06
    : MODEL_MULTIPLIERS_2026_06;
  return table[modelId] ?? 1.0;
}

/** Estimate token count using ~4 chars/token heuristic. */
export function estimateTokens(text: string): number {
  if (!text) { return 0; }
  return Math.max(1, Math.floor(text.length / 4));
}
