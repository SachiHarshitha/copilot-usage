"""Rebuild pre-aggregated tables from events."""
from __future__ import annotations

import logging

import duckdb

log = logging.getLogger(__name__)


def rebuild_aggregates(con: duckdb.DuckDBPyConnection) -> None:
    """Full rebuild of agg_daily, agg_session, and badge_metrics.

    For v1 simplicity this does a full replace.  With large datasets this
    can be changed to incremental refresh keyed by affected source files.
    """
    _rebuild_daily(con)
    _rebuild_session(con)
    _rebuild_badges(con)
    log.info("Aggregates rebuilt")


def _rebuild_daily(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("DELETE FROM agg_daily")
    con.execute("""
        INSERT INTO agg_daily (agg_date, workspace_id, model_id,
                               request_count, prompt_tokens, output_tokens, premium_estimate)
        SELECT
            CAST(epoch_ms(timestamp_ms) AS DATE) AS agg_date,
            workspace_id,
            COALESCE(model_id, 'unknown') AS model_id,
            COUNT(*)            AS request_count,
            SUM(prompt_tokens)  AS prompt_tokens,
            SUM(output_tokens)  AS output_tokens,
            SUM(premium_estimate) AS premium_estimate
        FROM events
        WHERE timestamp_ms IS NOT NULL
        GROUP BY 1, 2, 3
    """)


def _rebuild_session(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("DELETE FROM agg_session")
    con.execute("""
        INSERT INTO agg_session (chat_session_id, workspace_id, model_id,
                                  request_count, prompt_tokens, output_tokens,
                                  premium_estimate, first_ts, last_ts)
        SELECT
            chat_session_id,
            workspace_id,
            MODE(model_id)      AS model_id,
            COUNT(*)            AS request_count,
            SUM(prompt_tokens)  AS prompt_tokens,
            SUM(output_tokens)  AS output_tokens,
            SUM(premium_estimate) AS premium_estimate,
            MIN(timestamp_ms)   AS first_ts,
            MAX(timestamp_ms)   AS last_ts
        FROM events
        GROUP BY chat_session_id, workspace_id
    """)


def _rebuild_badges(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("DELETE FROM badge_metrics")
    con.execute("""
        INSERT INTO badge_metrics (workspace_id, workspace_path,
                                    total_requests, total_prompt, total_output,
                                    premium_estimate, top_model, updated_at)
        SELECT
            e.workspace_id,
            COALESCE(w.workspace_path, e.workspace_id),
            COUNT(*)              AS total_requests,
            SUM(e.prompt_tokens)  AS total_prompt,
            SUM(e.output_tokens)  AS total_output,
            SUM(e.premium_estimate) AS premium_estimate,
            MODE(e.model_id)      AS top_model,
            now()                 AS updated_at
        FROM events e
        LEFT JOIN workspaces w ON w.workspace_id = e.workspace_id
        GROUP BY e.workspace_id, w.workspace_path
    """)
