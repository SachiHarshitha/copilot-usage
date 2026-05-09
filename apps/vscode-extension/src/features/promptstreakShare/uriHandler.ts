/** URI callback handler for browser-based PromptStreak linking. */

import * as vscode from 'vscode';
import {
  clearPendingLinkState,
  getPendingLinkState,
} from './storage';
import { PromptstreakShareSyncService } from './sync';
import {
  decodePromptstreakLinkCallback,
} from './linkCallback';

export class PromptstreakShareUriHandler implements vscode.UriHandler, vscode.Disposable {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly syncService: PromptstreakShareSyncService,
  ) {}

  async handleUri(uri: vscode.Uri): Promise<void> {
    const expectedState = getPendingLinkState(this.context);

    const decoded = decodePromptstreakLinkCallback(uri, expectedState);
    if (decoded.type === 'ignore') {
      return;
    }

    if (decoded.type === 'reject') {
      if (decoded.clearPendingState) {
        await clearPendingLinkState(this.context);
      }

      void vscode.window.showWarningMessage(decoded.message);
      return;
    }

    if (decoded.clearPendingState) {
      await clearPendingLinkState(this.context);
    }

    if (decoded.requireUserConfirmation) {
      const action = await vscode.window.showWarningMessage(
        decoded.warning ||
          'PromptStreak callback arrived without a pending state in this window. Link this device anyway?',
        'Link Device',
      );
      if (action !== 'Link Device') {
        return;
      }
    }

    await this.syncService.setLinkedToken(decoded.token);
    this.syncService.refreshSchedule();
    void vscode.window.showInformationMessage('PromptStreak device linked successfully.');
  }

  dispose(): void {
    // No unmanaged resources.
  }
}
