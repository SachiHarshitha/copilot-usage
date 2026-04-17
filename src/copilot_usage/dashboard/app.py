"""Dash application factory."""
from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, callback, dcc, html

from copilot_usage.dashboard import queries


def create_app() -> dash.Dash:
    app = dash.Dash(
        __name__,
        external_stylesheets=[dbc.themes.DARKLY],
        title="Copilot Usage",
        update_title=None,
        suppress_callback_exceptions=True,
    )
    app.layout = _layout()
    _register_callbacks(app)
    return app


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

def _layout():
    return dbc.Container(
        [
            dbc.Row(
                dbc.Col(
                    html.H2("Copilot Usage Dashboard", className="text-center my-3"),
                ),
            ),
            # KPI Cards
            dbc.Row(id="kpi-row", className="mb-3"),
            # Date range filter
            dbc.Row(
                dbc.Col(
                    dcc.DatePickerRange(
                        id="date-range",
                        display_format="YYYY-MM-DD",
                        className="mb-3",
                    ),
                    width=4,
                ),
            ),
            # Charts row
            dbc.Row(
                [
                    dbc.Col(dcc.Graph(id="timeline-chart"), md=8),
                    dbc.Col(dcc.Graph(id="model-pie"), md=4),
                ],
                className="mb-3",
            ),
            # Workspace table
            dbc.Row(
                dbc.Col(
                    [
                        html.H5("Workspaces"),
                        html.Div(id="workspace-table"),
                    ]
                ),
                className="mb-3",
            ),
            # Sessions table
            dbc.Row(
                dbc.Col(
                    [
                        html.H5("Recent Sessions"),
                        html.Div(id="session-table"),
                    ]
                ),
                className="mb-4",
            ),
            # Hidden interval for initial load
            dcc.Interval(id="init-interval", interval=500, max_intervals=1),
        ],
        fluid=True,
        className="p-3",
    )


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

def _register_callbacks(app: dash.Dash) -> None:

    @app.callback(
        Output("kpi-row", "children"),
        Input("init-interval", "n_intervals"),
    )
    def update_kpis(_):
        kpi = queries.kpi_totals()
        return [
            _kpi_card("Requests", f"{kpi['total_requests']:,}"),
            _kpi_card("Prompt Tokens", _fmt(kpi["total_prompt"])),
            _kpi_card("Output Tokens", _fmt(kpi["total_output"])),
            _kpi_card("Premium Est.", f"~{kpi['total_premium']:,.0f}"),
            _kpi_card("Workspaces", str(kpi["workspaces"])),
            _kpi_card("Sessions", str(kpi["sessions"])),
        ]

    @app.callback(
        Output("timeline-chart", "figure"),
        Input("init-interval", "n_intervals"),
    )
    def update_timeline(_):
        import plotly.express as px

        rows = queries.daily_timeseries()
        if not rows:
            return _empty_fig("No data yet")
        import pandas as pd

        df = pd.DataFrame(rows)
        fig = px.bar(
            df,
            x="date",
            y="prompt_tokens",
            color="model",
            title="Daily Prompt Tokens by Model",
            labels={"prompt_tokens": "Prompt Tokens", "date": "Date"},
        )
        fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
        return fig

    @app.callback(
        Output("model-pie", "figure"),
        Input("init-interval", "n_intervals"),
    )
    def update_model_pie(_):
        import plotly.express as px

        rows = queries.model_mix()
        if not rows:
            return _empty_fig("No data yet")
        import pandas as pd

        df = pd.DataFrame(rows)
        # Clean model names for display
        df["model_short"] = df["model"].str.replace("copilot/", "", regex=False)
        fig = px.pie(
            df,
            values="total_tokens",
            names="model_short",
            title="Token Distribution by Model",
        )
        fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)")
        return fig

    @app.callback(
        Output("workspace-table", "children"),
        Input("init-interval", "n_intervals"),
    )
    def update_workspace_table(_):
        rows = queries.workspace_table()
        if not rows:
            return html.P("No data yet", className="text-muted")
        header = html.Thead(
            html.Tr([
                html.Th("Workspace"),
                html.Th("Requests"),
                html.Th("Prompt Tokens"),
                html.Th("Output Tokens"),
                html.Th("Premium Est."),
                html.Th("Top Model"),
            ])
        )
        body = html.Tbody([
            html.Tr([
                html.Td(_short_path(r["workspace_path"]), title=r["workspace_path"]),
                html.Td(f"{r['requests']:,}"),
                html.Td(_fmt(r["prompt_tokens"])),
                html.Td(_fmt(r["output_tokens"])),
                html.Td(f"~{r['premium']:.0f}"),
                html.Td((r["top_model"] or "").replace("copilot/", "")),
            ])
            for r in rows
        ])
        return dbc.Table([header, body], bordered=True, striped=True, hover=True, size="sm", color="dark")

    @app.callback(
        Output("session-table", "children"),
        Input("init-interval", "n_intervals"),
    )
    def update_session_table(_):
        rows = queries.session_list(limit=100)
        if not rows:
            return html.P("No data yet", className="text-muted")
        header = html.Thead(
            html.Tr([
                html.Th("Session"),
                html.Th("Workspace"),
                html.Th("Model"),
                html.Th("Requests"),
                html.Th("Prompt"),
                html.Th("Output"),
                html.Th("Premium"),
            ])
        )
        body = html.Tbody([
            html.Tr([
                html.Td(r["session_id"][:12] + "…", title=r["session_id"]),
                html.Td(_short_path(r["workspace_path"]), title=r["workspace_path"]),
                html.Td((r["model"] or "").replace("copilot/", "")),
                html.Td(str(r["requests"])),
                html.Td(_fmt(r["prompt_tokens"])),
                html.Td(_fmt(r["output_tokens"])),
                html.Td(f"~{r['premium']:.0f}"),
            ])
            for r in rows
        ])
        return dbc.Table([header, body], bordered=True, striped=True, hover=True, size="sm", color="dark")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _kpi_card(label: str, value: str) -> dbc.Col:
    return dbc.Col(
        dbc.Card(
            dbc.CardBody([
                html.H6(label, className="card-subtitle mb-1 text-muted"),
                html.H4(value, className="card-title mb-0"),
            ]),
            className="text-center",
        ),
        md=2,
    )


def _fmt(n: int | float) -> str:
    n = int(n)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,}"


def _short_path(p: str) -> str:
    if not p:
        return "—"
    # Show last 2 path segments
    parts = p.replace("\\", "/").rstrip("/").split("/")
    return "/".join(parts[-2:]) if len(parts) >= 2 else p


def _empty_fig(msg: str):
    import plotly.graph_objects as go

    fig = go.Figure()
    fig.add_annotation(text=msg, showarrow=False, font=dict(size=16, color="gray"))
    fig.update_layout(template="plotly_dark", paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)")
    return fig
