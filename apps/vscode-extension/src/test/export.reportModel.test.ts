import * as assert from 'assert';
import { KpiTotals, ModelStats, WorkspaceStats, DailyStats } from '../core/types';
import { RepoAttributionStats } from '../core/repoAttribution';
import {
  DashboardSnapshot,
  REPORT_SCHEMA_VERSION,
  buildReportModel,
  describeTimezone,
  shortenWorkspacePath,
} from '../export/reportModel';

function kpis(overrides: Partial<KpiTotals> = {}): KpiTotals {
  return {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalOutputTokens: 0,
    totalToolCallRounds: 0,
    totalPremium: 0,
    totalCredits: 0,
    workspaceCount: 0,
    sessionCount: 0,
    ...overrides,
  } as KpiTotals;
}

function emptyRepos(): RepoAttributionStats {
  return {
    workspaceTotals: { totalRequests: 0, totalPromptTokens: 0, totalOutputTokens: 0 },
    rows: [],
  };
}

function model(id: string, prompt: number, output: number, requests = 1): ModelStats {
  return {
    modelId: id,
    requests,
    promptTokens: prompt,
    outputTokens: output,
    totalTokens: prompt + output,
    premium: 1,
    credits: 10,
  };
}

function day(date: string, prompt: number, output: number): DailyStats {
  return {
    date,
    promptTokens: prompt,
    outputTokens: output,
    requests: 1,
    toolCallRounds: 2,
    premium: 1,
    credits: 5,
    sessions: 1,
  };
}

function workspace(path: string, prompt: number, output: number): WorkspaceStats {
  return {
    workspaceId: 'id-' + path,
    workspacePath: path,
    requests: 1,
    promptTokens: prompt,
    outputTokens: output,
    premium: 1,
    credits: 3,
    topModel: 'copilot/gpt-5',
  } as WorkspaceStats;
}

const META = {
  extensionVersion: '0.1.4',
  generatedAt: new Date(2025, 5, 15, 9, 30, 0),
  dateRangeLabel: '30d',
  shortenWorkspacePaths: true,
};

suite('Export: report model', () => {
  test('shortenWorkspacePath keeps only the last two segments', () => {
    assert.strictEqual(shortenWorkspacePath('C:\\a\\b\\c\\project'), '…/c/project');
    assert.strictEqual(shortenWorkspacePath('/home/me/project'), '…/me/project');
    // Nothing to hide in an already-short path.
    assert.strictEqual(shortenWorkspacePath('/project'), '/project');
  });

  test('describeTimezone reports a zone and a signed offset', () => {
    assert.match(describeTimezone(new Date(2025, 5, 15)), /^.+ \([+-]\d{2}:\d{2}\)$/);
  });

  test('an empty dashboard produces an empty but well-formed model', () => {
    const snapshot: DashboardSnapshot = {
      kpis: kpis(),
      models: [],
      workspaces: [],
      repos: emptyRepos(),
      daily: [],
    };

    const report = buildReportModel(snapshot, META);

    assert.strictEqual(report.models.length, 0);
    assert.strictEqual(report.daily.length, 0);
    assert.strictEqual(report.meta.schemaVersion, REPORT_SCHEMA_VERSION);
    assert.strictEqual(report.meta.rangeStart, undefined);
    assert.strictEqual(report.meta.rangeEnd, undefined);
    assert.strictEqual(report.meta.sessions, 0);
  });

  test('models and workspaces are ranked by total tokens, daily rows by date', () => {
    const snapshot: DashboardSnapshot = {
      kpis: kpis({ sessionCount: 12 }),
      models: [model('copilot/small', 10, 5), model('copilot/big', 900, 100), model('copilot/mid', 200, 50)],
      workspaces: [workspace('C:\\code\\alpha', 5, 5), workspace('C:\\code\\beta', 500, 20)],
      repos: emptyRepos(),
      daily: [day('2025-06-03', 3, 3), day('2025-06-01', 1, 1), day('2025-06-02', 2, 2)],
    };

    const report = buildReportModel(snapshot, META);

    assert.deepStrictEqual(report.models.map(m => m.model), ['big', 'mid', 'small']);
    assert.deepStrictEqual(report.workspaces.map(w => w.workspace), ['…/code/beta', '…/code/alpha']);
    assert.deepStrictEqual(
      report.daily.map(d => `${d.date.getFullYear()}-${d.date.getMonth() + 1}-${d.date.getDate()}`),
      ['2025-6-1', '2025-6-2', '2025-6-3'],
    );
  });

  test('row totals agree with the dashboard KPI totals', () => {
    const snapshot: DashboardSnapshot = {
      kpis: kpis({ totalRequests: 3, totalPromptTokens: 1110, totalOutputTokens: 155, sessionCount: 4 }),
      models: [model('copilot/small', 10, 5), model('copilot/big', 900, 100), model('copilot/mid', 200, 50)],
      workspaces: [],
      repos: emptyRepos(),
      daily: [],
    };

    const report = buildReportModel(snapshot, META);
    const prompt = report.models.reduce((sum, m) => sum + m.promptTokens, 0);
    const output = report.models.reduce((sum, m) => sum + m.outputTokens, 0);
    const requests = report.models.reduce((sum, m) => sum + m.requests, 0);

    assert.strictEqual(prompt, snapshot.kpis.totalPromptTokens);
    assert.strictEqual(output, snapshot.kpis.totalOutputTokens);
    assert.strictEqual(requests, snapshot.kpis.totalRequests);
  });

  test('the date range is taken from the first and last daily rows', () => {
    const snapshot: DashboardSnapshot = {
      kpis: kpis({ sessionCount: 7 }),
      models: [],
      workspaces: [],
      repos: emptyRepos(),
      daily: [day('2025-06-30', 1, 1), day('2025-06-01', 1, 1)],
    };

    const report = buildReportModel(snapshot, META);

    assert.strictEqual(report.meta.rangeStart?.getDate(), 1);
    assert.strictEqual(report.meta.rangeEnd?.getDate(), 30);
    assert.strictEqual(report.meta.sessions, 7);
    assert.strictEqual(report.meta.dateRangeLabel, '30d');
  });

  test('full workspace paths are kept when shortening is disabled', () => {
    const snapshot: DashboardSnapshot = {
      kpis: kpis(),
      models: [],
      workspaces: [workspace('C:\\code\\alpha\\deep', 1, 1)],
      repos: emptyRepos(),
      daily: [],
    };

    const report = buildReportModel(snapshot, { ...META, shortenWorkspacePaths: false });
    assert.strictEqual(report.workspaces[0].workspace, 'C:\\code\\alpha\\deep');
  });
});
