/** PromptStreak share panel and interaction handlers. */

import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { clearShareHistory, paginateShareHistory } from './history';
import { getPromptstreakShareHtml, loadingPage } from './html';
import {
  applyRecipe,
  loadShareSettings,
  saveShareSettings,
} from './settings';
import {
  clearPendingLinkState,
  getDeviceToken,
  getPendingLinkState,
  loadShareHistory,
  saveShareHistory,
  setPendingLinkState,
} from './storage';
import { PromptstreakShareSyncService } from './sync';
import { canUnlinkDevice, deriveDeviceLinkState } from './linkState';
import { ShareFieldConfig, ShareRecipe } from './types';
import { PROMPTSTREAK_LINK_PATH } from './linkCallback';
import { buildDeviceFingerprint } from './deviceFingerprint';

const HISTORY_PAGE_SIZE = 20;
const MAX_DEVICE_ALIAS_LENGTH = 64;

function maskToken(token: string | undefined): string {
  if (!token) {
    return '';
  }
  if (token.length < 16) {
    return '(linked token hidden)';
  }
  return `(token ${token.slice(0, 8)}...${token.slice(-4)})`;
}

export class PromptstreakSharePanel {
  public static currentPanel: PromptstreakSharePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;
  private historyPage = 1;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly syncService: PromptstreakShareSyncService,
  ) {
    this.panel = panel;
    this.panel.webview.options = { enableScripts: true };
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.disposables.push(
      this.syncService.onDidUpdate(() => {
        void this.loadData();
      }),
    );

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        if (msg.command === 'refresh') { this.showLoading(); this.historyPage = 1; await this.loadData(); }
        if (msg.command === 'toggleEnabled') { await this.handleToggleEnabled(Boolean(msg.enabled)); }
        if (msg.command === 'applyRecipe') { await this.handleApplyRecipe(String(msg.recipe)); }
        if (msg.command === 'toggleField') {
          await this.handleToggleField(String(msg.field), Boolean(msg.enabled));
        }
        if (msg.command === 'sendNow') {
          await this.syncService.sendNow('manual');
          await this.loadData();
        }
        if (msg.command === 'clearHistory') {
          await this.handleClearHistory();
        }
        if (msg.command === 'historyPrevPage') {
          this.historyPage = Math.max(1, this.historyPage - 1);
          await this.loadData();
        }
        if (msg.command === 'historyNextPage') {
          this.historyPage += 1;
          await this.loadData();
        }
        if (msg.command === 'linkAccount') {
          await this.handleLinkAccount();
        }
        if (msg.command === 'saveDeviceAlias') {
          await this.handleSaveDeviceAlias(String(msg.alias || ''));
        }
        if (msg.command === 'useClipboardToken') {
          await this.handleUseClipboardToken();
        }
        if (msg.command === 'unlinkAccount') {
          await this.handleUnlinkAccount();
        }
        if (msg.command === 'openSettings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'copilot-usage');
        }
        if (msg.command === 'openPrivacyPolicy') {
          const settings = loadShareSettings(this.context);
          const privacyUrl = `${settings.promptstreakBaseUrl.replace(/\/+$/, '')}/privacy`;
          await vscode.env.openExternal(vscode.Uri.parse(privacyUrl));
        }
      },
      null,
      this.disposables,
    );
  }

  public static async refresh(): Promise<void> {
    if (!PromptstreakSharePanel.currentPanel) {
      return;
    }
    await PromptstreakSharePanel.currentPanel.loadData();
  }

  public static async createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    syncService: PromptstreakShareSyncService,
  ): Promise<void> {
    const column = vscode.ViewColumn.Active;
    if (PromptstreakSharePanel.currentPanel) {
      PromptstreakSharePanel.currentPanel.panel.reveal(column);
      PromptstreakSharePanel.currentPanel.showLoading();
      await PromptstreakSharePanel.currentPanel.loadData();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'copilotUsage.promptstreakShare',
      'PromptStreak Share',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    void extensionUri;

    PromptstreakSharePanel.currentPanel = new PromptstreakSharePanel(panel, context, syncService);
    PromptstreakSharePanel.currentPanel.showLoading();
    await PromptstreakSharePanel.currentPanel.loadData();
  }

  private setHtml(html: string): void {
    if (!this.disposed) {
      this.panel.webview.html = html;
    }
  }

  private showLoading(): void {
    this.setHtml(loadingPage());
  }

  private async loadData(): Promise<void> {
    const settings = loadShareSettings(this.context);
    const history = loadShareHistory(this.context);
    const paged = paginateShareHistory(history, this.historyPage, HISTORY_PAGE_SIZE);
    this.historyPage = paged.currentPage;
    const token = await getDeviceToken(this.context);
    const pendingLinkState = getPendingLinkState(this.context);
    const linkState = deriveDeviceLinkState({
      hasToken: !!token,
      lastSyncStatus: settings.lastSyncStatus,
      hasPendingLinkState: !!pendingLinkState,
    });
    const canUnlink = canUnlinkDevice(!!token, settings.lastSyncStatus);

    this.setHtml(getPromptstreakShareHtml({
      settings,
      history: paged.entries,
      historyPagination: {
        currentPage: paged.currentPage,
        totalPages: paged.totalPages,
        totalEntries: paged.totalEntries,
        startEntry: paged.startEntry,
        endEntry: paged.endEntry,
      },
      linked: linkState.linked,
      maskedToken: maskToken(token),
      linkStatusLabel: linkState.statusLabel,
      linkStatusTone: linkState.statusTone,
      disableRelinkActions: linkState.disableRelinkActions,
      canUnlink,
    }));
  }

  private async handleToggleEnabled(enabled: boolean): Promise<void> {
    const settings = loadShareSettings(this.context);
    settings.enabled = enabled;
    await saveShareSettings(this.context, settings);

    if (enabled) {
      this.syncService.refreshSchedule();
    }

    await this.loadData();
  }

  private async handleApplyRecipe(recipeRaw: string): Promise<void> {
    const allowed: ShareRecipe[] = ['privacy_first', 'standard', 'full'];
    const recipe = allowed.find(r => r === recipeRaw);
    if (!recipe) {
      return;
    }

    const settings = applyRecipe(loadShareSettings(this.context), recipe);
    await saveShareSettings(this.context, settings);
    this.syncService.refreshSchedule();
    await this.loadData();
  }

  private async handleToggleField(fieldRaw: string, enabled: boolean): Promise<void> {
    const settings = loadShareSettings(this.context);
    const field = fieldRaw as keyof ShareFieldConfig;
    if (!(field in settings.fields)) {
      return;
    }

    settings.fields = {
      ...settings.fields,
      [field]: enabled,
    };
    await saveShareSettings(this.context, settings);
    this.syncService.refreshSchedule();
    await this.loadData();
  }

  private async handleClearHistory(): Promise<void> {
    const history = loadShareHistory(this.context);
    await saveShareHistory(this.context, clearShareHistory(history));
    this.historyPage = 1;
    await this.loadData();
  }

  private async handleSaveDeviceAlias(aliasRaw: string): Promise<void> {
    const normalizedAlias = aliasRaw.trim();
    if (!normalizedAlias) {
      void vscode.window.showWarningMessage('Device alias is required before linking.');
      return;
    }

    if (normalizedAlias.length > MAX_DEVICE_ALIAS_LENGTH) {
      void vscode.window.showWarningMessage(
        `Device alias must be ${MAX_DEVICE_ALIAS_LENGTH} characters or fewer.`,
      );
      return;
    }

    const settings = loadShareSettings(this.context);
    settings.deviceAlias = normalizedAlias;
    await saveShareSettings(this.context, settings);

    const token = await getDeviceToken(this.context);
    if (token) {
      const result = await this.syncService.updateLinkedDeviceAlias(
        settings.promptstreakBaseUrl,
        normalizedAlias || null,
      );

      if (!result.updated) {
        void vscode.window.showWarningMessage(result.detail || 'Failed to update PromptStreak device alias.');
      } else {
        settings.deviceAlias = result.alias || '';
        await saveShareSettings(this.context, settings);
      }
    }

    await this.loadData();
  }

  private async handleLinkAccount(): Promise<void> {
    const settings = loadShareSettings(this.context);
    const code = `vscode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const deviceFingerprint = buildDeviceFingerprint(vscode.env.machineId);
    const deviceAlias = (settings.deviceAlias || '').trim();
    if (!deviceAlias) {
      void vscode.window.showWarningMessage('Set and save a device alias before linking your account.');
      return;
    }

    const state = randomBytes(16).toString('hex');
    const callback = vscode.Uri.from({
      scheme: vscode.env.uriScheme,
      authority: this.context.extension.id,
      path: PROMPTSTREAK_LINK_PATH,
    }).toString();
    await setPendingLinkState(this.context, state);
    await this.loadData();

    const aliasQuery = deviceAlias ? `&deviceAlias=${encodeURIComponent(deviceAlias)}` : '';
    const target = `${settings.promptstreakBaseUrl.replace(/\/+$/, '')}/connect?code=${encodeURIComponent(code)}&deviceFingerprint=${encodeURIComponent(deviceFingerprint)}${aliasQuery}&state=${encodeURIComponent(state)}&callback=${encodeURIComponent(callback)}`;

    await vscode.env.openExternal(vscode.Uri.parse(target));
    void vscode.window.showInformationMessage(
      'Complete sign-in in your browser. Linking should return here automatically.',
    );
  }

  private async handleUseClipboardToken(): Promise<void> {
    const linked = await this.syncService.linkDeviceTokenFromClipboard();
    if (!linked) {
      void vscode.window.showWarningMessage('Clipboard does not contain a valid PromptStreak device token.');
      return;
    }

    void vscode.window.showInformationMessage('PromptStreak device linked successfully.');
    this.syncService.refreshSchedule();
    await this.loadData();
  }

  private async handleUnlinkAccount(): Promise<void> {
    const action = await vscode.window.showWarningMessage(
      'Unlink this device from PromptStreak? Uploads will stop until you link again.',
      { modal: true },
      'Unlink Device',
    );
    if (action !== 'Unlink Device') {
      return;
    }

    const settings = loadShareSettings(this.context);
    settings.enabled = false;
    settings.linkedAtIso = undefined;
    settings.lastSyncStatus = undefined;
    await saveShareSettings(this.context, settings);
    await clearPendingLinkState(this.context);

    const unlinkResult = await this.syncService.unlinkDeviceToken(settings.promptstreakBaseUrl);
    if (!unlinkResult.remoteRevoked) {
      const action = await vscode.window.showWarningMessage(
        'PromptStreak was unlinked locally, but remote device revoke failed. You can revoke it from PromptStreak settings.',
        'Open PromptStreak Settings',
      );
      if (action) {
        const settingsUrl = `${settings.promptstreakBaseUrl.replace(/\/+$/, '')}/settings`;
        await vscode.env.openExternal(vscode.Uri.parse(settingsUrl));
      }
    } else {
      void vscode.window.showInformationMessage('PromptStreak device unlinked and revoked.');
    }

    await this.loadData();
  }

  private dispose(): void {
    this.disposed = true;
    PromptstreakSharePanel.currentPanel = undefined;
    this.panel.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

export function createPromptstreakShareSyncService(
  context: vscode.ExtensionContext,
  adapterVersion: string,
): PromptstreakShareSyncService {
  return new PromptstreakShareSyncService(context, adapterVersion);
}
