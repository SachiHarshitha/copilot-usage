import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { readXlsx, readPart } from '../export/xlsxPackage';
import { buildExcelReport, DAILY_CHART_WINDOW } from '../export/excelReport';
import { ReportModel, REPORT_SCHEMA_VERSION } from '../export/reportModel';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'resources', 'report-template.xlsx');

function loadTemplate(): Uint8Array {
  return new Uint8Array(fs.readFileSync(TEMPLATE_PATH));
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function makeModel(counts: { models: number; repos: number; workspaces: number; daily: number }): ReportModel {
  return {
    meta: {
      schemaVersion: REPORT_SCHEMA_VERSION,
      extensionVersion: '9.9.9',
      generatedAt: new Date(2025, 5, 15, 9, 30, 0),
      dateRangeLabel: 'all',
      shortenWorkspacePaths: true,
      timezone: 'Europe/Berlin (+02:00)',
      rangeStart: counts.daily > 0 ? new Date(2025, 0, 1) : undefined,
      rangeEnd: counts.daily > 0 ? new Date(2025, 0, counts.daily) : undefined,
      sessions: 42,
    },
    models: Array.from({ length: counts.models }, (_, i) => ({
      model: `model-${i} & co`,
      requests: 10 + i,
      promptTokens: 1000 - i,
      outputTokens: 100 - i,
      premiumUnits: 1,
      credits: 5,
    })),
    repos: Array.from({ length: counts.repos }, (_, i) => ({
      repository: `org/repo-${i}`,
      requests: 5 + i,
      promptTokens: 500 - i,
      outputTokens: 50 - i,
      premiumUnits: 1,
      credits: 3,
      topModel: 'gpt-5',
    })),
    workspaces: Array.from({ length: counts.workspaces }, (_, i) => ({
      workspace: `…/code/project-${i}`,
      requests: 7 + i,
      promptTokens: 700 - i,
      outputTokens: 70 - i,
      premiumUnits: 1,
      credits: 4,
      topModel: 'gpt-5',
    })),
    daily: Array.from({ length: counts.daily }, (_, i) => ({
      date: new Date(2025, 0, 1 + i),
      requests: 3,
      promptTokens: 300,
      outputTokens: 30,
      toolRounds: 2,
      premiumUnits: 1,
      credits: 2,
      sessions: 1,
    })),
  };
}

function tableRef(parts: Record<string, Uint8Array>, part: string): string {
  const match = readPart(parts, part).match(/\bref="([A-Z]+\d+:[A-Z]+\d+)"/);
  assert.ok(match, `table ${part} has no ref`);
  return match![1];
}

function lastRowOfRef(ref: string): number {
  return Number(ref.split(':')[1].replace(/[A-Z]+/, ''));
}

suite('Export: workbook round trip', () => {
  test('the template resource ships with the extension', () => {
    assert.ok(fs.existsSync(TEMPLATE_PATH), `missing template at ${TEMPLATE_PATH}`);
  });

  test('the produced workbook is a readable package with every template part', () => {
    const template = loadTemplate();
    const output = readXlsx(buildExcelReport(template, makeModel({ models: 3, repos: 2, workspaces: 2, daily: 10 })));
    const original = readXlsx(template);

    for (const part of Object.keys(original)) {
      assert.ok(output[part], `output is missing part ${part}`);
    }
  });

  test('styles, theme and drawings are copied through byte for byte', () => {
    const template = loadTemplate();
    const original = readXlsx(template);
    const output = readXlsx(buildExcelReport(template, makeModel({ models: 3, repos: 2, workspaces: 2, daily: 10 })));

    const untouched = Object.keys(original).filter(part =>
      part === 'xl/styles.xml'
      || part.startsWith('xl/theme/')
      || part.startsWith('xl/drawings/drawing')
      || part === '[Content_Types].xml',
    );
    assert.ok(untouched.length >= 3, 'expected styles, theme and at least one drawing');

    for (const part of untouched) {
      assert.deepStrictEqual(
        Array.from(output[part]),
        Array.from(original[part]),
        `${part} was modified`,
      );
    }
  });

  test('chart definitions only change in their range references', () => {
    const template = loadTemplate();
    const original = readXlsx(template);
    const output = readXlsx(buildExcelReport(template, makeModel({ models: 3, repos: 2, workspaces: 2, daily: 10 })));

    const charts = Object.keys(original).filter(p => p.startsWith('xl/drawings/charts/chart') && p.endsWith('.xml'));
    assert.strictEqual(charts.length, 4, 'expected the template to define four charts');

    const stripRanges = (xml: string) => xml.replace(/\$[A-Z]+\$\d+:\$[A-Z]+\$\d+/g, '<range>');
    for (const chart of charts) {
      assert.strictEqual(
        stripRanges(decode(output[chart])),
        stripRanges(decode(original[chart])),
        `${chart} changed beyond its ranges`,
      );
    }
  });

  test('table ranges follow the row counts, growing and shrinking', () => {
    const template = loadTemplate();

    for (const counts of [
      { models: 2, repos: 1, workspaces: 1, daily: 3 },
      { models: 40, repos: 25, workspaces: 30, daily: 400 },
    ]) {
      const parts = readXlsx(buildExcelReport(template, makeModel(counts)));
      assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table1.xml')), 4 + counts.models);
      assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table2.xml')), 4 + counts.repos);
      assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table3.xml')), 4 + counts.workspaces);
      assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table4.xml')), 4 + counts.daily);
    }
  });

  test('an empty dataset still produces a valid single-row table', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 0, repos: 0, workspaces: 0, daily: 0 })));

    // Excel tables must contain at least one data row.
    assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table1.xml')), 5);
    assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table4.xml')), 5);
  });

  test('share formulas point at the real last data row', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 12, repos: 3, workspaces: 4, daily: 5 })));

    const models = decode(parts['xl/worksheets/sheet2.xml']);
    assert.ok(models.includes('E5/SUM($E$5:$E$16)'), 'first model share formula is wrong');
    assert.ok(models.includes('E16/SUM($E$5:$E$16)'), 'last model share formula is wrong');
    assert.ok(!models.includes('$E$17'), 'a share formula overshoots the data range');
  });

  test('total rows are written below the data with their template formulas intact', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 3, repos: 2, workspaces: 2, daily: 4 })));
    const models = decode(parts['xl/worksheets/sheet2.xml']);

    // 3 data rows → rows 5-7, spacer on 8, total on 9.
    assert.ok(/<x:row r="9"[\s\S]*?<x:f>/.test(models), 'no total row formula found');
    const totalRequests = 10 + 11 + 12;
    assert.ok(models.includes(`<x:v>${totalRequests}</x:v>`), 'total row is not showing a cached sum');
  });

  test('conditional formatting is extended to the last data row', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 20, repos: 2, workspaces: 2, daily: 4 })));
    const models = decode(parts['xl/worksheets/sheet2.xml']);

    const sqrefs = models.match(/<x:conditionalFormatting sqref="[A-Z]+\d+:[A-Z]+(\d+)"/g) ?? [];
    assert.ok(sqrefs.length > 0, 'template no longer has conditional formatting on the Models sheet');
    for (const sqref of sqrefs) {
      assert.ok(sqref.endsWith('24"'), `conditional formatting was not extended: ${sqref}`);
    }
  });

  test('the daily chart window is capped while every row is still written', () => {
    const template = loadTemplate();
    const dailyCount = 400;
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 2, repos: 2, workspaces: 2, daily: dailyCount })));

    const lastRow = 4 + dailyCount;
    const expectedStart = lastRow - DAILY_CHART_WINDOW + 1;
    const chartXml = Object.keys(parts)
      .filter(p => p.startsWith('xl/drawings/charts/chart'))
      .map(p => decode(parts[p]))
      .join('');

    assert.ok(chartXml.includes(`'DailyData'!$A$${expectedStart}:$A$${lastRow}`), 'daily chart window was not capped');
    // The table itself keeps all rows.
    assert.strictEqual(lastRowOfRef(tableRef(parts, 'xl/tables/table4.xml')), lastRow);
  });

  test('metadata records the export provenance', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 2, repos: 2, workspaces: 2, daily: 5 })));
    const metadata = decode(parts['xl/worksheets/sheet6.xml']);

    assert.ok(metadata.includes('9.9.9'), 'extension version missing');
    assert.ok(metadata.includes(REPORT_SCHEMA_VERSION), 'schema version missing');
    assert.ok(metadata.includes('Europe/Berlin (+02:00)'), 'timezone missing');
    assert.ok(metadata.includes('Shortened'), 'path policy missing');
    assert.ok(metadata.includes('<x:v>42</x:v>'), 'session count missing');
  });

  test('the dashboard carries no stale cached formula results', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 2, repos: 2, workspaces: 2, daily: 5 })));
    const dashboard = decode(parts['xl/worksheets/sheet1.xml']);

    assert.ok(!/<\/x:f><x:v>/.test(dashboard), 'a dashboard formula still carries a cached value');
    assert.ok(dashboard.includes('Range: all'), 'the dashboard subtitle was not written');
  });

  test('the workbook asks viewers to recalculate on open', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 2, repos: 2, workspaces: 2, daily: 5 })));
    assert.ok(decode(parts['xl/workbook.xml']).includes('fullCalcOnLoad="1"'));
  });

  test('text values are XML-escaped rather than corrupting the sheet', () => {
    const template = loadTemplate();
    const parts = readXlsx(buildExcelReport(template, makeModel({ models: 1, repos: 1, workspaces: 1, daily: 1 })));
    const models = decode(parts['xl/worksheets/sheet2.xml']);
    assert.ok(models.includes('model-0 &amp; co'), 'ampersand was not escaped');
    assert.ok(!models.includes('model-0 & co'), 'raw ampersand leaked into the sheet');
  });
});
