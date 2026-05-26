"""Discover Copilot chat session JSONL files and resolve workspace mappings."""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import unquote

import duckdb
from loguru import logger as log

from copilot_usage.config import VSCODE_STORAGE_ROOT, VSCODE_STORAGE_ROOTS


def _uri_to_path(uri: str, storage_root: Path | None = None) -> str:
    """Strip a VS Code URI scheme and decode percent-encoding → plain filesystem path.

    Handles:
    - ``file:///c%3A/path``            → ``c:/path``
    - ``vscode-userdata:///Code/...``  → ``{APPDATA}/Code/...``
    - bare string                      → decoded as-is
    """
    if uri.startswith("file:///"):
        return unquote(uri[len("file:///"):])
    if uri.startswith("vscode-userdata:///"):
        rel = unquote(uri[len("vscode-userdata:///"):])
        # vscode-userdata:/// is rooted at the VS Code user-data base (e.g. %APPDATA% on Windows),
        # which is three levels above workspaceStorage: .../Code/User/workspaceStorage
        root = storage_root or VSCODE_STORAGE_ROOT
        userdata_base = root.parents[2]
        return str(userdata_base / rel)
    return unquote(uri)


def resolve_workspace(workspace_dir: Path, storage_root: Path | None = None) -> tuple[str, str]:
    """Return (workspace_id, workspace_path) from a workspaceStorage subfolder.

    For single-folder workspaces the path is the decoded project folder.
    For multi-root workspaces the referenced ``.code-workspace`` / untitled
    workspace file is read to extract the actual folder paths; those are
    joined with ``"; "`` so the stored path is human-readable.
    """
    workspace_id = workspace_dir.name
    ws_json = workspace_dir / "workspace.json"
    workspace_path = ""
    if ws_json.exists():
        try:
            data = json.loads(ws_json.read_text(encoding="utf-8"))
            folder_uri = data.get("folder", "")
            workspace_uri = data.get("workspace", "")
            raw = folder_uri or workspace_uri
            if raw:
                resolved = _uri_to_path(raw, storage_root)
                if workspace_uri:
                    # Multi-root workspace: try to read the referenced workspace file
                    # and extract the actual folder paths for a readable workspace_path.
                    ws_file = Path(resolved)
                    if ws_file.exists():
                        try:
                            ws_data = json.loads(ws_file.read_text(encoding="utf-8"))
                            folder_paths = [
                                _uri_to_path(f.get("uri", "") or f.get("path", ""), storage_root)
                                for f in ws_data.get("folders", [])
                                if isinstance(f, dict)
                            ]
                            folder_paths = [fp for fp in folder_paths if fp]
                            workspace_path = "; ".join(folder_paths) if folder_paths else resolved
                        except (json.JSONDecodeError, OSError):
                            workspace_path = resolved
                    else:
                        workspace_path = resolved
                else:
                    workspace_path = resolved
        except (json.JSONDecodeError, OSError):
            pass
    return workspace_id, workspace_path


def discover_all_session_files(
    storage_roots: list[Path] | None = None,
    storage_root: Path | None = None,  # deprecated: use storage_roots
) -> tuple[list[tuple[str, str, Path]], list[tuple[str, str, Path]]]:
    """Single-pass discovery of both JSONL and legacy JSON session files across all roots.

    Returns (jsonl_files, legacy_json_files) where each item is
    (workspace_id, workspace_path, file_path).
    """
    if storage_root is not None and storage_roots is None:
        storage_roots = [storage_root]
    roots = storage_roots or VSCODE_STORAGE_ROOTS
    jsonl_results: list[tuple[str, str, Path]] = []
    legacy_results: list[tuple[str, str, Path]] = []

    for root in roots:
        if not root.exists():
            log.warning("VS Code storage root not found: {}", root)
            continue
        for workspace_dir in root.iterdir():
            if not workspace_dir.is_dir():
                continue
            sessions_dir = workspace_dir / "chatSessions"
            if not sessions_dir.is_dir():
                continue
            workspace_id, workspace_path = resolve_workspace(workspace_dir, root)
            for f in sessions_dir.iterdir():
                if not f.is_file():
                    continue
                if f.suffix == ".jsonl":
                    jsonl_results.append((workspace_id, workspace_path, f))
                elif f.suffix == ".json":
                    legacy_results.append((workspace_id, workspace_path, f))

    log.info(
        "Discovered {} JSONL + {} legacy JSON files across {} workspaces",
        len(jsonl_results),
        len(legacy_results),
        len({r[0] for r in jsonl_results} | {r[0] for r in legacy_results}),
    )
    return jsonl_results, legacy_results


def discover_jsonl_files(
    storage_roots: list[Path] | None = None,
) -> list[tuple[str, str, Path]]:
    """Find all chatSessions/*.jsonl files.

    Returns list of (workspace_id, workspace_path, jsonl_path).
    """
    jsonl, _ = discover_all_session_files(storage_roots)
    return jsonl


def discover_legacy_json_files(
    storage_roots: list[Path] | None = None,
) -> list[tuple[str, str, Path]]:
    """Find all chatSessions/*.json files (legacy, pre-Feb 2026).

    Returns list of (workspace_id, workspace_path, json_path).
    """
    _, legacy = discover_all_session_files(storage_roots)
    return legacy


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

    log.info("Incremental: {} changed, {} deleted (of {} total candidates)", len(changed), len(deleted), len(candidates))
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
