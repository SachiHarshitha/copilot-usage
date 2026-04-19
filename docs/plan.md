## Plan: Single-Executable Copilot Usage Dashboard

Build a local-first analytics app that ingests Copilot usage logs incrementally (changed files only), stores normalized and aggregated data in DuckDB, serves a modern Plotly Dash dashboard with lightweight user-customizable layouts, and exports badge-ready metrics for GitHub README usage. Keep v1 simple by avoiding distributed services, avoiding a full query builder, and prioritizing deterministic local processing and packaging into one executable.

**Steps**
1. Phase 1 - Scope and runtime contract: finalize v1 behavior as `start app -> run incremental analysis -> open dashboard`, define local data directory, and define no-cloud/no-server requirement for core analytics. This is the baseline for all following steps.
2. Phase 2 - Data model and storage design (*depends on 1*): define DuckDB schema for `scan_runs`, `file_index`, `events_raw`, `events_norm`, `agg_daily_workspace_model`, `agg_session`, and `badge_metrics`. Define stable uniqueness keys for deduplication and append-only history retention.
3. Phase 3 - Incremental ingestion engine (*depends on 2*): implement candidate file discovery for Copilot log sources, compare with `file_index` by path + size + mtime, parse only new/changed files, soft-mark deleted files, and preserve previously ingested records.
4. Phase 4 - Normalization and estimators (*depends on 3*): normalize `promptTokens`, `outputTokens`, model identifiers, timestamps, workspace ownership, and request/session identifiers. Implement premium-request estimation using billable prompt count times effective model multiplier, separate from token volume.
5. Phase 5 - Aggregation pipeline (*depends on 4*): compute daily and session aggregates after each successful scan so dashboard reads pre-aggregated tables only. Include incremental aggregate refresh logic keyed by changed source files and affected date partitions.
6. Phase 6 - Dashboard v1 (*depends on 5*): implement Plotly Dash pages for KPI cards, token timeline, model mix, workspace table, and session drilldown. Keep filters simple (date range, workspace, model) and default to recent windows for responsiveness.
7. Phase 7 - User-custom layout without overengineering (*parallel with 6 after base charts exist*): add drag/resize layout mode with a small fixed widget catalog, persist layout JSON per user, and allow basic per-widget settings (metric/group/chart type). Do not add arbitrary SQL authoring in v1.
8. Phase 8 - Badge metric export (*depends on 5*): generate sanitized per-workspace or per-repo metrics JSON (token totals, premium estimate, top model, updated timestamp) suitable for Shields dynamic badges.
9. Phase 9 - Badge publishing and README integration (*depends on 8*): provide a minimal publisher path (GitHub Pages or gist-hosted JSON), template badge URLs, and guidance to embed badges in repo README files.
10. Phase 10 - Single executable packaging (*depends on 3, 6, 8*): package app with PyInstaller onefile, include Dash assets, ensure writable external app-data directory for database/cache/layouts, and provide startup modes (`analyze-only`, `dashboard-only`, `analyze-and-open`).
11. Phase 11 - Performance and reliability hardening (*depends on 3, 5, 10*): add parser backpressure/chunking, robust malformed-line handling, retry-safe ingestion transactions, and telemetry-free local logging for troubleshooting.
12. Phase 12 - Documentation and handoff (*depends on all prior phases*): ship concise user docs for first run, incremental behavior, history guarantees, badge setup, and executable upgrade/migration behavior.

**Relevant files**
- [scan-result.md](scan-result.md) - Source-of-truth research notes and assumptions already validated from local storage inspection.
- Workspace root application structure (to be created during implementation): ingestion module, analytics DB module, dashboard module, packaging config, and badge export module.
- User-local data directory (runtime, not in repo): DuckDB file, incremental file index state, and dashboard layout JSON state.

**Verification**
1. Functional ingestion: run initial scan on full dataset and verify normalized event counts, workspace counts, and aggregate tables are populated.
2. Incremental correctness: run scan twice without file changes and verify second run performs zero parsing and zero duplicate inserts.
3. Delta behavior: modify one source log file and verify only affected records/date partitions are reprocessed.
4. History integrity: delete or move a source file and verify historical analytics remain intact (no destructive backfill loss).
5. Dashboard responsiveness: validate common filtered views render within target local latency on large datasets.
6. Layout persistence: move/resize widgets, restart app, and verify layout/state restore correctly.
7. Premium estimate sanity: confirm estimator changes with model multiplier changes and remains independent of raw token totals.
8. Badge output validity: validate exported JSON conforms to Shields schema and renders correct badge text/color.
9. Packaged executable flow: run packaged binary on clean machine profile and validate `analyze -> dashboard` works without Python installed.
10. Upgrade safety: verify executable upgrade does not corrupt existing local DuckDB/index/layout files.

**Decisions**
- Included scope: local-first analytics, incremental file diff scanning, modern Dash UI, lightweight user customization, badge export pipeline, single executable distribution.
- Excluded scope (v1): cloud multi-tenant backend, role-based auth, arbitrary SQL builder, real-time websocket ingestion, and deep per-file attribution heuristics requiring unavailable session-folder mapping metadata.
- Attribution boundary (current evidence): workspace-level attribution is reliable; session-to-folder mapping is not currently recoverable from local metadata on this machine and is treated as optional future enhancement.
- Billing model assumption: premium request estimate is request-based with model multiplier, not token-based billing.

**Further Considerations**
1. Badge publishing target recommendation: GitHub Pages (simple static hosting) vs gist raw JSON (quick start) vs custom endpoint (maximum control).
2. Packaging baseline recommendation: start with PyInstaller onefile for simplicity; only switch to Nuitka if startup/perf constraints require it.
3. Optional v2 enhancement: add best-effort per-project split within a workspace using referenced file paths when direct session-folder mapping remains unavailable.
