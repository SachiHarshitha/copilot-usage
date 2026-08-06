/**
 * Fills the shipped Excel template with a `ReportModel` and returns the finished workbook.
 *
 * Only `<x:sheetData>` blocks and a handful of range attributes are rewritten. Styles, theme,
 * drawings and all four charts are copied through untouched, which is the whole reason this
 * patches a template instead of generating a workbook from scratch.
 */

import { readXlsx, writeXlsx, readPart, writePart, XlsxParts } from './xlsxPackage';
import { normalizeTemplate } from './normalizeTemplate';
import {
  CellValue,
  RowValues,
  excelSerialDate,
  excelSerialDateTime,
  findRow,
  getCellText,
  renderRow,
  replaceSheetData,
  setCellText,
  stripCachedFormulaValues,
} from './sheetXml';
import { ReportModel } from './reportModel';

const DASHBOARD_SHEET = 'xl/worksheets/sheet1.xml';
const METADATA_SHEET = 'xl/worksheets/sheet6.xml';
const METADATA_TABLE = 'xl/tables/table5.xml';

/** Number of daily points the dashboard chart shows; the table always holds every row. */
export const DAILY_CHART_WINDOW = 90;
/** Number of rows the Models / Repos / Workspaces charts rank. */
const TOP_N_CHART_ROWS = 8;
/** Blank rows kept below the content so the sheet background stays painted. */
const TRAILING_FILLER_ROWS = 10;

interface DataSheetSpec {
  sheetPart: string;
  tablePart: string;
  /** Sheet name as the charts refer to it. */
  chartSheetName: string;
  hasTotalRow: boolean;
}

const MODELS: DataSheetSpec = {
  sheetPart: 'xl/worksheets/sheet2.xml',
  tablePart: 'xl/tables/table1.xml',
  chartSheetName: 'Models',
  hasTotalRow: true,
};
const REPOS: DataSheetSpec = {
  sheetPart: 'xl/worksheets/sheet3.xml',
  tablePart: 'xl/tables/table2.xml',
  chartSheetName: 'Repos',
  hasTotalRow: true,
};
const WORKSPACES: DataSheetSpec = {
  sheetPart: 'xl/worksheets/sheet4.xml',
  tablePart: 'xl/tables/table3.xml',
  chartSheetName: 'Workspaces',
  hasTotalRow: true,
};
const DAILY: DataSheetSpec = {
  sheetPart: 'xl/worksheets/sheet5.xml',
  tablePart: 'xl/tables/table4.xml',
  chartSheetName: 'DailyData',
  hasTotalRow: false,
};

const MODELS_METERED_HEADERS: RowValues = {
  I: { kind: 'text', value: 'Metered Rounds' },
  J: { kind: 'text', value: 'Metered Input Tokens' },
  K: { kind: 'text', value: 'Metered Output Tokens' },
  L: { kind: 'text', value: 'Metered Cached Tokens' },
  M: { kind: 'text', value: 'Metered Credits' },
  N: { kind: 'text', value: 'Metered Coverage %' },
};

const DAILY_METERED_HEADERS: RowValues = {
  I: { kind: 'text', value: 'Metered Rounds' },
  J: { kind: 'text', value: 'Metered Input Tokens' },
  K: { kind: 'text', value: 'Metered Output Tokens' },
  L: { kind: 'text', value: 'Metered Cached Tokens' },
  M: { kind: 'text', value: 'Metered Credits' },
  N: { kind: 'text', value: 'Metered Coverage %' },
};

const text = (value: string): CellValue => ({ kind: 'text', value });
const num = (value: number): CellValue => ({ kind: 'number', value });
const cached = (value: number): CellValue => ({ kind: 'cached', value });
const formula = (f: string, result: number): CellValue => ({ kind: 'formula', formula: f, cached: result });

/** Metered columns are blanked when no metered data exists, so template samples cannot show up. */
const BLANK_METERED: RowValues = { I: { kind: 'blank' }, J: { kind: 'blank' }, K: { kind: 'blank' }, L: { kind: 'blank' }, M: { kind: 'blank' }, N: { kind: 'blank' } };

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function maxRowNumber(sheetXml: string): number {
  const rows = sheetXml.match(/<(?:x:)?row r="(\d+)"/g) ?? [];
  return rows.reduce((max, tag) => Math.max(max, Number(tag.match(/\d+/)![0])), 0);
}

interface TableRange {
  headerRow: number;
  lastDataRow: number;
  firstColumn: string;
  lastColumn: string;
}

function readTableRange(tableXml: string): TableRange {
  const match = tableXml.match(/\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/);
  if (!match) {
    throw new Error('Report template table has no usable ref attribute.');
  }
  return {
    firstColumn: match[1],
    headerRow: Number(match[2]),
    lastColumn: match[3],
    lastDataRow: Number(match[4]),
  };
}

/**
 * Rewrite one data sheet: header rows verbatim, `rowCount` generated data rows cloned from the
 * template's styled first data row, then the spacer/total rows and background filler.
 */
function writeDataSheet(
  parts: XlsxParts,
  spec: DataSheetSpec,
  rowCount: number,
  buildRow: (index: number, rowNumber: number, lastDataRow: number) => RowValues,
  totals: RowValues,
  headerValues: RowValues = {},
): { lastDataRow: number } {
  const sheetXml = readPart(parts, spec.sheetPart);
  const tableXml = readPart(parts, spec.tablePart);
  const range = readTableRange(tableXml);

  const firstDataRow = range.headerRow + 1;
  const templateDataRow = findRow(sheetXml, firstDataRow);
  const templateFillerRow = findRow(sheetXml, range.lastDataRow + 1);
  const templateTotalRow = spec.hasTotalRow ? findRow(sheetXml, range.lastDataRow + 2) : undefined;

  // A table needs at least one data row, so an empty dataset still emits a placeholder.
  const count = Math.max(1, rowCount);
  const lastDataRow = range.headerRow + count;

  const out: string[] = [];
  for (let row = 1; row <= range.headerRow; row++) {
    const templateRow = findRow(sheetXml, row);
    if (row === range.headerRow && Object.keys(headerValues).length > 0) {
      out.push(renderRow(templateRow, row, headerValues));
    } else {
      out.push(templateRow);
    }
  }
  for (let index = 0; index < count; index++) {
    const rowNumber = firstDataRow + index;
    out.push(renderRow(templateDataRow, rowNumber, buildRow(index, rowNumber, lastDataRow)));
  }

  let nextRow = lastDataRow + 1;
  if (templateTotalRow) {
    out.push(renderRow(templateFillerRow, nextRow++));
    out.push(renderRow(templateTotalRow, nextRow++, totals));
  }

  const bottomRow = Math.max(maxRowNumber(sheetXml), nextRow + TRAILING_FILLER_ROWS - 1);
  for (; nextRow <= bottomRow; nextRow++) {
    out.push(renderRow(templateFillerRow, nextRow));
  }

  let patched = replaceSheetData(sheetXml, out.join(''));
  patched = patched.replace(
    /(<(?:x:)?conditionalFormatting sqref="[A-Z]+)(\d+)(:[A-Z]+)\d+"/g,
    (_match, head: string, start: string, mid: string) => `${head}${start}${mid}${lastDataRow}"`,
  );
  writePart(parts, spec.sheetPart, patched);

  writePart(
    parts,
    spec.tablePart,
    tableXml.replace(
      /\bref="[A-Z]+\d+:[A-Z]+\d+"/,
      () => `ref="${range.firstColumn}${range.headerRow}:${range.lastColumn}${lastDataRow}"`,
    ),
  );

  return { lastDataRow };
}

/** Repoint every chart series that reads `sheetName` at the given row window. */
function patchChartRanges(parts: XlsxParts, windows: Map<string, { start: number; end: number }>): void {
  for (const partName of Object.keys(parts)) {
    // Excel stores charts under xl/charts/; the authored template used xl/drawings/charts/.
    if (!/^xl\/(?:drawings\/)?charts\/chart\d+\.xml$/.test(partName)) {
      continue;
    }
    const chartXml = readPart(parts, partName);
    const patched = chartXml.replace(
      /('?)([A-Za-z][A-Za-z0-9_ ]*?)\1!\$([A-Z]+)\$\d+:\$([A-Z]+)\$\d+/g,
      (match, quote: string, sheetName: string, startCol: string, endCol: string) => {
        const window = windows.get(sheetName);
        if (!window) {
          return match;
        }
        return `${quote}${sheetName}${quote}!$${startCol}$${window.start}:$${endCol}$${window.end}`;
      },
    );
    writePart(parts, partName, patched);
  }
}

function writeMetadataSheet(parts: XlsxParts, model: ReportModel): void {
  const { meta } = model;
  const values = new Map<string, CellValue>([
    ['Schema Version', text(meta.schemaVersion)],
    ['Extension Version', text(meta.extensionVersion)],
    ['Generated At', num(excelSerialDateTime(meta.generatedAt))],
    ['Timezone', text(meta.timezone)],
    ['Range Start', meta.rangeStart ? num(excelSerialDate(meta.rangeStart)) : text('—')],
    ['Range End', meta.rangeEnd ? num(excelSerialDate(meta.rangeEnd)) : text('—')],
    ['Sessions', num(meta.sessions)],
    ['Workspace Paths', text(meta.shortenWorkspacePaths ? 'Shortened' : 'Full')],
    ['Prompt Content Included', text('No')],
    ['Date Range', text(meta.dateRangeLabel)],
  ]);

  const range = readTableRange(readPart(parts, METADATA_TABLE));
  let sheetXml = readPart(parts, METADATA_SHEET);

  for (let row = range.headerRow + 1; row <= range.lastDataRow; row++) {
    const rowXml = findRow(sheetXml, row);
    const key = getCellText(rowXml, `A${row}`);
    const value = key ? values.get(key) : undefined;
    if (!value) {
      continue;
    }
    const replacement = renderRow(rowXml, row, { B: value });
    sheetXml = sheetXml.replace(rowXml, () => replacement);
  }

  writePart(parts, METADATA_SHEET, sheetXml);
}

function formatDay(date?: Date): string {
  if (!date) {
    return '—';
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function writeDashboardSheet(parts: XlsxParts, model: ReportModel, dailyRows: number): void {
  const { meta } = model;
  let sheetXml = readPart(parts, DASHBOARD_SHEET);

  sheetXml = setCellText(
    sheetXml,
    'A3',
    `Range: ${meta.dateRangeLabel} • ${formatDay(meta.rangeStart)} → ${formatDay(meta.rangeEnd)}`
    + ` • Generated ${formatDay(meta.generatedAt)} ${meta.timezone}`
    + ` • Extension ${meta.extensionVersion} • Schema ${meta.schemaVersion}`,
  );

  const chartNote = dailyRows > DAILY_CHART_WINDOW
    ? `Daily Token Usage shows the most recent ${DAILY_CHART_WINDOW} of ${dailyRows} days; the DailyData sheet holds every day.`
    : 'Daily Token Usage shows every day in the DailyData sheet.';

  sheetXml = setCellText(
    sheetXml,
    'A55',
    `${chartNote} Model, repository and workspace charts rank the top ${TOP_N_CHART_ROWS} rows by total tokens.`
    + ' Models and DailyData include metered columns when debug-log coverage is available.'
    + ' Aggregate counts only — no prompt text or source code is included.',
  );

  // Cached results came from the template's sample data. Blank beats stale: the workbook is
  // saved with fullCalcOnLoad so every viewer recomputes these on open.
  writePart(parts, DASHBOARD_SHEET, stripCachedFormulaValues(sheetXml));
}

export function buildExcelReport(templateBytes: Uint8Array, model: ReportModel): Uint8Array {
  const parts = readXlsx(templateBytes);
  normalizeTemplate(parts);

  const modelTokens = sum(model.models.map(m => m.promptTokens + m.outputTokens));
  const meteredModelRounds = sum(model.models.map(m => m.meteredRounds ?? 0));
  const meteredModelInput = sum(model.models.map(m => m.meteredInputTokens ?? 0));
  const meteredModelOutput = sum(model.models.map(m => m.meteredOutputTokens ?? 0));
  const meteredModelCached = sum(model.models.map(m => m.meteredCachedTokens ?? 0));
  const meteredModelCredits = sum(model.models.map(m => m.meteredCredits ?? 0));
  const meteredModelCoveragePct = meteredModelRounds > 0
    ? model.models.reduce((acc, m) => acc + ((m.meteredCoveragePct ?? 0) * (m.meteredRounds ?? 0)), 0) / meteredModelRounds
    : 0;
  const hasMeteredModels = model.models.some(m => m.meteredRounds !== undefined);

  const models = writeDataSheet(parts, MODELS, model.models.length, (index, row, last) => {
    const m = model.models[index];
    if (!m) {
      return {
        A: text('—'),
        B: num(0),
        C: num(0),
        D: num(0),
        E: formula(`C${row}+D${row}`, 0),
        F: num(0),
        G: num(0),
        H: formula(`E${row}/SUM($E$5:$E$${last})`, 0),
        ...BLANK_METERED,
      };
    }
    const tokens = m.promptTokens + m.outputTokens;
    const rowValues: RowValues = {
      A: text(m.model),
      B: num(m.requests),
      C: num(m.promptTokens),
      D: num(m.outputTokens),
      E: formula(`C${row}+D${row}`, tokens),
      F: num(m.premiumUnits),
      G: num(m.credits),
      H: formula(`E${row}/SUM($E$5:$E$${last})`, modelTokens > 0 ? tokens / modelTokens : 0),
      ...BLANK_METERED,
    };

    if (m.meteredRounds !== undefined) { rowValues.I = num(m.meteredRounds); }
    if (m.meteredInputTokens !== undefined) { rowValues.J = num(m.meteredInputTokens); }
    if (m.meteredOutputTokens !== undefined) { rowValues.K = num(m.meteredOutputTokens); }
    if (m.meteredCachedTokens !== undefined) { rowValues.L = num(m.meteredCachedTokens); }
    if (m.meteredCredits !== undefined) { rowValues.M = num(m.meteredCredits); }
    if (m.meteredCoveragePct !== undefined) { rowValues.N = num(m.meteredCoveragePct); }

    return rowValues;
  }, {
    B: cached(sum(model.models.map(m => m.requests))),
    C: cached(sum(model.models.map(m => m.promptTokens))),
    D: cached(sum(model.models.map(m => m.outputTokens))),
    E: cached(modelTokens),
    F: cached(sum(model.models.map(m => m.premiumUnits))),
    G: cached(sum(model.models.map(m => m.credits))),
    H: cached(model.models.length > 0 ? 1 : 0),
    ...(hasMeteredModels
      ? {
        I: num(meteredModelRounds),
        J: num(meteredModelInput),
        K: num(meteredModelOutput),
        L: num(meteredModelCached),
        M: num(meteredModelCredits),
        N: num(meteredModelCoveragePct),
      }
      : BLANK_METERED),
  }, MODELS_METERED_HEADERS);

  const repoTokens = sum(model.repos.map(r => r.promptTokens + r.outputTokens));
  const repos = writeDataSheet(parts, REPOS, model.repos.length, (index, row, last) => {
    const r = model.repos[index];
    if (!r) {
      return { A: text('—'), B: num(0), C: num(0), D: num(0), E: formula(`C${row}+D${row}`, 0), F: formula(`E${row}/SUM($E$5:$E$${last})`, 0), G: num(0), H: num(0), I: text('—') };
    }
    const tokens = r.promptTokens + r.outputTokens;
    return {
      A: text(r.repository),
      B: num(r.requests),
      C: num(r.promptTokens),
      D: num(r.outputTokens),
      E: formula(`C${row}+D${row}`, tokens),
      F: formula(`E${row}/SUM($E$5:$E$${last})`, repoTokens > 0 ? tokens / repoTokens : 0),
      G: num(r.premiumUnits),
      H: num(r.credits),
      I: text(r.topModel),
    };
  }, {
    B: cached(sum(model.repos.map(r => r.requests))),
    C: cached(sum(model.repos.map(r => r.promptTokens))),
    D: cached(sum(model.repos.map(r => r.outputTokens))),
    E: cached(repoTokens),
    F: cached(model.repos.length > 0 ? 1 : 0),
    G: cached(sum(model.repos.map(r => r.premiumUnits))),
    H: cached(sum(model.repos.map(r => r.credits))),
  });

  const workspaceTokens = sum(model.workspaces.map(w => w.promptTokens + w.outputTokens));
  const workspaces = writeDataSheet(parts, WORKSPACES, model.workspaces.length, (index, row, last) => {
    const w = model.workspaces[index];
    if (!w) {
      return { A: text('—'), B: num(0), C: num(0), D: num(0), E: formula(`C${row}+D${row}`, 0), F: num(0), G: num(0), H: text('—'), I: formula(`E${row}/SUM($E$5:$E$${last})`, 0) };
    }
    const tokens = w.promptTokens + w.outputTokens;
    return {
      A: text(w.workspace),
      B: num(w.requests),
      C: num(w.promptTokens),
      D: num(w.outputTokens),
      E: formula(`C${row}+D${row}`, tokens),
      F: num(w.premiumUnits),
      G: num(w.credits),
      H: text(w.topModel),
      I: formula(`E${row}/SUM($E$5:$E$${last})`, workspaceTokens > 0 ? tokens / workspaceTokens : 0),
    };
  }, {
    B: cached(sum(model.workspaces.map(w => w.requests))),
    C: cached(sum(model.workspaces.map(w => w.promptTokens))),
    D: cached(sum(model.workspaces.map(w => w.outputTokens))),
    E: cached(workspaceTokens),
    F: cached(sum(model.workspaces.map(w => w.premiumUnits))),
    G: cached(sum(model.workspaces.map(w => w.credits))),
    I: cached(model.workspaces.length > 0 ? 1 : 0),
  });

  const daily = writeDataSheet(parts, DAILY, model.daily.length, (index) => {
    const d = model.daily[index];
    if (!d) {
      return {
        A: num(0),
        B: num(0),
        C: num(0),
        D: num(0),
        E: num(0),
        F: num(0),
        G: num(0),
        H: num(0),
        ...BLANK_METERED,
      };
    }
    const rowValues: RowValues = {
      A: num(excelSerialDate(d.date)),
      B: num(d.requests),
      C: num(d.promptTokens),
      D: num(d.outputTokens),
      E: num(d.toolRounds),
      F: num(d.premiumUnits),
      G: num(d.credits),
      H: num(d.sessions),
      ...BLANK_METERED,
    };

    if (d.meteredRounds !== undefined) { rowValues.I = num(d.meteredRounds); }
    if (d.meteredInputTokens !== undefined) { rowValues.J = num(d.meteredInputTokens); }
    if (d.meteredOutputTokens !== undefined) { rowValues.K = num(d.meteredOutputTokens); }
    if (d.meteredCachedTokens !== undefined) { rowValues.L = num(d.meteredCachedTokens); }
    if (d.meteredCredits !== undefined) { rowValues.M = num(d.meteredCredits); }
    if (d.meteredCoveragePct !== undefined) { rowValues.N = num(d.meteredCoveragePct); }

    return rowValues;
  }, {}, DAILY_METERED_HEADERS);

  const topN = (last: number) => ({ start: 5, end: Math.max(5, Math.min(4 + TOP_N_CHART_ROWS, last)) });
  patchChartRanges(parts, new Map([
    ['DailyData', { start: Math.max(5, daily.lastDataRow - DAILY_CHART_WINDOW + 1), end: daily.lastDataRow }],
    ['Models', topN(models.lastDataRow)],
    ['Repos', topN(repos.lastDataRow)],
    ['Workspaces', topN(workspaces.lastDataRow)],
  ]));

  writeMetadataSheet(parts, model);
  writeDashboardSheet(parts, model, model.daily.length);

  return writeXlsx(parts);
}
