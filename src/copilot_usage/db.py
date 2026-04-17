"""DuckDB schema management and connection helper."""
from __future__ import annotations

import duckdb

from copilot_usage.config import APP_DATA_DIR, DB_PATH

SCHEMA_VERSION = 1

_DDL = """
-- Tracks each incremental scan invocation
CREATE TABLE IF NOT EXISTS scan_runs (
    scan_id       INTEGER PRIMARY KEY DEFAULT nextval('seq_scan'),
    started_at    TIMESTAMP NOT NULL DEFAULT now(),
    finished_at   TIMESTAMP,
    files_checked INTEGER DEFAULT 0,
    files_parsed  INTEGER DEFAULT 0
);

-- Remembers which source files have been ingested and their fingerprint
CREATE TABLE IF NOT EXISTS file_index (
    file_path     TEXT PRIMARY KEY,
    file_size     BIGINT NOT NULL,
    file_mtime    DOUBLE NOT NULL,
    last_scan_id  INTEGER NOT NULL,
    deleted       BOOLEAN NOT NULL DEFAULT FALSE
);

-- Workspace storage hash → real workspace path
CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id  TEXT PRIMARY KEY,
    workspace_path TEXT NOT NULL
);

-- One row per chat session (derived from kind=0 anchor line)
CREATE TABLE IF NOT EXISTS sessions (
    chat_session_id TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL,
    creation_date   BIGINT,            -- epoch ms
    model_id        TEXT,              -- session-default model
    model_name      TEXT,
    multiplier_raw  TEXT,              -- e.g. "3x" as persisted
    source_file     TEXT NOT NULL
);

-- One row per completed request (derived from result lines)
CREATE TABLE IF NOT EXISTS events (
    event_id           TEXT PRIMARY KEY, -- chat_session_id + request_index
    chat_session_id    TEXT NOT NULL,
    workspace_id       TEXT NOT NULL,
    request_index      INTEGER NOT NULL,
    request_id         TEXT,
    model_id           TEXT,
    timestamp_ms       BIGINT,
    prompt_tokens      INTEGER,
    output_tokens      INTEGER,
    tool_call_rounds   INTEGER DEFAULT 0,
    premium_estimate   DOUBLE DEFAULT 0.0,
    source_file        TEXT NOT NULL
);

-- Pre-aggregated daily stats per workspace+model
CREATE TABLE IF NOT EXISTS agg_daily (
    agg_date          DATE NOT NULL,
    workspace_id      TEXT NOT NULL,
    model_id          TEXT NOT NULL,
    request_count     INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     BIGINT NOT NULL DEFAULT 0,
    output_tokens     BIGINT NOT NULL DEFAULT 0,
    premium_estimate  DOUBLE NOT NULL DEFAULT 0.0,
    PRIMARY KEY (agg_date, workspace_id, model_id)
);

-- Pre-aggregated session summary
CREATE TABLE IF NOT EXISTS agg_session (
    chat_session_id   TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL,
    model_id          TEXT,
    request_count     INTEGER NOT NULL DEFAULT 0,
    prompt_tokens     BIGINT NOT NULL DEFAULT 0,
    output_tokens     BIGINT NOT NULL DEFAULT 0,
    premium_estimate  DOUBLE NOT NULL DEFAULT 0.0,
    first_ts          BIGINT,
    last_ts           BIGINT
);

-- Badge-ready per-workspace metrics snapshot
CREATE TABLE IF NOT EXISTS badge_metrics (
    workspace_id      TEXT PRIMARY KEY,
    workspace_path    TEXT,
    total_requests    INTEGER NOT NULL DEFAULT 0,
    total_prompt      BIGINT NOT NULL DEFAULT 0,
    total_output      BIGINT NOT NULL DEFAULT 0,
    premium_estimate  DOUBLE NOT NULL DEFAULT 0.0,
    top_model         TEXT,
    updated_at        TIMESTAMP NOT NULL DEFAULT now()
);
"""


def get_connection(read_only: bool = False) -> duckdb.DuckDBPyConnection:
    """Return a DuckDB connection, creating the DB + schema on first use."""
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(DB_PATH), read_only=read_only)
    if not read_only:
        _ensure_schema(con)
    return con


def _ensure_schema(con: duckdb.DuckDBPyConnection) -> None:
    # Create sequence if missing (used by scan_runs PK)
    con.execute("CREATE SEQUENCE IF NOT EXISTS seq_scan START 1")
    con.execute(_DDL)
