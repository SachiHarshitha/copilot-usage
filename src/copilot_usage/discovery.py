"""Discover Copilot chat session JSONL files and resolve workspace mappings."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from urllib.parse import unquote

import duckdb

from copilot_usage.config import VSCODE_STORAGE_ROOT

log = logging.getLogger(__name__)


def resolve_workspace(workspace_dir: Path) -> tuple[str, str]:
    """Return (workspace_id, workspace_path) from a workspaceStorage subfolder."""
    workspace_id = workspace_dir.name
    ws_json = workspace_dir / "workspace.json"
    workspace_path = ""
    if ws_json.exists():
        try:
            data = json.loads(ws_json.read_text(encoding="utf-8"))
            raw = data.get("folder", "") or data.get("workspace", "")
            # Decode URI like file:///c%3A/projects/foo
            if raw.startswith("file:///"):
                workspace_path = unquote(raw[len("file:///"):])
            else:
                workspace_path = unquote(raw)
        except (json.JSONDecodeError, OSError):
            pass
    return workspace_id, workspace_path


def discover_jsonl_files(
    storage_root: Path | None = None,
) -> list[tuple[str, str, Path]]:
    """Find all chatSessions/*.jsonl files.

    Returns list of (workspace_id, workspace_path, jsonl_path).
    """
    root = storage_root or VSCODE_STORAGE_ROOT
    results: list[tuple[str, str, Path]] = []
    if not root.exists():
        log.warning("VS Code storage root not found: %s", root)
        return results

    for workspace_dir in root.iterdir():
        if not workspace_dir.is_dir():
            continue
        sessions_dir = workspace_dir / "chatSessions"
        if not sessions_dir.is_dir():
            continue
        workspace_id, workspace_path = resolve_workspace(workspace_dir)
        for jsonl in sessions_dir.glob("*.jsonl"):
            results.append((workspace_id, workspace_path, jsonl))

    log.info("Discovered %d JSONL files across %d workspaces", len(results), len({r[0] for r in results}))
    return results


def get_changed_files(
    con: duckdb.DuckDBPyConnection,
    candidates: list[tuple[str, str, Path]],
) -> tuple[list[tuple[str, str, Path]], set[str]]:
    """Compare candidates against file_index; return (changed, deleted_paths).

    A file is considered changed if it is new, or its size/mtime differ.
    Deleted files are those in file_index but no longer on disk.
    """
    # Build candidate fingerprints
    candidate_map: dict[str, tuple[str, str, Path]] = {}
    for ws_id, ws_path, p in candidates:
        candidate_map[str(p)] = (ws_id, ws_path, p)

    # Fetch existing index
    rows = con.execute("SELECT file_path, file_size, file_mtime FROM file_index WHERE NOT deleted").fetchall()
    existing: dict[str, tuple[int, float]] = {r[0]: (r[1], r[2]) for r in rows}

    changed: list[tuple[str, str, Path]] = []
    for path_str, (ws_id, ws_path, p) in candidate_map.items():
        try:
            stat = p.stat()
        except OSError:
            continue
        prev = existing.get(path_str)
        if prev is None or prev[0] != stat.st_size or abs(prev[1] - stat.st_mtime) > 0.001:
            changed.append((ws_id, ws_path, p))

    # Detect deleted files
    current_paths = set(candidate_map.keys())
    deleted = set(existing.keys()) - current_paths

    log.info("Incremental: %d changed, %d deleted (of %d total candidates)", len(changed), len(deleted), len(candidates))
    return changed, deleted


def update_file_index(
    con: duckdb.DuckDBPyConnection,
    parsed_files: list[Path],
    deleted_paths: set[str],
    scan_id: int,
) -> None:
    """Upsert file_index after a scan."""
    for p in parsed_files:
        try:
            stat = p.stat()
        except OSError:
            continue
        con.execute(
            """INSERT INTO file_index (file_path, file_size, file_mtime, last_scan_id)
               VALUES (?, ?, ?, ?)
               ON CONFLICT (file_path) DO UPDATE SET
                   file_size = excluded.file_size,
                   file_mtime = excluded.file_mtime,
                   last_scan_id = excluded.last_scan_id,
                   deleted = FALSE""",
            [str(p), stat.st_size, stat.st_mtime, scan_id],
        )
    for dp in deleted_paths:
        con.execute(
            "UPDATE file_index SET deleted = TRUE, last_scan_id = ? WHERE file_path = ?",
            [scan_id, dp],
        )
