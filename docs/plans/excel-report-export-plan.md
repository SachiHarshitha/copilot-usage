# Excel Report Export — Implementation Plan

**Feature:** "Download report" button on the Global Dashboard that fills the shipped
`.xlsx` template with live usage data and saves it to disk.

**Template analysed:** `reference/promptstreak_excel_export_template.xlsx`
**Target:** `apps/vscode-extension`

---

## 1. Template analysis (what we actually have)

### 1.1 Package structure

The template is a plain OOXML package with **no `sharedStrings` entries** (all text is
written as inline strings), which makes programmatic rewriting much simpler.

| Part | Purpose |
| --- | --- |
| `xl/workbook.xml` | 6 sheets: `Dashboard`, `Models`, `Repos`, `Workspaces`, `DailyData`, `Metadata` |
| `xl/worksheets/sheet1..6.xml` | Sheet data in the same order as above |
| `xl/tables/table1..6.xml` | `ModelsTable`, `ReposTable`, `WorkspacesTable`, `DailyUsageTable`, `ExportMetadataTable`, `TableContract` |
| `xl/drawings/drawing1.xml` | Anchors the 4 charts on the `Dashboard` sheet |
| `xl/drawings/charts/chart1..4.xml` | Daily Token Usage, Model Distribution, Top Repositories, Top Workspaces |
| `xl/styles.xml` | 17 KB of styles — the dark theme, number formats, data-bar colours |
| `xl/sharedStrings.xml` | Empty (`<sst/>`) — inline strings used throughout |

### 1.2 Table ranges and columns (current template)

| Table | Sheet | Range | Data rows | Columns |
| --- | --- | --- | --- | --- |
| `ModelsTable` | Models (`sheet2`) | `A4:H19` | 15 | Model, Requests, Prompt Tokens, Output Tokens, Tokens, Premium Units, Credits, Share |
| `ReposTable` | Repos (`sheet3`) | `A4:I18` | 14 | Repository, Attributed Requests, Prompt Tokens, Output Tokens, Total Tokens, Share, Premium Units, Credits, Top Model |
| `WorkspacesTable` | Workspaces (`sheet4`) | `A4:I34` | 30 | Workspace, Requests, Prompt Tokens, Output Tokens, Total Tokens, Premium Units, Credits, Top Model, Token Share |
| `DailyUsageTable` | DailyData (`sheet5`) | `A4:H44` | 40 | Date, Requests, Prompt Tokens, Output Tokens, Tool Rounds, Premium Units, Credits, Sessions |
| `ExportMetadataTable` | Metadata (`sheet6`) | `A4:C14` | 10 | Key, Value, Description |
| `TableContract` | Metadata (`sheet6`) | `A18:D23` | 5 | documentation only — never touched by the exporter |

### 1.3 Everything that is derived (no data writes needed)

The `Dashboard` sheet contains **zero literal data**. Every KPI is a formula over the
tables, e.g.:

- `A5 = SUM(ModelsTable[Requests])`, `E5 = SUM(ModelsTable[Prompt Tokens])`,
  `I5 = SUM(ModelsTable[Output Tokens])`, `M5 = SUM(DailyUsageTable[Tool Rounds])`
- `A10 = SUM(ModelsTable[Premium Units])`, `E10 = SUM(ModelsTable[Credits])`,
  `I10 = ROWS(WorkspacesTable[Workspace])`, `M10 = SUM(DailyUsageTable[Sessions])`
- The `≈ n/mo` sub-labels derive the month count from
  `MAX(DailyUsageTable[Date]) - MIN(DailyUsageTable[Date])`

Because these are structured references, **the Dashboard sheet needs no rewriting at all**
as long as the four data tables keep their names and header labels. The only Dashboard cell
we touch is the subtitle `A3`.

In-sheet derived columns that must be regenerated (they use *absolute* ranges, not structured
references, so they break when row counts change):

| Cell | Formula in template | Notes |
| --- | --- | --- |
| `Models!E5:E19` | `=C{r}+D{r}` | Tokens = prompt + output |
| `Models!H5:H19` | `=E{r}/SUM($E$5:$E$19)` | Share |
| `Models!B21:H21` | `=SUM(ModelsTable[...])` | Total row, 2 rows below table end |
| `Repos!E5:E18` | `=C{r}+D{r}` | Total tokens |
| `Repos!F5:F18` | `=C{r}/SUM($C$5:$C$18)` | **Share is prompt-token share — see §2.3** |
| `Repos!B20:H20` | `=SUM(ReposTable[...])` | Total row |
| `Workspaces!E5:E34` | `=C{r}+D{r}` | Total tokens |
| `Workspaces!I5:I34` | `=E{r}/SUM($E$5:$E$34)` | Token share |
| `Workspaces!B36:I36` | `=SUM(WorkspacesTable[...])` | Total row |

### 1.4 Chart series ranges (must be patched)

| Chart | Series | Range |
| --- | --- | --- |
| `chart1.xml` Daily Token Usage | cat / Prompt / Output | `'DailyData'!$A$5:$A$44`, `$C$5:$C$44`, `$D$5:$D$44` |
| `chart2.xml` Model Distribution | cat / Token Share | `'Models'!$A$5:$A$12`, `$H$5:$H$12` |
| `chart3.xml` Top Repositories | cat / Prompt Tokens | `'Repos'!$A$5:$A$12`, `$C$5:$C$12` |
| `chart4.xml` Top Workspaces | cat / Prompt Tokens | `'Workspaces'!$A$5:$A$12`, `$C$5:$C$12` |

Charts 2–4 are deliberately **top-8** views. Chart 1 spans the whole daily table.

### 1.5 Other row-count-sensitive ranges

| Sheet | Element | Template value |
| --- | --- | --- |
| Models | `<x:conditionalFormatting sqref="H5:H19">` | data bar on Share |
| Repos | `<x:conditionalFormatting sqref="F5:F18">` | data bar on Share |
| Workspaces | `<x:conditionalFormatting sqref="I5:I34">` | data bar on Token Share |
| all | `<x:mergeCells>` | only rows 1–2 (titles) — **not** affected by row counts |
| all | `<x:cols>` | column widths — unaffected |

There is no `<x:dimension>` element in the template sheets, and no `<x:autoFilter>`, which
removes two classes of patching work.

---

## 2. Gap analysis — template vs. real extension data

The template was built from a mock dataset. Three of the four data tables ask for fields the
extension does not currently compute.

### 2.1 Models — `ModelStats` is missing the prompt/output split

```ts
// src/core/types.ts (current)
export interface ModelStats {
  modelId: string;
  requests: number;
  totalTokens: number;   // only the sum
  premium: number;
  credits: number;
}
```

Template needs `Prompt Tokens` **and** `Output Tokens` separately (columns C and D; `Tokens`
in column E is a formula `=C+D`).

**Change:** add `promptTokens` and `outputTokens` to `ModelStats`, accumulate them in
`computeModelStats()` in `src/core/aggregator.ts`. `totalTokens` stays for the existing
webview table, so this is additive and non-breaking.

### 2.2 Repos — `RepoAttributionRow` is missing credits

```ts
// src/core/repoAttribution.ts (current)
export interface RepoAttributionRow {
  id: string; displayName: string;
  workspaceId?: string; workspacePath?: string;
  remoteUrl?: string; remoteSlug?: string;
  requests: number; promptTokens: number; outputTokens: number;
  premiumRequests: number; topModel: string;
}
```

Template column H is `Credits`.

**Change:** add `credits: number` to `RepoAttributionRow` and accumulate weighted credits in
`computeRepoAttributionStats()` using the same `creditsForRequest()` helper the other
aggregators use, multiplied by the attribution weight (identical to how `promptTokens` is
already weighted).

### 2.3 Repos — the `Share` formula does not match the dashboard's definition

Template: `Repos!F5 = C5/SUM($C$5:$C$18)` — that is **prompt-token share**.
Extension webview: `share = (promptTokens + outputTokens) / totalTokens` — **total-token share**.

**Template adjustment:** change the generated formula to `=E{r}/SUM($E$5:$E$<last>)` so the
Excel report agrees with the on-screen dashboard. (`ReposTable[Share]` still sums to 100%.)

### 2.4 DailyData — `DailyStats` is missing 4 of 8 columns

```ts
// src/core/types.ts (current)
export interface DailyStats {
  date: string; promptTokens: number; outputTokens: number; requests: number;
}
```

Template needs additionally: `Tool Rounds`, `Premium Units`, `Credits`, `Sessions`.

**Change:** extend `DailyStats` with `toolCallRounds`, `premium`, `credits`, `sessions` and
extend `computeDailyStats(events, rates, files?)`:

- `toolCallRounds` — sum `e.toolCallRounds`
- `premium` — `getMultiplier(e.modelId, e.timestampMs)` when the event has tokens (same rule
  as `computeKpis`)
- `credits` — `creditsForRequest(...)`
- `sessions` — count of **distinct `chatSessionId`s that have at least one event on that day**

`computeDailyStats` currently takes only `events`. Add optional params with defaults so the
existing webview call sites keep compiling.

> **Known template inconsistency:** `Dashboard!M10 = SUM(DailyUsageTable[Sessions])`
> double-counts sessions that span multiple days, so it will not match
> `kpis.sessionCount`. **Template adjustment:** repoint `M10` at the Metadata sheet value
> (`=INDEX(ExportMetadataTable[Value],MATCH("Sessions",ExportMetadataTable[Key],0))`) so the
> workbook shows the same session count as the dashboard.

### 2.5 Workspaces — clean match

`WorkspaceStats` already provides workspacePath, requests, promptTokens, outputTokens,
premium, credits, topModel. Columns E (total) and I (share) are formulas. **No aggregator
change needed.**

### 2.6 Row-count reality check

| Table | Template rows | Realistic rows | Action |
| --- | --- | --- | --- |
| Models | 15 | 5–40 | dynamic, all rows |
| Repos | 14 | 5–100+ | dynamic, all rows (**no** cap, **no** "Other repositories" roll-up) |
| Workspaces | 30 | 10–300+ | dynamic, all rows |
| DailyData | 40 | up to 730 | dynamic, all rows; chart windowed to 90 points → see §5.4 |

**Decided:** export everything. The template's sample `Other repositories` row is an artefact
of the mock dataset and is dropped.

---

## 3. Library decision (needs approval — new dependency)

Per `.github/copilot-instructions.md`, new dependencies require sign-off. Three options:

| Option | Charts survive? | Formulas survive? | Styles survive? | Verdict |
| --- | --- | --- | --- | --- |
| **ExcelJS** | ❌ dropped on read→write | partial | mostly | **Rejected** — destroys all 4 charts and the whole point of the template |
| **SheetJS (`xlsx`)** | ❌ dropped | partial | ❌ community build drops most styling | **Rejected** |
| **Zip-level OOXML patching** | ✅ untouched | ✅ | ✅ | **Recommended** |

Zip-level patching means: unzip the template, rewrite only `<x:sheetData>` for sheets 2–6 plus
a handful of `ref`/`sqref`/`<c:f>` attributes, re-zip. Every part we do not touch is copied
byte-for-byte, so styles, theme, drawings and charts are guaranteed intact.

**Decided: `fflate`.** ~12 KB, zero transitive dependencies, MIT, synchronous
`unzipSync` / `zipSync`, bundles cleanly with esbuild for `platform: 'node'`. It is
battle-tested and the fastest pure-JS option; the alternative (hand-rolled ZIP container
parsing on top of Node's `zlib`) would save a dependency but means owning and testing code
that is a solved problem. Workbook size is ~250 KB, so raw throughput is irrelevant either way.

---

## 4. File layout

```
apps/vscode-extension/
  resources/
    report-template.xlsx          NEW — the shipped template (adjusted per §2.3, §2.4)
  src/
    core/
      aggregator.ts               MODIFIED — ModelStats + DailyStats fields
      types.ts                    MODIFIED — interface additions
      repoAttribution.ts          MODIFIED — credits field
    export/
      zip.ts                      NEW — unzip/zip (fflate wrapper or hand-rolled)
      xml.ts                      NEW — escaping, cell/row builders, A1 helpers, date serials
      workbookPatch.ts            NEW — sheetData rewrite + range patching primitives
      reportModel.ts              NEW — ReportModel type + buildReportModel()
      excelReport.ts              NEW — buildExcelReport(templateBytes, model): Uint8Array
      privacy.ts                  NEW — shortenWorkspacePath(), redaction policy
    views/
      panels.ts                   MODIFIED — button + postMessage + handler
    extension.ts                  MODIFIED — register copilot-usage.exportExcelReport
    test/
      export.xml.test.ts          NEW
      export.workbookPatch.test.ts NEW
      export.reportModel.test.ts  NEW
      export.excelReport.test.ts  NEW — round-trip integrity
  package.json                    MODIFIED — command + settings (+ fflate if option A)
```

`.vscodeignore` does not exclude `resources/**`, so the template ships in the VSIX with no
packaging change. `esbuild.js` needs **no** change — the template is read at runtime from
`vscode.Uri.joinPath(extensionUri, 'resources', 'report-template.xlsx')`, not bundled.

---

## 5. Implementation detail

### 5.1 `ReportModel` — the single contract between data and workbook

```ts
export interface ReportModel {
  meta: {
    schemaVersion: string;        // '1.0.0'
    templateVersion: string;      // read back from Metadata!B6
    extensionVersion: string;     // from package.json via extension context
    generatedAt: Date;
    timezone: string;             // Intl.DateTimeFormat().resolvedOptions().timeZone + offset
    rangeStart?: Date;
    rangeEnd?: Date;
    dateRangeLabel: string;       // 'all' | '30d' | ...
    sessions: number;             // kpis.sessionCount (authoritative)
    workspacePathsShortened: boolean;
    promptContentIncluded: false; // always
  };
  models:     Array<{ model: string; requests: number; promptTokens: number; outputTokens: number; premiumUnits: number; credits: number }>;
  repos:      Array<{ repository: string; requests: number; promptTokens: number; outputTokens: number; premiumUnits: number; credits: number; topModel: string }>;
  workspaces: Array<{ workspace: string; requests: number; promptTokens: number; outputTokens: number; premiumUnits: number; credits: number; topModel: string }>;
  daily:      Array<{ date: Date; requests: number; promptTokens: number; outputTokens: number; toolRounds: number; premiumUnits: number; credits: number; sessions: number }>;
}
```

`buildReportModel(kpis, models, wsStats, repoStats, daily, meta, opts)` is a **pure function**
— no `vscode` import — so it is unit-testable without the electron harness. It handles
sorting and path shortening. No capping and no roll-up rows: every row is exported.

Note the model carries **no** `tokens`/`share`/`total` fields: those are Excel formulas and are
generated by the writer, not by the aggregator.

### 5.2 Sheet rewriting algorithm

For each of Models / Repos / Workspaces / DailyData:

1. **Harvest styles from the template.** Parse the template's `<x:sheetData>` once and record,
   per column, the `s="…"` style index of the first data row (row 5) and of the total row.
   Also keep rows 1–4 (title, subtitle, blank, header) verbatim.
2. **Emit new rows.** Row 5 … `4 + n`, reusing the harvested per-column style index so the
   dark theme, number formats and the `0,0x` premium format survive. Cell kinds:
   - inline string → `<x:c r="A5" s="12" t="inlineStr"><x:is><x:t>…</x:t></x:is></x:c>`
   - number → `<x:c r="B5" s="13"><x:v>862</x:v></x:c>`
   - formula → `<x:c r="E5" s="14"><x:f>C5+D5</x:f></x:c>` (no cached `<x:v>`; Excel and
     LibreOffice recalculate on open — confirm `<x:calcPr fullCalcOnLoad="1"/>` is present in
     `workbook.xml`, and add it if not)
   - date → serial number + the template's date style: `(utcMidnight - Date.UTC(1899,11,30)) / 86400000`
3. **Emit the blank spacer row and the total row** at `4 + n + 2`, rewriting the structured-
   reference SUM formulas (these do not depend on row count, only their position moves).
4. **Patch the absolute ranges** in the derived columns to `$5:$<4+n>`.
5. **Patch the sibling parts:**
   - `xl/tables/tableN.xml` → `ref="A4:H<4+n>"`
   - `<x:conditionalFormatting sqref="H5:H<4+n>">`
   - `xl/drawings/charts/chartN.xml` → every `<c:f>` end row
6. Leave `<x:cols>`, `<x:mergeCells>`, `<x:pageMargins>`, `<x:tableParts>`, `<x:extLst>`
   untouched.

Implementation style: **string splicing on well-known anchors**, not a DOM. The template is
generated by a single writer, its markup is stable, and we control it — a full XML parser is
unnecessary complexity. Every splice target is asserted at runtime; if an anchor is missing the
export fails loudly with "report template is corrupt or out of date" rather than producing a
broken workbook.

### 5.3 Metadata sheet

Rewrite `ExportMetadataTable` rows by matching the `Key` column (per the template's own
contract note), keeping the `Description` column verbatim:

| Key | Value written |
| --- | --- |
| Schema Version | `1.0.0` |
| Template Version | passthrough from the template |
| Extension Version | `context.extension.packageJSON.version` |
| Generated At | Excel serial date-time, local |
| Timezone | `Europe/Berlin (+02:00)`-style string from `Intl` |
| Range Start / Range End | Excel serial dates of the filtered event window |
| Sessions | `kpis.sessionCount` |
| Workspace Paths | `Shortened` \| `Full` |
| Prompt Content Included | `No` (hard-coded) |

One new row is added to the template: **Date Range** (`30d`, `all`, …). No row-cap row is
needed since every row is exported.

### 5.4 Daily rows and chart readability

`chart1` plots every daily row. With `dateRange: 'all'` a heavy user produces hundreds of
points and the chart becomes unreadable.

**Decided:** write **all** daily rows to `DailyUsageTable` (the data must be complete — the
Dashboard KPIs sum it), but point `chart1`'s three `<c:f>` ranges at the **last 90 rows only**
when `n > 90`. `Dashboard!A55` (the existing wiring-note cell) is rewritten to state the chart
window so the reader knows the chart is a tail view of a complete table.

### 5.5 Privacy

- Workspace paths are shortened to `…/<parent>/<leaf>` by default (matches the template's
  sample data and the existing `shortPath()` in `panels.ts` — reuse it, do not reimplement).
- New setting `copilot-usage.export.shortenWorkspacePaths` (default `true`).
- Prompt text, file contents and repository remote URLs are **never** written. Only
  `displayName` goes into the Repository column.

---

## 6. UI wiring (mirrors the existing refresh pattern exactly)

**1. Button** — in `getDashboardHtml()`, in the `header-actions` div, next to the refresh
button:

```html
<button class="btn" onclick="exportReport()" title="Download Excel report">⤓ Report</button>
```

**2. Webview script** — next to the existing `refresh()` / `openSettings()` helpers:

```js
function exportReport() { vscode.postMessage({ command: 'exportReport' }); }
```

**3. Extension host** — in `DashboardPanel`'s `onDidReceiveMessage`:

```ts
if (msg.command === 'exportReport') { await this.exportReport(); }
```

**4. Data access.** `loadData()` currently computes `kpis / models / daily / wsStats /
repoStats` as locals and throws them away. Store the computed set in a private field
`private lastData?: DashboardData` at the end of `loadData()` so the export handler reuses the
exact numbers the user is looking at — **no recomputation**, no drift between screen and file.

**5. Command.** Also register `copilot-usage.exportExcelReport` in `extension.ts` and
`package.json → contributes.commands` (title *"Copilot Usage: Export Excel Report"*), so the
export is reachable from the Command Palette. The palette path opens/reuses the dashboard
panel first if no data is loaded.

### 6.1 Save flow

```ts
const uri = await vscode.window.showSaveDialog({
  defaultUri: vscode.Uri.joinPath(defaultFolder, `copilot-usage-${rangeLabel}-${stamp}.xlsx`),
  filters: { 'Excel Workbook': ['xlsx'] },
  saveLabel: 'Export report',
});
if (!uri) { return; }                              // user cancelled — silent
await vscode.workspace.fs.writeFile(uri, bytes);
```

Wrapped in `vscode.window.withProgress({ location: Notification, title: 'Building Excel report…' })`,
then a completion toast with **Open** (`vscode.open`) and **Reveal in Explorer**
(`revealFileInOS`) actions. `defaultFolder` = first workspace folder, falling back to
`os.homedir()`.

Error handling: any failure surfaces `vscode.window.showErrorMessage` with a short cause and
logs the full stack to the extension output channel. Empty dataset → the button is rendered
`disabled` and the command shows *"No Copilot usage data to export."*.

---

## 7. Template adjustments to make before wiring

These are edits to `reference/promptstreak_excel_export_template.xlsx`, which then becomes
`apps/vscode-extension/resources/report-template.xlsx`:

The guiding rule (decision 4): **the workbook follows the codebase, not the other way round.**
Where the template's mock semantics disagree with what the extension actually computes, the
template is corrected.

1. `Repos!F` share formula: `C/SUM($C$…)` → `E/SUM($E$…)`, so Share means total-token share
   exactly as the on-screen dashboard defines it (§2.3).
2. `Dashboard!M10` sessions KPI: `SUM(DailyUsageTable[Sessions])` → lookup of the Metadata
   `Sessions` value, so it equals `kpis.sessionCount` instead of double-counting multi-day
   sessions (§2.4).
3. Add a `Date Range` row to `ExportMetadataTable`.
4. Bump `Metadata!B6` Template Version from `0.1.0-test` to `1.0.0`.
5. Replace all sample data rows with **one** representative data row per table (the exporter
   harvests styles from row 5, so exactly one styled data row per table must remain).
6. Ensure `workbook.xml` carries `<x:calcPr fullCalcOnLoad="1"/>` so formulas recalc on open.
7. Drop the mock-only `Other repositories` row (decision 2 — everything is exported).
8. Verify the workbook opens cleanly in Excel, LibreOffice Calc and Google Sheets after the
   edits — this is the baseline the round-trip test asserts against.

These edits are applied by a committed, re-runnable script
(`scripts/build-report-template.mjs`) that reads `reference/promptstreak_excel_export_template.xlsx`
and writes `apps/vscode-extension/resources/report-template.xlsx`, so the transformation is
reproducible and reviewable rather than a hand-edited binary.

---

## 8. Testing (TDD, per repo standards)

| Test file | Asserts |
| --- | --- |
| `export.xml.test.ts` | XML escaping (`&`, `<`, `"`, control chars in workspace paths); A1 ↔ index round-trip; date → Excel serial for DST boundaries and epoch edge cases |
| `export.reportModel.test.ts` | sorting; path shortening; empty dataset; row totals equal the KPI totals |
| `export.workbookPatch.test.ts` | table `ref`, `sqref`, chart `<c:f>` and absolute SUM ranges all land on `4+n`; growing **and** shrinking relative to the template row count |
| `export.excelReport.test.ts` | full round trip on the real template: output unzips; `chart1..4.xml`, `styles.xml`, `theme1.xml`, `drawing1.xml` are **byte-identical** to the template; every table `ref` matches its sheet's row count; total-row formulas present; Metadata keys all populated |
| `aggregator.test.ts` (extend) | new `ModelStats` / `DailyStats` fields; daily `sessions` counts distinct sessions per day, not events |
| `repoAttribution.test.ts` (extend) | weighted `credits` sum equals `kpis.totalCredits` within rounding tolerance |

Run with the existing `npm test` (`@vscode/test-cli`). The pure-function tests need no
electron host but run in the same harness for consistency.

**Manual acceptance:** export with `dateRange` = `all` and `30d`, open in Excel — Dashboard
KPIs must equal the on-screen webview KPIs; all four charts render; no repair prompt.

---

## 9. Increments (each one lands independently, tests green)

| # | Increment | Verifiable outcome | Status |
| --- | --- | --- | --- |
| 1 | Aggregator field additions (§2.1, §2.2, §2.4) | new unit tests pass; webview unchanged | Done |
| 2 | Template adjustments (§7) + commit `resources/report-template.xlsx` | workbook opens clean in Excel/Calc/Sheets | Done |
| 3 | `xlsxPackage.ts` + `sheetXml.ts` primitives | unit tests; template unzips and re-zips byte-identical | Done |
| 4 | `reportModel.ts` | unit tests | Done |
| 5 | `excelReport.ts` workbook writer | round-trip test produces a valid workbook from a fixture model | Done |
| 6 | UI button, command, save dialog, progress, error paths | manual export works end to end | Done |
| 7 | Settings, README + CHANGELOG entries | docs match behaviour | Done |

**As shipped.** `workbookPatch.ts` was folded into `excelReport.ts` — the range patching is only
ever used by the writer, so a separate module would have been an abstraction with one caller.
Modules landed as `src/export/{xlsxPackage,sheetXml,reportModel,excelReport,exportCommand}.ts`,
with `exportCommand.ts` holding the only `vscode` import so the rest stays unit-testable.
The template resource is built from `reference/promptstreak_excel_export_template.xlsx` by
`scripts/build-report-template.mjs`, which fails loudly if any anchor it patches has moved.

---

## 10. Decisions (settled)

1. **ZIP approach** — `fflate`. Proven, tiny, zero transitive deps. §3
2. **Row caps** — none. Every model, repo, workspace and day is exported. §2.6
3. **Daily chart window** — `chart1` shows the last 90 days; the table still holds every row. §5.4
4. **Template** — the template is a reference only; it is corrected to match the codebase's
   real semantics and real available fields. §7
5. **Scope** — global `DashboardPanel` only. `WorkspacePanel` reuses the same plumbing later;
   nothing in `src/export/**` may depend on which panel invoked it.
