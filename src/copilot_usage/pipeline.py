"""Orchestrate an incremental scan: discover → parse → ingest → aggregate → badges."""
from __future__ import annotations

import logging
import time
from typing import Callable

import duckdb

from copilot_usage.aggregator import rebuild_aggregates
from copilot_usage.badges import export_badges
from copilot_usage.discovery import (
    discover_jsonl_files,
    discover_legacy_json_files,
    get_changed_files,
    update_file_index,
)
from copilot_usage.ingest import ingest_parsed_file
from copilot_usage.parser import parse_jsonl, parse_legacy_json

log = logging.getLogger(__name__)

ProgressCallback = Callable[[str, float | None], None]  # (message, progress_pct)


def run_scan(
    con: duckdb.DuckDBPyConnection,
    *,
    storage_root=None,
    on_progress: ProgressCallback | None = None,
) -> dict:
    """Execute a full incremental scan pipeline. Returns stats dict."""
    t0 = time.perf_counter()

    def _emit(msg: str, pct: float | None = None):
        log.info(msg)
        if on_progress:
            on_progress(msg, pct)

    _emit("Starting scan…", 0)

    # 1. Start scan run
    con.execute("INSERT INTO scan_runs (files_checked, files_parsed) VALUES (0, 0)")
    scan_id = con.execute("SELECT MAX(scan_id) FROM scan_runs").fetchone()[0]

    # 2. Discover all JSONL files + legacy JSON files
    _emit("Discovering JSONL files…", 5)
    all_jsonl = discover_jsonl_files(storage_root)
    _emit(f"  Found {len(all_jsonl)} JSONL files", 10)

    _emit("Discovering legacy JSON files…", 12)
    all_legacy = discover_legacy_json_files(storage_root)
    _emit(f"  Found {len(all_legacy)} legacy JSON files", 15)
    all_files = all_jsonl + all_legacy

    # 3. Upsert workspaces (even if no changed files, we still want the mapping)
    _emit("Registering workspaces…", 18)
    seen_ws: set[str] = set()
    for ws_id, ws_path, _ in all_files:
        if ws_id not in seen_ws:
            con.execute(
                """INSERT INTO workspaces (workspace_id, workspace_path)
                   VALUES (?, ?)
                   ON CONFLICT (workspace_id) DO UPDATE SET workspace_path = excluded.workspace_path""",
                [ws_id, ws_path],
            )
            seen_ws.add(ws_id)

    # 4. Incremental diff
    _emit("Calculating incremental diff…", 20)
    changed, deleted = get_changed_files(con, all_files)
    _emit(f"  {len(changed)} changed, {len(deleted)} deleted", 25)

    # 5. Parse + ingest changed files
    total_events = 0
    parsed_paths = []
    n_files = len(changed)
    for i, (ws_id, ws_path, path) in enumerate(changed):
        pct = 25 + (i / max(n_files, 1)) * 55  # 25% → 80%
        _emit(f"Parsing [{i + 1}/{n_files}] {path.name}", pct)
        if path.suffix == ".json":
            pf = parse_legacy_json(path, ws_id, ws_path)
        else:
            pf = parse_jsonl(path, ws_id, ws_path)
        n = ingest_parsed_file(con, pf)
        total_events += n
        parsed_paths.append(path)

    # 6. Update file index
    _emit("Updating file index…", 82)
    update_file_index(con, parsed_paths, deleted, scan_id)

    # 7. Rebuild aggregates
    _emit("Rebuilding aggregates…", 88)
    rebuild_aggregates(con)

    # 8. Export badges
    _emit("Exporting badges…", 94)
    export_badges(con)

    # 9. Finalize scan run
    elapsed = time.perf_counter() - t0
    con.execute(
        """UPDATE scan_runs
           SET finished_at = now(), files_checked = ?, files_parsed = ?
           WHERE scan_id = ?""",
        [len(all_files), len(changed), scan_id],
    )

    stats = {
        "scan_id": scan_id,
        "files_total": len(all_files),
        "files_jsonl": len(all_jsonl),
        "files_legacy_json": len(all_legacy),
        "files_parsed": len(changed),
        "files_deleted": len(deleted),
        "events_ingested": total_events,
        "elapsed_s": round(elapsed, 2),
    }
    _emit(
        f"Scan #{scan_id} complete: {len(changed)} files parsed, "
        f"{total_events} events ingested in {elapsed:.2f}s",
        100,
    )
    return stats
