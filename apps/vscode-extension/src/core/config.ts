/** Model multiplier table — mirrors the Python config.py */

export const MODEL_MULTIPLIERS: Record<string, number> = {
  // Included models (multiplier 0 on paid plans)
  'copilot/gpt-4.1': 0.0,
  'copilot/gpt-4.1-mini': 0.0,
  'copilot/gpt-4o': 0.0,
  'copilot/gpt-4o-mini': 0.0,
  'copilot/claude-sonnet-4': 0.0,
  'copilot/gemini-2.5-flash': 0.0,
  // Premium models
  'copilot/claude-opus-4.6': 3.0,
  'copilot/claude-opus-4.7': 7.5,
  'copilot/o3': 3.0,
  'copilot/o4-mini': 1.0,
  'copilot/gemini-2.5-pro': 1.0,
  'copilot/claude-sonnet-4-thinking': 1.0,
  // Codex / newer models
  'copilot/gpt-5.3-codex': 0.0,
  'copilot/gpt-5.4': 0.0,
  'copilot/claude-sonnet-4.5': 0.0,
  'copilot/claude-sonnet-4.6': 0.0,
  'copilot/auto': 0.0,
  // Legacy / fallback
  'copilot/gpt-4': 0.0,
  'copilot/gpt-3.5-turbo': 0.0,
};

export function getMultiplier(modelId: string): number {
  return MODEL_MULTIPLIERS[modelId] ?? 1.0;
}

/** Estimate token count using ~4 chars/token heuristic. */
export function estimateTokens(text: string): number {
  if (!text) { return 0; }
  return Math.max(1, Math.floor(text.length / 4));
}
