"""Pipeline runner page — configure path, run scan, view real-time console log."""
from __future__ import annotations

import threading
import traceback
from datetime import datetime

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, ctx, dcc, html

from copilot_usage.config import VSCODE_STORAGE_ROOT

dash.register_page(__name__, path="/pipeline", name="Pipeline", order=2)

# ---------------------------------------------------------------------------
# Shared state for background pipeline execution
# ---------------------------------------------------------------------------

_run_state: dict = {
    "running": False,
    "log_lines": [],
    "progress": 0,
    "finished": False,
    "error": False,
    "stats": None,
}
_lock = threading.Lock()


def _reset_state():
    _run_state["running"] = False
    _run_state["log_lines"] = []
    _run_state["progress"] = 0
    _run_state["finished"] = False
    _run_state["error"] = False
    _run_state["stats"] = None


def _append_log(msg: str, pct: float | None = None):
    ts = datetime.now().strftime("%H:%M:%S")
    _run_state["log_lines"].append(f"[{ts}] {msg}")
    if pct is not None:
        _run_state["progress"] = min(100, max(0, int(pct)))


def _run_pipeline_thread(storage_path: str):
    """Run the scan pipeline in a background thread."""
    from pathlib import Path

    from copilot_usage.db import get_connection
    from copilot_usage.pipeline import run_scan

    try:
        _append_log(f"Storage path: {storage_path}", 0)
        storage_root = Path(storage_path) if storage_path else None
        con = get_connection()
        stats = run_scan(con, storage_root=storage_root, on_progress=_append_log)
        con.close()
        with _lock:
            _run_state["stats"] = stats
            _run_state["finished"] = True
            _run_state["running"] = False
    except Exception:
        tb = traceback.format_exc()
        _append_log(f"ERROR: {tb}", None)
        with _lock:
            _run_state["error"] = True
            _run_state["finished"] = True
            _run_state["running"] = False


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    html.H4("Pipeline Runner", className="mb-3", style={"color": "#e6edf3"}),

    # Config section
    html.Div([
        html.Div("Configuration", className="card-header"),
        html.Div([
            dbc.Row([
                dbc.Col([
                    html.Label("VS Code Storage Path", className="form-label",
                               style={"color": "#8b949e", "fontSize": "0.8rem",
                                      "textTransform": "uppercase", "letterSpacing": "0.4px"}),
                    dbc.InputGroup([
                        dbc.Input(
                            id="pl-storage-path",
                            type="text",
                            value=str(VSCODE_STORAGE_ROOT),
                            placeholder="Auto-detected path…",
                            className="bg-dark text-light border-secondary",
                        ),
                        dbc.Button(
                            "📂 Default",
                            id="pl-default-path",
                            color="secondary",
                            outline=True,
                            size="sm",
                        ),
                    ]),
                    html.Small(
                        "Path to VS Code workspaceStorage directory. "
                        "Uses auto-detected default if left unchanged.",
                        className="text-muted",
                    ),
                ], md=9),
                dbc.Col([
                    html.Label("\u00a0", className="form-label",
                               style={"fontSize": "0.8rem"}),
                    html.Div([
                        dbc.Button(
                            [html.I(className="me-1"), "▶ Run Pipeline"],
                            id="pl-run-btn",
                            color="success",
                            className="w-100",
                            size="lg",
                        ),
                    ]),
                ], md=3),
            ], className="g-3"),
        ], className="p-3"),
    ], className="section-card mb-3"),

    # Console output
    html.Div([
        html.Div([
            html.Span("Console", style={"flex": "1"}),
            dbc.Button("Clear", id="pl-clear-log", color="secondary",
                       outline=True, size="sm"),
        ], className="card-header d-flex align-items-center"),
        # Progress bar
        html.Div(
            dbc.Progress(
                id="pl-progress",
                value=0,
                striped=True,
                animated=True,
                color="info",
                style={"height": "4px", "borderRadius": "0"},
                className="bg-dark",
            ),
        ),
        # Log area
        html.Pre(
            id="pl-console",
            children="Ready. Click 'Run Pipeline' to start.\n",
            className="console-output",
        ),
    ], className="section-card mb-3"),

    # Result section (hidden until complete)
    html.Div(id="pl-result", className="mb-3"),

    # Polling interval (active during run)
    dcc.Interval(id="pl-poll", interval=400, disabled=True),

    # Stores
    dcc.Store(id="pl-is-running", data=False),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(
    Output("pl-storage-path", "value"),
    Input("pl-default-path", "n_clicks"),
    prevent_initial_call=True,
)
def _reset_path(_):
    return str(VSCODE_STORAGE_ROOT)


@callback(
    [Output("pl-is-running", "data"), Output("pl-poll", "disabled")],
    Input("pl-run-btn", "n_clicks"),
    State("pl-storage-path", "value"),
    prevent_initial_call=True,
)
def _start_run(n_clicks, storage_path):
    if _run_state["running"]:
        return dash.no_update, dash.no_update

    _reset_state()
    _run_state["running"] = True

    t = threading.Thread(
        target=_run_pipeline_thread,
        args=(storage_path or "",),
        daemon=True,
    )
    t.start()
    return True, False  # enable polling


@callback(
    [
        Output("pl-console", "children"),
        Output("pl-progress", "value"),
        Output("pl-progress", "color"),
        Output("pl-result", "children"),
        Output("pl-run-btn", "disabled"),
        Output("pl-poll", "disabled", allow_duplicate=True),
    ],
    Input("pl-poll", "n_intervals"),
    prevent_initial_call=True,
)
def _poll_progress(_):
    with _lock:
        log_text = "\n".join(_run_state["log_lines"]) + "\n" if _run_state["log_lines"] else ""
        progress = _run_state["progress"]
        finished = _run_state["finished"]
        running = _run_state["running"]
        error = _run_state["error"]
        stats = _run_state["stats"]

    is_active = running and not finished

    # Progress bar color
    if error:
        bar_color = "danger"
    elif finished:
        bar_color = "success"
    else:
        bar_color = "info"

    # Result panel
    result_content = None
    if finished and not error and stats:
        result_content = html.Div([
            html.Div("✅ Pipeline Complete", className="card-header",
                     style={"color": "#3fb950"}),
            html.Div([
                dbc.Row([
                    _stat_col("Scan ID", f"#{stats['scan_id']}"),
                    _stat_col("Files Total", str(stats["files_total"])),
                    _stat_col("JSONL", str(stats["files_jsonl"])),
                    _stat_col("Legacy JSON", str(stats["files_legacy_json"])),
                    _stat_col("Parsed", str(stats["files_parsed"])),
                    _stat_col("Events", str(stats["events_ingested"])),
                    _stat_col("Duration", f"{stats['elapsed_s']}s"),
                ], className="g-2 mb-3"),
                dbc.Button(
                    "Go to Dashboard →",
                    href="/",
                    color="primary",
                    className="me-2",
                ),
                dbc.Button(
                    "Go to Explorer →",
                    href="/explorer",
                    color="secondary",
                    outline=True,
                ),
            ], className="p-3"),
        ], className="section-card")
    elif finished and error:
        result_content = html.Div([
            html.Div("❌ Pipeline Failed", className="card-header",
                     style={"color": "#f85149"}),
            html.Div([
                html.P("Check the console output above for error details.",
                       className="text-muted mb-2"),
                dbc.Button("Retry", id="pl-run-btn", color="warning",
                           outline=True),
            ], className="p-3"),
        ], className="section-card")

    return (
        log_text,
        progress,
        bar_color,
        result_content,
        is_active,                  # disable run button while active
        not is_active and finished,  # disable poll when done
    )


@callback(
    Output("pl-console", "children", allow_duplicate=True),
    Input("pl-clear-log", "n_clicks"),
    prevent_initial_call=True,
)
def _clear_log(_):
    _run_state["log_lines"] = []
    return ""


def _stat_col(label: str, value: str) -> dbc.Col:
    return dbc.Col(
        html.Div([
            html.Div(value, style={"fontSize": "1.2rem", "fontWeight": "700",
                                   "color": "#e6edf3"}),
            html.Div(label, style={"fontSize": "0.72rem", "color": "#8b949e",
                                   "textTransform": "uppercase"}),
        ], className="text-center"),
        xs=6, sm=4, md=True,
    )
