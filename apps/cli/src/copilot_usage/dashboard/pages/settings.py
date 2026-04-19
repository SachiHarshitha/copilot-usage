"""Settings page — theme, about, database management, and log viewer."""
from __future__ import annotations

from datetime import datetime, timezone

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html
from dash_bootstrap_templates import ThemeChangerAIO

from copilot_usage import __version__
from copilot_usage.config import APP_DATA_DIR, DB_PATH, VSCODE_STORAGE_ROOT
from copilot_usage.dashboard.app import THEME_OPTIONS
from copilot_usage.logging import LOG_DIR

dash.register_page(__name__, path="/settings", name="Settings", order=99)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _about_row(label: str, value: str):
    return html.Tr([
        html.Td(label, style={"color": "#8b949e", "fontWeight": "600",
                               "fontSize": ".82rem", "width": "160px",
                               "borderColor": "#21262d"}),
        html.Td(
            html.Code(value, style={"fontSize": ".82rem", "wordBreak": "break-all"}),
            style={"borderColor": "#21262d"},
        ),
    ])


# ---------------------------------------------------------------------------
# Settings tab content
# ---------------------------------------------------------------------------

_settings_content = html.Div([
    # ── Theme ─────────────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-palette me-2"),
            "Appearance",
        ], className="card-header"),
        html.Div([
            html.Label("Dashboard Theme", className="settings-label"),
            html.P(
                "Select a theme below. The change applies instantly — no restart needed.",
                className="text-muted mb-3", style={"fontSize": ".82rem"},
            ),
            ThemeChangerAIO(
                aio_id="theme",
                radio_props={
                    "options": THEME_OPTIONS,
                    "value": dbc.themes.DARKLY,
                },
                button_props={
                    "outline": True,
                    "color": "primary",
                    "children": [html.I(className="bi bi-palette me-1"), "Change Theme"],
                    "size": "sm",
                },
                offcanvas_props={"title": "Select Theme", "placement": "end"},
            ),
        ], className="p-3"),
    ], className="section-card mb-4"),

    # ── About ─────────────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-info-circle me-2"),
            "About",
        ], className="card-header"),
        html.Div([
            html.Table([
                html.Tbody([
                    _about_row("Version", __version__),
                    _about_row("Database", str(DB_PATH)),
                    _about_row("App Data", str(APP_DATA_DIR)),
                    _about_row("Log Directory", str(LOG_DIR)),
                    _about_row("VS Code Storage", str(VSCODE_STORAGE_ROOT)),
                ])
            ], className="table table-dark table-sm mb-0",
               style={"--bs-table-bg": "transparent"}),
            html.Div([
                html.A(
                    [html.I(className="bi bi-github me-1"), "Repository"],
                    href="https://github.com/SachiHarshitha/copilot-usage",
                    target="_blank",
                    className="btn btn-outline-secondary btn-sm me-2",
                ),
                html.A(
                    [html.I(className="bi bi-bug me-1"), "Report Issue"],
                    href="https://github.com/SachiHarshitha/copilot-usage/issues",
                    target="_blank",
                    className="btn btn-outline-secondary btn-sm",
                ),
            ], className="mt-3"),
        ], className="p-3"),
    ], className="section-card mb-4"),

    # ── Danger Zone ───────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-exclamation-triangle me-2"),
            "Danger Zone",
        ], className="card-header", style={"color": "#f85149"}),
        html.Div([
            html.P(
                "Erase all data in the local database. This action cannot be undone. "
                "A fresh scan will be needed to repopulate the data.",
                className="text-muted mb-3", style={"fontSize": ".85rem"},
            ),
            dbc.Button(
                [html.I(className="bi bi-trash3 me-1"), "Erase Database"],
                id="settings-erase-btn",
                color="danger",
                outline=True,
                size="sm",
            ),
            # Confirmation modal
            dbc.Modal([
                dbc.ModalHeader(
                    dbc.ModalTitle("Confirm Database Erase"),
                    close_button=True,
                ),
                dbc.ModalBody([
                    html.P("This will permanently delete all events, sessions, "
                           "aggregates, and badge data from the local database."),
                    html.P([
                        html.Strong("Database: "),
                        html.Code(str(DB_PATH), style={"fontSize": ".82rem"}),
                    ]),
                    html.P("Type ", style={"display": "inline"}),
                    html.Code("ERASE", style={"color": "#f85149"}),
                    html.Span(" below to confirm:"),
                    dbc.Input(
                        id="settings-erase-confirm-input",
                        placeholder="Type ERASE",
                        className="mt-2 bg-dark text-light border-secondary",
                        autoFocus=True,
                    ),
                ]),
                dbc.ModalFooter([
                    dbc.Button("Cancel", id="settings-erase-cancel", color="secondary", size="sm"),
                    dbc.Button(
                        [html.I(className="bi bi-trash3 me-1"), "Erase Everything"],
                        id="settings-erase-execute",
                        color="danger",
                        size="sm",
                        disabled=True,
                    ),
                ]),
            ], id="settings-erase-modal", is_open=False, centered=True),
            html.Div(id="settings-erase-result", className="mt-3"),
        ], className="p-3"),
    ], className="section-card danger-zone mb-4"),
])


# ---------------------------------------------------------------------------
# Logs tab content
# ---------------------------------------------------------------------------

_logs_content = html.Div([
    # ── Log files list ────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-folder2-open me-2"),
            "Log Files",
            dbc.Button(
                [html.I(className="bi bi-arrow-clockwise me-1"), "Refresh"],
                id="logs-refresh-btn",
                color="secondary",
                outline=True,
                size="sm",
                className="ms-auto",
            ),
        ], className="card-header d-flex align-items-center justify-content-between"),
        html.Div([
            html.P(
                f"Logs are stored in: ",
                className="text-muted mb-2",
                style={"fontSize": ".82rem"},
            ),
            html.Code(str(LOG_DIR), style={"fontSize": ".78rem"}),
            html.Div(id="logs-file-list", className="mt-3"),
            dcc.Download(id="logs-download"),
        ], className="p-3"),
    ], className="section-card mb-4"),

    # ── Log viewer ────────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-terminal me-2"),
            "Log Viewer",
            html.Span(id="logs-viewer-filename", className="text-muted ms-2",
                       style={"fontSize": ".82rem", "fontWeight": "400"}),
        ], className="card-header"),
        html.Div([
            html.Div([
                dbc.Select(
                    id="logs-tail-lines",
                    options=[
                        {"label": "Last 100 lines", "value": "100"},
                        {"label": "Last 500 lines", "value": "500"},
                        {"label": "Last 1000 lines", "value": "1000"},
                        {"label": "All lines", "value": "99999"},
                    ],
                    value="500",
                    style={"width": "180px", "display": "inline-block"},
                    className="bg-dark text-light border-secondary me-2",
                    size="sm",
                ),
                dbc.Button(
                    [html.I(className="bi bi-arrow-clockwise me-1"), "Reload"],
                    id="logs-viewer-reload",
                    color="secondary",
                    outline=True,
                    size="sm",
                ),
            ], className="d-flex align-items-center mb-3"),
            html.Pre(
                id="logs-viewer-content",
                style={
                    "backgroundColor": "#0d1117",
                    "color": "#c9d1d9",
                    "padding": "1rem",
                    "borderRadius": "6px",
                    "maxHeight": "600px",
                    "overflowY": "auto",
                    "fontSize": ".78rem",
                    "fontFamily": "Consolas, 'Courier New', monospace",
                    "whiteSpace": "pre-wrap",
                    "wordBreak": "break-all",
                    "border": "1px solid #21262d",
                },
            ),
        ], className="p-3"),
    ], className="section-card mb-4"),

    # Hidden store to track which file is selected
    dcc.Store(id="logs-selected-file", data=""),
])


# ---------------------------------------------------------------------------
# Layout — two tabs
# ---------------------------------------------------------------------------

layout = html.Div([
    html.H4("Settings & Logs", className="mb-4",
             style={"color": "#e6edf3", "fontWeight": "600"}),

    dbc.Tabs([
        dbc.Tab(
            _settings_content,
            label="Settings",
            tab_id="tab-settings",
            activeTabClassName="fw-bold",
            tab_style={"minWidth": "120px"},
        ),
        dbc.Tab(
            _logs_content,
            label="Logs",
            tab_id="tab-logs",
            activeTabClassName="fw-bold",
            tab_style={"minWidth": "120px"},
        ),
    ], id="settings-tabs", active_tab="tab-settings", className="mb-4"),
])


# ---------------------------------------------------------------------------
# Settings callbacks
# ---------------------------------------------------------------------------

@callback(
    Output("settings-erase-modal", "is_open"),
    [Input("settings-erase-btn", "n_clicks"),
     Input("settings-erase-cancel", "n_clicks"),
     Input("settings-erase-execute", "n_clicks")],
    State("settings-erase-modal", "is_open"),
    prevent_initial_call=True,
)
def _toggle_modal(open_clicks, cancel_clicks, exec_clicks, is_open):
    ctx = dash.callback_context
    if not ctx.triggered:
        return is_open
    trigger = ctx.triggered[0]["prop_id"].split(".")[0]
    if trigger == "settings-erase-btn":
        return True
    return False


@callback(
    Output("settings-erase-execute", "disabled"),
    Input("settings-erase-confirm-input", "value"),
    prevent_initial_call=True,
)
def _validate_erase_input(value):
    return (value or "").strip() != "ERASE"


@callback(
    Output("settings-erase-result", "children"),
    Input("settings-erase-execute", "n_clicks"),
    State("settings-erase-confirm-input", "value"),
    prevent_initial_call=True,
)
def _do_erase(n_clicks, confirm_value):
    if (confirm_value or "").strip() != "ERASE":
        return ""
    try:
        from copilot_usage.db import get_connection
        con = get_connection(read_only=False)
        for table in ["events", "sessions", "workspaces", "file_index",
                       "agg_daily", "agg_session", "badge_metrics", "scan_runs"]:
            con.execute(f"DELETE FROM {table}")  # noqa: S608
        con.close()
        return dbc.Alert(
            [html.I(className="bi bi-check-circle me-1"),
             "Database erased. Run a new scan to repopulate."],
            color="success", className="mb-0 py-2", style={"fontSize": ".84rem"},
        )
    except Exception as exc:
        return dbc.Alert(
            f"Error: {exc}", color="danger",
            className="mb-0 py-2", style={"fontSize": ".84rem"},
        )


# ---------------------------------------------------------------------------
# Logs callbacks
# ---------------------------------------------------------------------------

@callback(
    Output("logs-file-list", "children"),
    [Input("logs-refresh-btn", "n_clicks"),
     Input("settings-tabs", "active_tab")],
)
def _logs_file_list(_, active_tab):
    """Render the list of available log files."""
    if active_tab != "tab-logs":
        return dash.no_update

    from copilot_usage.logging import get_log_files

    files = get_log_files()
    if not files:
        return html.P("No log files found.", className="text-muted")

    rows = []
    for f in files:
        mod_dt = datetime.fromtimestamp(f["modified"], tz=timezone.utc)
        rows.append(html.Tr([
            html.Td(
                html.A(
                    f["name"],
                    id={"type": "log-file-link", "index": f["name"]},
                    href="#",
                    className="text-info",
                    style={"cursor": "pointer", "textDecoration": "none",
                           "fontSize": ".84rem"},
                ),
                style={"borderColor": "#21262d"},
            ),
            html.Td(
                f"{f['size_kb']:.1f} KB",
                style={"borderColor": "#21262d", "fontSize": ".82rem",
                        "color": "#8b949e"},
            ),
            html.Td(
                mod_dt.strftime("%Y-%m-%d %H:%M"),
                style={"borderColor": "#21262d", "fontSize": ".82rem",
                        "color": "#8b949e"},
            ),
            html.Td(
                dbc.Button(
                    [html.I(className="bi bi-download")],
                    id={"type": "log-download-btn", "index": f["name"]},
                    color="secondary",
                    outline=True,
                    size="sm",
                ),
                style={"borderColor": "#21262d", "textAlign": "right"},
            ),
        ]))

    return html.Table([
        html.Thead(html.Tr([
            html.Th("File", style={"borderColor": "#21262d", "color": "#8b949e",
                                     "fontSize": ".78rem"}),
            html.Th("Size", style={"borderColor": "#21262d", "color": "#8b949e",
                                     "fontSize": ".78rem"}),
            html.Th("Modified", style={"borderColor": "#21262d", "color": "#8b949e",
                                         "fontSize": ".78rem"}),
            html.Th("", style={"borderColor": "#21262d", "width": "60px"}),
        ])),
        html.Tbody(rows),
    ], className="table table-dark table-sm mb-0",
       style={"--bs-table-bg": "transparent"})


@callback(
    Output("logs-selected-file", "data"),
    Input({"type": "log-file-link", "index": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def _select_log_file(n_clicks_list):
    """Store which log file the user clicked."""
    ctx = dash.callback_context
    if not ctx.triggered:
        return dash.no_update
    if not any(n_clicks_list):
        return dash.no_update
    if ctx.triggered[0]["value"] is None:
        return dash.no_update
    trigger = ctx.triggered[0]["prop_id"]
    # Extract filename from pattern-match trigger e.g. {"index":"copilot_usage_2026-04-18.log","type":"log-file-link"}.n_clicks
    import json as _json
    prop_id = trigger.rsplit(".", 1)[0]
    try:
        info = _json.loads(prop_id)
        return info.get("index", "")
    except (ValueError, KeyError):
        return dash.no_update


@callback(
    Output("logs-download", "data"),
    Input({"type": "log-download-btn", "index": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def _download_log(n_clicks_list):
    """Send a log file as browser download."""
    ctx = dash.callback_context
    if not ctx.triggered:
        return dash.no_update
    # Ignore initial render where all n_clicks are None
    if not any(n_clicks_list):
        return dash.no_update
    trigger = ctx.triggered[0]["prop_id"]
    # Only proceed if the trigger value is a real click (not None)
    if ctx.triggered[0]["value"] is None:
        return dash.no_update
    import json as _json
    prop_id = trigger.rsplit(".", 1)[0]
    try:
        info = _json.loads(prop_id)
        name = info.get("index", "")
    except (ValueError, KeyError):
        return dash.no_update

    if not name:
        return dash.no_update

    from copilot_usage.logging import read_log_file
    content = read_log_file(name, tail_lines=99999)
    return dcc.send_string(content, filename=name)


@callback(
    [Output("logs-viewer-content", "children"),
     Output("logs-viewer-filename", "children")],
    [Input("logs-selected-file", "data"),
     Input("logs-viewer-reload", "n_clicks")],
    State("logs-tail-lines", "value"),
)
def _view_log(selected_file, _, tail_lines):
    """Display log contents in the viewer pane."""
    if not selected_file:
        return "← Select a log file from the list above to view its contents.", ""

    from copilot_usage.logging import read_log_file
    lines = int(tail_lines) if tail_lines else 500
    content = read_log_file(selected_file, tail_lines=lines)
    label = f"— {selected_file}"
    return content, label
