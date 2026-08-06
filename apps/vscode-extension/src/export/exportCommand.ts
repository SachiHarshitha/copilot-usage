/** VS Code-facing flow for the dashboard's "Export report" action. */

import * as vscode from 'vscode';
import * as os from 'os';
import { buildExcelReport } from './excelReport';
import { buildReportModel, DashboardSnapshot } from './reportModel';

const EXTENSION_ID = 'emagin8.copilot-usage';
const TEMPLATE_PATH = ['resources', 'report-template.xlsx'];

function timestamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function defaultFolder(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri : vscode.Uri.file(os.homedir());
}

function extensionVersion(): string {
  return vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version ?? 'unknown';
}

/**
 * Build an Excel report from the data the dashboard is currently showing and let the user
 * save it. Returns the saved location, or `undefined` when the user cancelled.
 */
export async function exportDashboardReport(
  extensionUri: vscode.Uri,
  snapshot: DashboardSnapshot,
  dateRangeLabel: string,
): Promise<vscode.Uri | undefined> {
  const shortenWorkspacePaths = vscode.workspace
    .getConfiguration('copilot-usage')
    .get<boolean>('export.shortenWorkspacePaths', true);

  const generatedAt = new Date();
  const model = buildReportModel(snapshot, {
    extensionVersion: extensionVersion(),
    generatedAt,
    dateRangeLabel,
    shortenWorkspacePaths,
  });

  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(defaultFolder(), `copilot-usage-${dateRangeLabel}-${timestamp(generatedAt)}.xlsx`),
    filters: { 'Excel Workbook': ['xlsx'] },
    saveLabel: 'Export report',
    title: 'Export Copilot usage report',
  });
  if (!target) {
    return undefined;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Building Copilot usage report…' },
    async () => {
      const templateUri = vscode.Uri.joinPath(extensionUri, ...TEMPLATE_PATH);
      const templateBytes = await vscode.workspace.fs.readFile(templateUri);
      const workbook = buildExcelReport(templateBytes, model);
      await vscode.workspace.fs.writeFile(target, workbook);
    },
  );

  return target;
}

/** Save the report and surface the result, including follow-up actions. */
export async function runDashboardReportExport(
  extensionUri: vscode.Uri,
  snapshot: DashboardSnapshot,
  dateRangeLabel: string,
): Promise<void> {
  try {
    const target = await exportDashboardReport(extensionUri, snapshot, dateRangeLabel);
    if (!target) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `Copilot usage report saved to ${target.fsPath}`,
      'Open',
      'Reveal in Explorer',
    );
    if (choice === 'Open') {
      await vscode.commands.executeCommand('vscode.open', target);
    } else if (choice === 'Reveal in Explorer') {
      await vscode.commands.executeCommand('revealFileInOS', target);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`Could not export the Copilot usage report: ${reason}`);
  }
}
