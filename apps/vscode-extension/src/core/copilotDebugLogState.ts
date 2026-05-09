/**
 * Resolve whether Copilot debug-log file logging should be treated as enabled.
 *
 * Newer builds expose the canonical fileLogging setting; when that setting is
 * supported, it is the source of truth. Legacy setting is only a fallback for
 * older environments that do not expose the canonical key.
 */
export function resolveCopilotDebugLogEnabled(
  canonicalSettingSupported: boolean,
  canonicalEnabled: boolean,
  legacyEnabled: boolean,
): boolean {
  if (canonicalSettingSupported) {
    return canonicalEnabled;
  }
  return legacyEnabled;
}
