"""Query helpers that read from DuckDB for dashboard callbacks."""
from __future__ import annotations

import threading
import time
from functools import wraps

from copilot_usage.db import get_connection

_local = threading.local()

# Simple TTL cache: avoids re-querying on rapid callback bursts (e.g. page load)
_CACHE_TTL = 5  # seconds
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def _ttl_cache(fn):
    """Decorator: cache function result for _CACHE_TTL seconds (key = fn name + args)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        key = (fn.__name__, args, tuple(sorted(kwargs.items())))
        now = time.monotonic()
        with _cache_lock:
            if key in _cache:
                ts, val = _cache[key]
                if now - ts < _CACHE_TTL:
                    return val
        result = fn(*args, **kwargs)
        with _cache_lock:
            _cache[key] = (now, result)
        return result
    return wrapper


def invalidate_cache() -> None:
    """Clear the query cache (call after a scan/ingest)."""
    with _cache_lock:
        _cache.clear()


def close_connections() -> None:
    """Close any thread-local DB connections and clear the query cache.

    Call before a scan to avoid holding connections during writes.
    """
    con = getattr(_local, "con", None)
    if con is not None:
        try:
            con.close()
        except Exception:
            pass
        _local.con = None
    invalidate_cache()


def _con():
    """Return a thread-local connection (reused across queries)."""
    con = getattr(_local, "con", None)
    if con is None:
        con = get_connection(read_only=False)
        _local.con = con
    return con


@_ttl_cache
def kpi_totals() -> dict:
    con = _con()
    row = con.execute("""
        SELECT COUNT(*) AS total_requests,
               COALESCE(SUM(prompt_tokens), 0) AS total_prompt,
               COALESCE(SUM(output_tokens), 0) AS total_output,
               COALESCE(SUM(premium_estimate), 0) AS total_premium,
               COUNT(DISTINCT workspace_id) AS workspaces,
               COUNT(DISTINCT chat_session_id) AS sessions,
               SUM(CASE WHEN data_source = 'legacy_json' THEN 1 ELSE 0 END) AS legacy_events,
               SUM(CASE WHEN tokens_estimated THEN 1 ELSE 0 END) AS estimated_events
        FROM events
    """).fetchone()
    return {
        "total_requests": row[0],
        "total_prompt": row[1],
        "total_output": row[2],
        "total_premium": row[3],
        "workspaces": row[4],
        "sessions": row[5],
        "legacy_events": row[6],
        "estimated_events": row[7],
    }


@_ttl_cache
def daily_timeseries() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT agg_date, model_id,
               request_count, prompt_tokens, output_tokens, premium_estimate
        FROM agg_daily
        ORDER BY agg_date
    """).fetchall()
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


@_ttl_cache
def daily_by_source() -> list[dict]:
    """Daily token totals split by data_source (jsonl vs legacy_json)."""
    con = _con()
    rows = con.execute("""
        SELECT CAST(epoch_ms(timestamp_ms) AS DATE) AS d,
               data_source,
               COUNT(*) AS requests,
               SUM(prompt_tokens) AS prompt_tokens,
               SUM(output_tokens) AS output_tokens
        FROM events
        WHERE timestamp_ms IS NOT NULL
        GROUP BY 1, 2
        ORDER BY 1
    """).fetchall()
    return [
        {"date": str(r[0]), "source": r[1], "requests": r[2],
         "prompt_tokens": r[3], "output_tokens": r[4]}
        for r in rows
    ]


@_ttl_cache
def scan_history(limit: int = 20) -> list[dict]:
    con = _con()
    rows = con.execute(f"""
        SELECT scan_id, started_at, finished_at, files_checked, files_parsed
        FROM scan_runs ORDER BY scan_id DESC LIMIT {int(limit)}
    """).fetchall()
    return [
        {"scan_id": r[0], "started_at": str(r[1]) if r[1] else "",
         "finished_at": str(r[2]) if r[2] else "", "files_checked": r[3], "files_parsed": r[4]}
        for r in rows
    ]


@_ttl_cache
def badge_data() -> list[dict]:
    """Return badge JSON data for all workspaces + summary."""
    con = _con()
    rows = con.execute("""
        SELECT workspace_id, workspace_path,
               total_requests, total_prompt, total_output,
               premium_estimate, top_model
        FROM badge_metrics ORDER BY total_prompt + total_output DESC
    """).fetchall()
    return [
        {"workspace_id": r[0], "workspace_path": r[1], "requests": r[2],
         "prompt_tokens": r[3], "output_tokens": r[4], "premium": r[5], "top_model": r[6]}
        for r in rows
    ]


@_ttl_cache
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
    return [{"model": r[0], "requests": r[1], "total_tokens": r[2], "premium": r[3]} for r in rows]


@_ttl_cache
def workspace_table() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT b.workspace_id, b.workspace_path,
               b.total_requests, b.total_prompt, b.total_output,
               b.premium_estimate, b.top_model
        FROM badge_metrics b
        ORDER BY b.total_prompt + b.total_output DESC
    """).fetchall()
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


@_ttl_cache
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


# ---------------------------------------------------------------------------
# Explorer queries
# ---------------------------------------------------------------------------

@_ttl_cache
def explorer_workspaces() -> list[dict]:
    con = _con()
    rows = con.execute("""
        SELECT workspace_id, workspace_path FROM workspaces ORDER BY workspace_path
    """).fetchall()
    return [{"id": r[0], "path": r[1]} for r in rows]


@_ttl_cache
def explorer_models() -> list[str]:
    con = _con()
    rows = con.execute("""
        SELECT DISTINCT COALESCE(model_id, 'unknown') AS m FROM events ORDER BY m
    """).fetchall()
    return [r[0] for r in rows]


def explorer_events(
    *,
    search: str | None = None,
    workspace_ids: list[str] | None = None,
    model_ids: list[str] | None = None,
    min_tokens: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    sort_by: str = "ts_desc",
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, list[dict]]:
    """Return (total_count, rows) for the explorer table with applied filters."""
    conditions: list[str] = []
    params: list = []

    if search:
        conditions.append("""(
            e.chat_session_id ILIKE ?
            OR COALESCE(w.workspace_path, '') ILIKE ?
            OR COALESCE(e.model_id, '') ILIKE ?
        )""")
        like = f"%{search}%"
        params.extend([like, like, like])

    if workspace_ids:
        placeholders = ", ".join("?" for _ in workspace_ids)
        conditions.append(f"e.workspace_id IN ({placeholders})")
        params.extend(workspace_ids)

    if model_ids:
        placeholders = ", ".join("?" for _ in model_ids)
        conditions.append(f"COALESCE(e.model_id, 'unknown') IN ({placeholders})")
        params.extend(model_ids)

    if min_tokens is not None and min_tokens > 0:
        conditions.append("(e.prompt_tokens + e.output_tokens) >= ?")
        params.append(min_tokens)

    if start_date:
        conditions.append("e.timestamp_ms >= epoch_ms(?::TIMESTAMP)")
        params.append(start_date)

    if end_date:
        conditions.append("e.timestamp_ms < epoch_ms((?::DATE + INTERVAL 1 DAY)::TIMESTAMP)")
        params.append(end_date)

    where = " AND ".join(conditions) if conditions else "TRUE"

    order_map = {
        "ts_desc": "e.timestamp_ms DESC NULLS LAST",
        "ts_asc": "e.timestamp_ms ASC NULLS LAST",
        "prompt_desc": "e.prompt_tokens DESC",
        "prompt_asc": "e.prompt_tokens ASC",
        "output_desc": "e.output_tokens DESC",
        "output_asc": "e.output_tokens ASC",
        "premium_desc": "e.premium_estimate DESC",
        "premium_asc": "e.premium_estimate ASC",
        "model_asc": "COALESCE(e.model_id, '') ASC",
        "model_desc": "COALESCE(e.model_id, '') DESC",
        "workspace_asc": "COALESCE(w.workspace_path, '') ASC",
        "workspace_desc": "COALESCE(w.workspace_path, '') DESC",
    }
    order = order_map.get(sort_by, "e.timestamp_ms DESC NULLS LAST")

    con = _con()

    # Single query: use COUNT(*) OVER() to get total in the same scan as data
    rows = con.execute(f"""
        SELECT
            e.event_id,
            e.chat_session_id,
            e.workspace_id,
            COALESCE(w.workspace_path, e.workspace_id) AS workspace_path,
            e.request_index,
            e.model_id,
            e.timestamp_ms,
            e.prompt_tokens,
            e.output_tokens,
            e.tool_call_rounds,
            e.premium_estimate,
            e.tokens_estimated,
            e.data_source,
            COUNT(*) OVER() AS _total
        FROM events e
        LEFT JOIN workspaces w ON w.workspace_id = e.workspace_id
        WHERE {where}
        ORDER BY {order}
        LIMIT ? OFFSET ?
    """, params + [limit, offset]).fetchall()

    total = rows[0][13] if rows else 0

    result = []
    for r in rows:
        ts = r[6]
        if ts:
            from datetime import datetime, timezone
            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            date_str = dt.strftime("%Y-%m-%d %H:%M")
        else:
            date_str = "—"
        sid = r[1] or ""
        result.append({
            "event_id": r[0],
            "session_id": sid,
            "session_short": (sid[:12] + "…") if len(sid) > 12 else sid,
            "workspace_id": r[2],
            "workspace_path": r[3],
            "request_index": r[4],
            "model_id": r[5],
            "date_str": date_str,
            "prompt_tokens": r[7] or 0,
            "output_tokens": r[8] or 0,
            "tool_call_rounds": r[9] or 0,
            "premium": r[10] or 0.0,
            "tokens_estimated": bool(r[11]),
            "data_source": r[12] or "jsonl",
        })

    return total, result
