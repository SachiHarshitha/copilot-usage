import * as vscode from 'vscode';
import { resolveCopilotDebugLogEnabled } from './copilotDebugLogState';

export const COPILOT_DEBUG_LOG_SETTING = 'github.copilot.chat.agentDebugLog.fileLogging.enabled';
export const COPILOT_DEBUG_LOG_LEGACY_SETTING = 'github.copilot.chat.agentDebugLog.enabled';
export const COPILOT_DEBUG_LOG_SETTINGS_QUERY = '@id:github.copilot.chat.agentDebugLog.fileLogging.enabled';

/**
 * True when Copilot debug-log file logging is enabled.
 *
 * If the canonical setting is supported by the running VS Code/Copilot build,
 * it is treated as the source of truth. Legacy key is only a compatibility
 * fallback for environments where canonical key is unavailable.
 */
export function isCopilotDebugLogEnabled(): boolean {
  const cfg = vscode.workspace.getConfiguration('github.copilot.chat');
  const canonicalSupported = vscode.workspace
    .getConfiguration()
    .inspect<boolean>(COPILOT_DEBUG_LOG_SETTING) !== undefined;
  const canonical = cfg.get<boolean>('agentDebugLog.fileLogging.enabled', false);
  const legacy = cfg.get<boolean>('agentDebugLog.enabled', false);
  return resolveCopilotDebugLogEnabled(canonicalSupported, canonical, legacy);
}

export function didAffectCopilotDebugLogSetting(e: vscode.ConfigurationChangeEvent): boolean {
  return e.affectsConfiguration(COPILOT_DEBUG_LOG_SETTING)
    || e.affectsConfiguration(COPILOT_DEBUG_LOG_LEGACY_SETTING);
}

export async function openCopilotDebugLogSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', COPILOT_DEBUG_LOG_SETTINGS_QUERY);
}
