"""Write parsed events into DuckDB and compute premium-request estimates."""
from __future__ import annotations

import logging

import duckdb

from copilot_usage.config import get_multiplier
from copilot_usage.parser import ParsedFile

log = logging.getLogger(__name__)


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

    count = 0
    for req in pf.requests:
        event_id = f"{req.chat_session_id}:{req.request_index}"
        premium = get_multiplier(req.model_id or "") if (req.prompt_tokens or req.output_tokens) else 0.0

        con.execute(
            """INSERT INTO events (event_id, chat_session_id, workspace_id,
                                   request_index, request_id, model_id,
                                   timestamp_ms, prompt_tokens, output_tokens,
                                   tool_call_rounds, premium_estimate, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (event_id) DO UPDATE SET
                   model_id = excluded.model_id,
                   timestamp_ms = excluded.timestamp_ms,
                   prompt_tokens = excluded.prompt_tokens,
                   output_tokens = excluded.output_tokens,
                   tool_call_rounds = excluded.tool_call_rounds,
                   premium_estimate = excluded.premium_estimate""",
            [
                event_id,
                req.chat_session_id,
                pf.workspace_id,
                req.request_index,
                req.request_id,
                req.model_id,
                req.timestamp_ms,
                req.prompt_tokens,
                req.output_tokens,
                req.tool_call_rounds,
                premium,
                source,
            ],
        )
        count += 1

    return count
