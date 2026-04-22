import * as vscode from 'vscode';
import { WorkspacePanel, DashboardPanel } from './views/panels';
import { StatusBarManager } from './views/statusBar';
import { getWorkspaceStorageRoot } from './core/discovery';

export function activate(context: vscode.ExtensionContext) {
	console.log('copilot-usage extension activated');

	const statusBar = new StatusBarManager();
	context.subscriptions.push(statusBar);

	/** Refresh status bar + any open panels. */
	const refreshAll = async () => {
		await Promise.all([
			statusBar.refresh(),
			WorkspacePanel.refresh(),
			DashboardPanel.refresh(),
		]);
	};

	// Watch the actual VS Code workspaceStorage directory for JSONL changes.
	// createFileSystemWatcher with RelativePattern(absolute path) works outside
	// the current workspace — this is the correct way to watch AppData files.
	const storageRoot = getWorkspaceStorageRoot();
	const watcher = vscode.workspace.createFileSystemWatcher(
		new vscode.RelativePattern(vscode.Uri.file(storageRoot), '**/chatSessions/*.jsonl'),
	);
	context.subscriptions.push(
		watcher,
		watcher.onDidCreate(() => refreshAll()),
		watcher.onDidChange(() => refreshAll()),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('copilot-usage.workspaceAnalysis', () =>
			WorkspacePanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.dashboard', () =>
			DashboardPanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.refresh', () =>
			refreshAll(),
		),
	);
}

export function deactivate() {}
