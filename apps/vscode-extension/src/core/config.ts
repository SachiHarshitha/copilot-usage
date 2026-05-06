// Model multiplier table — May 2026 snapshot
// Source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests#model-multipliers
export const MODEL_MULTIPLIERS: Record<string, number> = {
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

export function getMultiplier(modelId: string): number {
  return MODEL_MULTIPLIERS[modelId] ?? 1.0;
}

/** Estimate token count using ~4 chars/token heuristic. */
export function estimateTokens(text: string): number {
  if (!text) { return 0; }
  return Math.max(1, Math.floor(text.length / 4));
}
