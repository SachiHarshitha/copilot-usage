import * as vscode from 'vscode';
import { WorkspacePanel, DashboardPanel } from './views/panels';
import { StatusBarManager } from './views/statusBar';

export function activate(context: vscode.ExtensionContext) {
	console.log('copilot-usage extension activated');

	const statusBar = new StatusBarManager();
	context.subscriptions.push(statusBar);

	context.subscriptions.push(
		vscode.commands.registerCommand('copilot-usage.workspaceAnalysis', () =>
			WorkspacePanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.dashboard', () =>
			DashboardPanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.refresh', () =>
			statusBar.refresh(),
		),
	);
}

export function deactivate() {}
