import * as vscode from 'vscode';
import { WorkspacePanel, DashboardPanel } from './views/panels';
import { StatusBarManager } from './views/statusBar';
import { getWorkspaceStorageRoots, computeChatSessionsSignature } from './core/discovery';
import { openCopilotDebugLogSettings } from './core/copilotDebugLog';
import { CostEstimatorPanel, enableCostEstimator } from './features/costEstimator';

export function activate(context: vscode.ExtensionContext) {
	console.log('copilot-usage extension activated');

	const statusBar = new StatusBarManager();
	context.subscriptions.push(statusBar);

	/** Refresh status bar + any open panels. */
	const refreshAll = async () => {
		const tasks: Promise<unknown>[] = [
			statusBar.refresh(storageRoots),
			WorkspacePanel.refresh(storageRoots),
			DashboardPanel.refresh(storageRoots),
		];
		if (enableCostEstimator) {
			tasks.push(CostEstimatorPanel.refresh());
		}
		await Promise.all(tasks);
	};

	const storageRoots = getWorkspaceStorageRoots(vscode.env.appName);
	let lastSignature: string | undefined;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;

	const updateSignature = async () => {
		try {
			lastSignature = await computeChatSessionsSignature(storageRoots);
		} catch {
			// Ignore transient IO errors; next scan will retry.
		}
	};

	const refreshAllAndTrack = async () => {
		await refreshAll();
		await updateSignature();
	};

	// Coalesce rapid file-change bursts from streaming token updates.
	const scheduleRefresh = () => {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
		}
		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			void refreshAllAndTrack();
		}, 250);
	};

	context.subscriptions.push(new vscode.Disposable(() => {
		if (refreshTimer) {
			clearTimeout(refreshTimer);
			refreshTimer = undefined;
		}
	}));

	// Watch each VS Code workspaceStorage directory (stable + Insiders) for chat session changes.
	// createFileSystemWatcher with RelativePattern(absolute path) works outside
	// the current workspace — this is the correct way to watch AppData files.
	const onSessionFilesChanged = () => scheduleRefresh();
	for (const storageRoot of storageRoots) {
		const watcherJsonl = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.file(storageRoot), '**/chatSessions/*.jsonl'),
		);
		const watcherJson = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(vscode.Uri.file(storageRoot), '**/chatSessions/*.json'),
		);
		context.subscriptions.push(
			watcherJsonl,
			watcherJson,
			watcherJsonl.onDidCreate(onSessionFilesChanged),
			watcherJsonl.onDidChange(onSessionFilesChanged),
			watcherJsonl.onDidDelete(onSessionFilesChanged),
			watcherJson.onDidCreate(onSessionFilesChanged),
			watcherJson.onDidChange(onSessionFilesChanged),
			watcherJson.onDidDelete(onSessionFilesChanged),
		);
	}

	// Fallback polling closes gaps on platforms/setups where external watcher
	// notifications are delayed or dropped.
	const pollForMissedChanges = async () => {
		try {
			const nextSignature = await computeChatSessionsSignature(storageRoots);
			if (lastSignature === undefined) {
				lastSignature = nextSignature;
				return;
			}
			if (nextSignature !== lastSignature) {
				lastSignature = nextSignature;
				scheduleRefresh();
			}
		} catch {
			// Ignore transient IO errors; next poll will retry.
		}
	};

	void updateSignature();
	const poller = setInterval(() => {
		void pollForMissedChanges();
	}, 15000);
	context.subscriptions.push(new vscode.Disposable(() => clearInterval(poller)));

	context.subscriptions.push(
		vscode.commands.registerCommand('copilot-usage.workspaceAnalysis', () =>
			WorkspacePanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.dashboard', () =>
			DashboardPanel.createOrShow(context.extensionUri),
		),
		vscode.commands.registerCommand('copilot-usage.refresh', () =>
			refreshAllAndTrack(),
		),
		vscode.commands.registerCommand('copilot-usage.openDebugLogSettings', () =>
			openCopilotDebugLogSettings(),
		),
	);

	void refreshAllAndTrack();

	if (enableCostEstimator) {
		context.subscriptions.push(
			vscode.commands.registerCommand('copilot-usage.costEstimator', () =>
				CostEstimatorPanel.createOrShow(context.extensionUri, context),
			),
		);
	}
}

export function deactivate() {}
