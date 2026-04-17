"""Settings page — theme, about, and database management."""
from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html

from copilot_usage import __version__
from copilot_usage.config import APP_DATA_DIR, DB_PATH, VSCODE_STORAGE_ROOT

dash.register_page(__name__, path="/settings", name="Settings", order=99)

# ---------------------------------------------------------------------------
# Theme options
# ---------------------------------------------------------------------------

_THEMES = {
    "Darkly": "darkly",
    "Cyborg": "cyborg",
    "Slate": "slate",
    "Solar": "solar",
    "Superhero": "superhero",
    "Vapor": "vapor",
}

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
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    html.H4("Settings", className="mb-4", style={"color": "#e6edf3", "fontWeight": "600"}),

    # ── Theme ─────────────────────────────────────────────────────
    html.Div([
        html.Div([
            html.I(className="bi bi-palette me-2"),
            "Appearance",
        ], className="card-header"),
        html.Div([
            html.Label("Dashboard Theme", className="settings-label"),
            html.P(
                "Select a Bootswatch dark theme. Changes apply on next restart.",
                className="text-muted mb-2", style={"fontSize": ".82rem"},
            ),
            dbc.RadioItems(
                id="settings-theme",
                options=[{"label": k, "value": v} for k, v in _THEMES.items()],
                value="darkly",
                inline=True,
                className="settings-radio",
            ),
            html.Div(id="settings-theme-msg", className="mt-2"),
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
                    _about_row("VS Code Storage", str(VSCODE_STORAGE_ROOT)),
                ])
            ], className="table table-dark table-sm mb-0",
               style={"--bs-table-bg": "transparent"}),
            html.Div([
                html.A(
                    [html.I(className="bi bi-github me-1"), "Repository"],
                    href="https://github.com/SachiHarshitha/copilot-token-estimator",
                    target="_blank",
                    className="btn btn-outline-secondary btn-sm me-2",
                ),
                html.A(
                    [html.I(className="bi bi-bug me-1"), "Report Issue"],
                    href="https://github.com/SachiHarshitha/copilot-token-estimator/issues",
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

    # Store for theme persistence
    dcc.Store(id="settings-theme-store", storage_type="local"),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(
    Output("settings-theme-msg", "children"),
    Input("settings-theme", "value"),
    prevent_initial_call=True,
)
def _theme_changed(theme):
    return dbc.Alert(
        f"Theme '{theme}' selected. Restart the dashboard to apply.",
        color="info",
        dismissable=True,
        className="mb-0 py-2",
        style={"fontSize": ".84rem"},
    )


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
