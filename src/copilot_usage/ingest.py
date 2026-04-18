"""Write parsed events into DuckDB and compute premium-request estimates."""
from __future__ import annotations

import duckdb
from loguru import logger as log

from copilot_usage.config import get_multiplier
from copilot_usage.parser import ParsedFile


def ingest_parsed_file(con: duckdb.DuckDBPyConnection, pf: ParsedFile) -> int:
    """Insert/replace session + events from a parsed file. Returns event count."""
    source = str(pf.source_path)

    # Upsert workspace
    con.execute(
        """INSERT INTO workspaces (workspace_id, workspace_path)
           VALUES (?, ?)
           ON CONFLICT (workspace_id) DO UPDATE SET workspace_path = excluded.workspace_path""",
        [pf.workspace_id, pf.workspace_path],
    )

    # Upsert session anchor
    if pf.anchor:
        con.execute(
            """INSERT INTO sessions (chat_session_id, workspace_id, creation_date,
                                     model_id, model_name, multiplier_raw, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (chat_session_id) DO UPDATE SET
                   workspace_id = excluded.workspace_id,
                   creation_date = excluded.creation_date,
                   model_id = excluded.model_id,
                   model_name = excluded.model_name,
                   multiplier_raw = excluded.multiplier_raw,
                   source_file = excluded.source_file""",
            [
                pf.anchor.chat_session_id,
                pf.workspace_id,
                pf.anchor.creation_date,
                pf.anchor.model_id,
                pf.anchor.model_name,
                pf.anchor.multiplier_raw,
                source,
            ],
        )

    # Delete previous events from this source file (re-parse replaces all)
    con.execute("DELETE FROM events WHERE source_file = ?", [source])

    # Batch insert all events at once
    if pf.requests:
        rows = []
        for req in pf.requests:
            event_id = f"{req.chat_session_id}:{req.request_index}"
            premium = get_multiplier(req.model_id or "") if (req.prompt_tokens or req.output_tokens) else 0.0
            rows.append([
                event_id, req.chat_session_id, pf.workspace_id,
                req.request_index, req.request_id, req.model_id,
                req.timestamp_ms, req.prompt_tokens, req.output_tokens,
                req.tool_call_rounds, premium,
                req.tokens_estimated, pf.data_source, source,
            ])

        # Remove any cross-file duplicates (same event_id from a different source)
        event_ids = [r[0] for r in rows]
        con.execute(
            "DELETE FROM events WHERE event_id = ANY(?)",
            [event_ids],
        )

        # Plain INSERT – no ON CONFLICT needed since we deleted first
        con.executemany(
            """INSERT INTO events (event_id, chat_session_id, workspace_id,
                                   request_index, request_id, model_id,
                                   timestamp_ms, prompt_tokens, output_tokens,
                                   tool_call_rounds, premium_estimate,
                                   tokens_estimated, data_source, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )

    return len(pf.requests)
