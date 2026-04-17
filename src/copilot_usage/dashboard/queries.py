"""Query helpers that read from DuckDB for dashboard callbacks."""
from __future__ import annotations

from copilot_usage.db import get_connection


def _con():
    return get_connection(read_only=True)


def kpi_totals() -> dict:
    con = _con()
    row = con.execute("""
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
               COALESCE(SUM(output_tokens), 0) AS total_output,
               COALESCE(SUM(premium_estimate), 0) AS total_premium,
               COUNT(DISTINCT workspace_id) AS workspaces,
               COUNT(DISTINCT chat_session_id) AS sessions
        FROM events
    """).fetchone()
    con.close()
    return {
        "total_requests": row[0],
        "total_prompt": row[1],
        "total_output": row[2],
        "total_premium": row[3],
        "workspaces": row[4],
        "sessions": row[5],
    }


def daily_timeseries() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT agg_date, model_id,
               request_count, prompt_tokens, output_tokens, premium_estimate
        FROM agg_daily
        ORDER BY agg_date
    """).fetchall()
    con.close()
    return [
        {
            "date": str(r[0]),
            "model": r[1],
            "requests": r[2],
            "prompt_tokens": r[3],
            "output_tokens": r[4],
            "premium": r[5],
        }
        for r in rows
    ]


def model_mix() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT COALESCE(model_id, 'unknown') AS model,
               COUNT(*) AS requests,
               SUM(prompt_tokens + output_tokens) AS total_tokens,
               SUM(premium_estimate) AS premium
        FROM events
        GROUP BY 1
        ORDER BY total_tokens DESC
    """).fetchall()
    con.close()
    return [{"model": r[0], "requests": r[1], "total_tokens": r[2], "premium": r[3]} for r in rows]


def workspace_table() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT b.workspace_id, b.workspace_path,
               b.total_requests, b.total_prompt, b.total_output,
               b.premium_estimate, b.top_model
        FROM badge_metrics b
        ORDER BY b.total_prompt + b.total_output DESC
    """).fetchall()
    con.close()
    return [
        {
            "workspace_id": r[0],
            "workspace_path": r[1],
            "requests": r[2],
            "prompt_tokens": r[3],
            "output_tokens": r[4],
            "premium": r[5],
            "top_model": r[6],
        }
        for r in rows
    ]


def session_list(limit: int = 200) -> list[dict]:
    con = _con()
    rows = con.execute(f"""
        SELECT a.chat_session_id, a.workspace_id, a.model_id,
               a.request_count, a.prompt_tokens, a.output_tokens,
               a.premium_estimate, a.first_ts, a.last_ts,
               COALESCE(w.workspace_path, a.workspace_id) AS ws_path
        FROM agg_session a
        LEFT JOIN workspaces w ON w.workspace_id = a.workspace_id
        ORDER BY a.last_ts DESC NULLS LAST
        LIMIT {int(limit)}
    """).fetchall()
    con.close()
    return [
        {
            "session_id": r[0],
            "workspace_id": r[1],
            "model": r[2],
            "requests": r[3],
            "prompt_tokens": r[4],
            "output_tokens": r[5],
            "premium": r[6],
            "first_ts": r[7],
            "last_ts": r[8],
            "workspace_path": r[9],
        }
        for r in rows
    ]
