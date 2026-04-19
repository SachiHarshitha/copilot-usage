"""Rebuild pre-aggregated tables from events."""
from __future__ import annotations

import duckdb
from loguru import logger as log


def rebuild_aggregates(
    con: duckdb.DuckDBPyConnection,
    workspace_ids: set[str] | None = None,
) -> None:
    """Rebuild aggregation tables.

    If *workspace_ids* is provided only the rows for those workspaces are
    refreshed (incremental).  Otherwise a full rebuild is performed.
    """
    _rebuild_daily(con, workspace_ids)
    _rebuild_session(con, workspace_ids)
    _rebuild_badges(con, workspace_ids)
    if workspace_ids:
        log.info("Aggregates refreshed for {} workspace(s)", len(workspace_ids))
    else:
        log.info("Aggregates fully rebuilt")


def _ws_filter(alias: str, workspace_ids: set[str] | None) -> tuple[str, list[str]]:
    """Return (WHERE clause fragment, params) for an optional workspace filter."""
    if not workspace_ids:
        return "", []
    placeholders = ", ".join("?" for _ in workspace_ids)
    return f"AND {alias}.workspace_id IN ({placeholders})", list(workspace_ids)


def _rebuild_daily(con: duckdb.DuckDBPyConnection, workspace_ids: set[str] | None) -> None:
    filt, params = _ws_filter("events", workspace_ids)
    if workspace_ids:
        placeholders = ", ".join("?" for _ in workspace_ids)
        con.execute(f"DELETE FROM agg_daily WHERE workspace_id IN ({placeholders})", list(workspace_ids))
    else:
        con.execute("DELETE FROM agg_daily")
    con.execute(f"""
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
        WHERE timestamp_ms IS NOT NULL {filt}
        GROUP BY 1, 2, 3
    """, params)


def _rebuild_session(con: duckdb.DuckDBPyConnection, workspace_ids: set[str] | None) -> None:
    filt, params = _ws_filter("events", workspace_ids)
    if workspace_ids:
        placeholders = ", ".join("?" for _ in workspace_ids)
        con.execute(f"DELETE FROM agg_session WHERE workspace_id IN ({placeholders})", list(workspace_ids))
    else:
        con.execute("DELETE FROM agg_session")
    con.execute(f"""
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
        WHERE TRUE {filt}
        GROUP BY chat_session_id, workspace_id
    """, params)


def _rebuild_badges(con: duckdb.DuckDBPyConnection, workspace_ids: set[str] | None) -> None:
    filt, params = _ws_filter("e", workspace_ids)
    if workspace_ids:
        placeholders = ", ".join("?" for _ in workspace_ids)
        con.execute(f"DELETE FROM badge_metrics WHERE workspace_id IN ({placeholders})", list(workspace_ids))
    else:
        con.execute("DELETE FROM badge_metrics")
    con.execute(f"""
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
        WHERE TRUE {filt}
        GROUP BY e.workspace_id, w.workspace_path
    """, params)
