"""Export badge-ready JSON files for Shields.io dynamic badges."""
from __future__ import annotations

import json
import logging

import duckdb

from copilot_usage.config import BADGE_DIR

log = logging.getLogger(__name__)


def export_badges(con: duckdb.DuckDBPyConnection) -> None:
    """Write per-workspace badge JSON and a summary badge."""
    BADGE_DIR.mkdir(parents=True, exist_ok=True)

    rows = con.execute("""
        SELECT workspace_id, workspace_path, total_requests,
               total_prompt, total_output, premium_estimate, top_model
        FROM badge_metrics
    """).fetchall()

    total_requests = 0
    total_prompt = 0
    total_output = 0
    total_premium = 0.0

    for ws_id, ws_path, reqs, prompt, output, premium, top_model in rows:
        total_requests += reqs
        total_prompt += prompt
        total_output += output
        total_premium += premium

        badge = {
            "schemaVersion": 1,
            "label": "Copilot Tokens",
            "message": _format_tokens(prompt + output),
            "color": "blue",
            "namedLogo": "githubcopilot",
        }
        safe_name = ws_id[:16]  # truncate hash for filename
        path = BADGE_DIR / f"{safe_name}.json"
        path.write_text(json.dumps(badge, indent=2), encoding="utf-8")

    # Summary badge
    summary = {
        "schemaVersion": 1,
        "label": "Copilot Usage",
        "message": f"{total_requests} reqs | {_format_tokens(total_prompt + total_output)} tokens | ~{total_premium:.0f} premium",
        "color": "green",
        "namedLogo": "githubcopilot",
    }
    (BADGE_DIR / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    log.info("Exported %d workspace badges + summary to %s", len(rows), BADGE_DIR)


def _format_tokens(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)
