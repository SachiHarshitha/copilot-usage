// Builds the shipped Excel report template from the design reference workbook.
//
//   node scripts/build-report-template.mjs
//
// Input : <repo>/reference/promptstreak_excel_export_template.xlsx  (design reference, mock data)
// Output: apps/vscode-extension/resources/report-template.xlsx      (shipped with the VSIX)
//
// The reference workbook was authored against a mock dataset. This script applies the
// corrections that make it agree with what the extension actually computes, and leaves every
// other package part byte-for-byte untouched so styles, theme, drawings and charts survive.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');

const SOURCE = path.join(repoRoot, 'reference', 'promptstreak_excel_export_template.xlsx');
const TARGET = path.join(extensionRoot, 'resources', 'report-template.xlsx');

/** Replace exactly one occurrence, failing loudly if the anchor moved. */
function replaceOnce(text, needle, replacement, label) {
  const first = text.indexOf(needle);
  if (first === -1) {
    throw new Error(`[${label}] anchor not found: ${needle.slice(0, 120)}`);
  }
  if (text.indexOf(needle, first + needle.length) !== -1) {
    throw new Error(`[${label}] anchor is not unique: ${needle.slice(0, 120)}`);
  }
  return text.slice(0, first) + replacement + text.slice(first + needle.length);
}

function replaceAll(text, pattern, replacement, label) {
  const out = text.replace(pattern, replacement);
  if (out === text) {
    throw new Error(`[${label}] pattern matched nothing: ${pattern}`);
  }
  return out;
}

const parts = unzipSync(fs.readFileSync(SOURCE));
const xml = (name) => strFromU8(parts[name]);
const setXml = (name, text) => { parts[name] = strToU8(text); };

// ---------------------------------------------------------------------------
// 1. workbook.xml — force a full recalculation on open.
//    The Dashboard sheet is entirely formula driven and the exporter strips its cached
//    values, so the workbook must recalculate rather than trust what was last saved.
// ---------------------------------------------------------------------------
{
  let wb = xml('xl/workbook.xml');
  if (!wb.includes('calcPr')) {
    wb = replaceOnce(
      wb,
      '</x:workbook>',
      '<x:calcPr calcId="191029" fullCalcOnLoad="1" /></x:workbook>',
      'workbook.calcPr',
    );
  }
  setXml('xl/workbook.xml', wb);
}

// ---------------------------------------------------------------------------
// 2. Dashboard — the Sessions KPI.
//    SUM(DailyUsageTable[Sessions]) counts a session once per day it was active, so a
//    session spanning three days counted three times. The dashboard webview reports
//    distinct sessions, so read the authoritative value from the Metadata sheet instead.
// ---------------------------------------------------------------------------
{
  let s1 = xml('xl/worksheets/sheet1.xml');
  const sessionLookup = 'INDEX(ExportMetadataTable[Value],MATCH("Sessions",ExportMetadataTable[Key],0))';

  s1 = replaceOnce(
    s1,
    '<x:f>SUM(DailyUsageTable[Sessions])</x:f>',
    `<x:f>${sessionLookup}</x:f>`,
    'dashboard.sessionsKpi',
  );
  s1 = replaceOnce(
    s1,
    'TEXT(ROUND(SUM(DailyUsageTable[Sessions])/',
    `TEXT(ROUND(${sessionLookup}/`,
    'dashboard.sessionsPerMonth',
  );

  setXml('xl/worksheets/sheet1.xml', s1);
}

// ---------------------------------------------------------------------------
// 3. Repos — Share must mean total-token share.
//    The reference workbook divided prompt tokens by the prompt-token total, while the
//    dashboard defines a repository's share as (prompt + output) / total tokens.
// ---------------------------------------------------------------------------
{
  let s3 = xml('xl/worksheets/sheet3.xml');
  s3 = replaceAll(
    s3,
    /<x:f>C(\d+)\/SUM\(\$C\$5:\$C\$18\)<\/x:f>/g,
    (_m, row) => `<x:f>E${row}/SUM($E$5:$E$18)</x:f>`,
    'repos.shareFormula',
  );
  setXml('xl/worksheets/sheet3.xml', s3);
}

// ---------------------------------------------------------------------------
// 4. Charts 3 and 4 — plot total tokens, not prompt tokens.
//    "Top Repositories" / "Top Workspaces" rank rows by total tokens, so the bars must
//    measure the same thing the ranking does.
// ---------------------------------------------------------------------------
for (const [chart, sheet] of [['chart3', 'Repos'], ['chart4', 'Workspaces']]) {
  const name = `xl/drawings/charts/${chart}.xml`;
  let c = xml(name);
  c = replaceOnce(c, '<c:v>Prompt Tokens</c:v>', '<c:v>Total Tokens</c:v>', `${chart}.seriesName`);
  c = replaceOnce(c, `='${sheet}'!$C$5:$C$12`, `='${sheet}'!$E$5:$E$12`, `${chart}.valuesRef`);
  setXml(name, c);
}

// ---------------------------------------------------------------------------
// 5. Metadata — bump the template version and add the Date Range row.
// ---------------------------------------------------------------------------
{
  let s6 = xml('xl/worksheets/sheet6.xml');

  s6 = replaceOnce(s6, '<x:v>0.1.0-test</x:v>', '<x:v>1.0.0</x:v>', 'metadata.templateVersion');

  // Clone the styled row 14 into row 15, which is currently an empty filler row.
  const row14 = s6.match(/<x:row r="14"[\s\S]*?<\/x:row>/);
  if (!row14) { throw new Error('[metadata.row14] not found'); }
  const filler15 = s6.match(/<x:row r="15"[\s\S]*?<\/x:row>/);
  if (!filler15) { throw new Error('[metadata.row15] not found'); }

  const row15 = row14[0]
    .replace(/r="([A-P]?)14"/g, (_m, col) => `r="${col}15"`)
    .replace('<x:v>Prompt Content Included</x:v>', '<x:v>Date Range</x:v>')
    .replace('<x:v>No</x:v>', '<x:v>all</x:v>')
    .replace(
      '<x:v>Never include prompt text or source code in this aggregate export.</x:v>',
      '<x:v>Date range filter applied when the report was exported.</x:v>',
    );

  if (row15.includes('r="A14"')) { throw new Error('[metadata.row15] cell refs were not renumbered'); }

  s6 = s6.replace(filler15[0], row15);
  setXml('xl/worksheets/sheet6.xml', s6);

  let t5 = xml('xl/tables/table5.xml');
  t5 = replaceOnce(t5, 'ref="A4:C14"', 'ref="A4:C15"', 'metadata.tableRef');
  setXml('xl/tables/table5.xml', t5);
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, zipSync(parts, { level: 6 }));

console.log(`Wrote ${path.relative(repoRoot, TARGET)} (${fs.statSync(TARGET).size} bytes)`);
