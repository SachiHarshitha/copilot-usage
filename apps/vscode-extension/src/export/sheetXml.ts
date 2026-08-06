/**
 * SpreadsheetML row and cell primitives.
 *
 * These operate on the raw XML of the shipped template. Rows are rebuilt from a template row
 * so that every style index — including the filler cells that paint the sheet background out
 * to column P — is preserved exactly as the template author set it.
 */

export type CellValue =
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'formula'; formula: string; cached?: number }
  /** Keep the template cell's formula, replace only its cached result. */
  | { kind: 'cached'; value: number }
  /** Empty the cell but keep its style, so template sample data cannot leak through. */
  | { kind: 'blank' };

/** Column letter → cell value, e.g. `{ A: { kind: 'text', value: 'gpt-5' } }`. */
export type RowValues = Record<string, CellValue>;

const CELL_PATTERN = /<(?:x:)?c\b[^>]*\/>|<(?:x:)?c\b[^>]*>[\s\S]*?<\/(?:x:)?c>/g;
const FORMULA_PATTERN = /<(?:x:)?f\b[^>]*\/>|<(?:x:)?f\b[^>]*>[\s\S]*?<\/(?:x:)?f>/;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * The authored template uses the `x:` namespace prefix, but Excel rewrites worksheets with the
 * default namespace whenever the file is re-saved. Read and write whichever form a part uses.
 */
export function namespacePrefix(xml: string): string {
  return /<x:(?:worksheet|sheetData|row|c)\b/.test(xml) ? 'x:' : '';
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are illegal in XML 1.0 and can appear in pathological paths.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** Serialise a number for a `<x:v>` element without exponent notation or float noise. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(6)));
}

/** Excel serial for a calendar date, using the local-time calendar day. */
export function excelSerialDate(date: Date): number {
  const localMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (localMidnight - EXCEL_EPOCH_MS) / MS_PER_DAY;
}

/** Excel serial for a local date *and* time of day. */
export function excelSerialDateTime(date: Date): number {
  const local = Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(),
  );
  return (local - EXCEL_EPOCH_MS) / MS_PER_DAY;
}

/** `A1`-style reference for a column letter and 1-based row number. */
export function cellRef(column: string, row: number): string {
  return `${column}${row}`;
}

export function findRow(sheetXml: string, rowNumber: number): string {
  const match = sheetXml.match(new RegExp(`<(?:x:)?row r="${rowNumber}"[\\s\\S]*?</(?:x:)?row>`));
  if (!match) {
    throw new Error(`Report template is missing row ${rowNumber}.`);
  }
  return match[0];
}

function findCell(sheetXml: string, ref: string): string | undefined {
  const pattern = new RegExp(`<(?:x:)?c r="${ref}"(?:[^>]*\\/>|[^>]*>[\\s\\S]*?<\\/(?:x:)?c>)`);
  return sheetXml.match(pattern)?.[0] ?? undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function splitCells(rowXml: string): string[] {
  return rowXml.match(CELL_PATTERN) ?? [];
}

function attribute(cellXml: string, name: string): string | undefined {
  const match = cellXml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? match[1] : undefined;
}

function columnOf(cellXml: string): string {
  const ref = attribute(cellXml, 'r') ?? '';
  return ref.replace(/\d+$/, '');
}

function renderCell(column: string, rowNumber: number, style: string | undefined, value: CellValue, templateCell: string): string {
  const p = namespacePrefix(templateCell);
  const styleAttr = style === undefined ? '' : ` s="${style}"`;
  const ref = cellRef(column, rowNumber);

  switch (value.kind) {
    case 'blank':
      return `<${p}c r="${ref}"${styleAttr}/>`;
    case 'text':
      return `<${p}c r="${ref}"${styleAttr} t="inlineStr"><${p}is><${p}t xml:space="preserve">${escapeXml(value.value)}</${p}t></${p}is></${p}c>`;
    case 'number':
      return `<${p}c r="${ref}"${styleAttr} t="n"><${p}v>${formatNumber(value.value)}</${p}v></${p}c>`;
    case 'formula': {
      const cached = value.cached === undefined ? '' : `<${p}v>${formatNumber(value.cached)}</${p}v>`;
      return `<${p}c r="${ref}"${styleAttr} t="n"><${p}f>${escapeXml(value.formula)}</${p}f>${cached}</${p}c>`;
    }
    case 'cached': {
      const formula = templateCell.match(FORMULA_PATTERN);
      if (!formula) {
        throw new Error(`Report template cell ${ref} was expected to contain a formula.`);
      }
      return `<${p}c r="${ref}"${styleAttr} t="n">${formula[0]}<${p}v>${formatNumber(value.value)}</${p}v></${p}c>`;
    }
  }
}

/**
 * Rebuild a row at `rowNumber` from `templateRow`, substituting the supplied column values.
 * Cells with no supplied value keep their template content and are simply renumbered, which
 * is what preserves the background filler cells.
 */
export function renderRow(templateRow: string, rowNumber: number, values: RowValues = {}): string {
  const openTag = templateRow.match(/^<(x:)?row\b[^>]*>/);
  if (!openTag) {
    throw new Error('Report template row is malformed.');
  }

  const prefix = openTag[1] ?? '';
  const header = openTag[0].replace(/\br="\d+"/, `r="${rowNumber}"`);
  const cells = splitCells(templateRow).map(cell => {
    const column = columnOf(cell);
    const value = values[column];
    if (value) {
      return renderCell(column, rowNumber, attribute(cell, 's'), value, cell);
    }
    return cell.replace(/\br="[A-Z]+\d+"/, `r="${cellRef(column, rowNumber)}"`);
  });

  return `${header}${cells.join('')}</${prefix}row>`;
}

/** Replace the entire `<sheetData>` block of a worksheet. */
export function replaceSheetData(sheetXml: string, rowsXml: string): string {
  const pattern = /<(?:x:)?sheetData>[\s\S]*?<\/(?:x:)?sheetData>|<(?:x:)?sheetData\s*\/>/;
  if (!pattern.test(sheetXml)) {
    throw new Error('Report template worksheet has no sheetData block.');
  }
  const prefix = namespacePrefix(sheetXml);
  // A function replacement keeps `$` sequences inside the data from being read as backreferences.
  return sheetXml.replace(pattern, () => `<${prefix}sheetData>${rowsXml}</${prefix}sheetData>`);
}

/**
 * Drop cached results from every formula cell in a sheet so viewers must recalculate.
 * A blank cell is an obvious "not calculated yet"; a stale cached number is a silent lie.
 */
export function stripCachedFormulaValues(sheetXml: string): string {
  return sheetXml.replace(
    /(<(?:x:)?f\b[^>]*>[\s\S]*?<\/(?:x:)?f>|<(?:x:)?f\b[^>]*\/>)<(?:x:)?v>[\s\S]*?<\/(?:x:)?v>/g,
    (_match, formula: string) => formula,
  );
}

/** Replace the literal text of a single cell, e.g. a sheet subtitle. */
export function setCellText(sheetXml: string, ref: string, text: string): string {
  const cell = findCell(sheetXml, ref);
  if (!cell) {
    throw new Error(`Report template cell ${ref} was expected to contain literal text.`);
  }
  const column = ref.replace(/\d+$/, '');
  const rowNumber = Number(ref.slice(column.length));
  const replacement = renderCell(column, rowNumber, attribute(cell, 's'), { kind: 'text', value: text }, cell);
  return sheetXml.replace(cell, () => replacement);
}

/** Read the literal text of a cell, whether it is stored inline or as a plain value. */
export function getCellText(sheetXml: string, ref: string): string | undefined {
  const cell = findCell(sheetXml, ref);
  if (!cell) {
    return undefined;
  }
  const inline = cell.match(/<(?:x:)?is>[\s\S]*?<\/(?:x:)?is>/);
  if (inline) {
    const runs = [...inline[0].matchAll(/<(?:x:)?t\b[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)].map(m => m[1]);
    return decodeXml(runs.join(''));
  }
  const value = cell.match(/<(?:x:)?v>([\s\S]*?)<\/(?:x:)?v>/);
  return value ? decodeXml(value[1]) : undefined;
}
