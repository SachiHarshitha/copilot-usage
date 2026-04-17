"""Orchestrate an incremental scan: discover → parse → ingest → aggregate → badges."""
from __future__ import annotations

import logging
import time

import duckdb

from copilot_usage.aggregator import rebuild_aggregates
from copilot_usage.badges import export_badges
from copilot_usage.discovery import (
    discover_jsonl_files,
    get_changed_files,
    update_file_index,
)
from copilot_usage.ingest import ingest_parsed_file
from copilot_usage.parser import parse_jsonl

log = logging.getLogger(__name__)


def run_scan(con: duckdb.DuckDBPyConnection) -> dict:
    """Execute a full incremental scan pipeline. Returns stats dict."""
    t0 = time.perf_counter()

    # 1. Start scan run
    con.execute("INSERT INTO scan_runs (files_checked, files_parsed) VALUES (0, 0)")
    scan_id = con.execute("SELECT MAX(scan_id) FROM scan_runs").fetchone()[0]

    # 2. Discover all JSONL files
    all_files = discover_jsonl_files()

    # 3. Upsert workspaces (even if no changed files, we still want the mapping)
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
    changed, deleted = get_changed_files(con, all_files)

    # 5. Parse + ingest changed files
    total_events = 0
    parsed_paths = []
    for ws_id, ws_path, path in changed:
        pf = parse_jsonl(path, ws_id, ws_path)
        n = ingest_parsed_file(con, pf)
        total_events += n
        parsed_paths.append(path)
        log.debug("Parsed %s → %d events", path.name, n)

    # 6. Update file index
    update_file_index(con, parsed_paths, deleted, scan_id)

    # 7. Rebuild aggregates
    rebuild_aggregates(con)

    # 8. Export badges
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
        "files_parsed": len(changed),
        "files_deleted": len(deleted),
        "events_ingested": total_events,
        "elapsed_s": round(elapsed, 2),
    }
    log.info("Scan #%d complete: %s", scan_id, stats)
    return stats
