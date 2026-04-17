"""Overview page — KPI cards, timeline chart, model pie, workspace & session tables."""
from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from dash import Input, Output, callback, dcc, html

from copilot_usage.dashboard import queries
from copilot_usage.dashboard.app import empty_fig, fmt_number, kpi_card, short_path

dash.register_page(__name__, path="/", name="Overview", order=0)

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    # KPI row
    dbc.Row(id="ov-kpi-row", className="g-3 mb-4"),

    # Charts
    dbc.Row([
        dbc.Col(
            html.Div([
                html.Div("Daily Token Usage", className="card-header"),
                dcc.Graph(id="ov-timeline", config={"displayModeBar": False}),
            ], className="section-card"),
            lg=8,
        ),
        dbc.Col(
            html.Div([
                html.Div("Model Distribution", className="card-header"),
                dcc.Graph(id="ov-model-pie", config={"displayModeBar": False}),
            ], className="section-card"),
            lg=4,
        ),
    ], className="g-3 mb-4"),

    # Data source breakdown chart
    dbc.Row([
        dbc.Col(
            html.Div([
                html.Div([
                    html.Span("Data Source Breakdown"),
                    html.Span(
                        " JSONL = actual tokens · Legacy JSON = estimated tokens",
                        className="text-muted ms-2",
                        style={"fontSize": "0.75rem", "fontWeight": "400"},
                    ),
                ], className="card-header"),
                dcc.Graph(id="ov-source-chart", config={"displayModeBar": False}),
            ], className="section-card"),
            lg=12,
        ),
    ], className="g-3 mb-4"),

    # Tables
    dbc.Row([
        dbc.Col(
            html.Div([
                html.Div("Workspaces", className="card-header"),
                html.Div(id="ov-workspace-table", className="p-0"),
            ], className="section-card"),
            lg=6,
        ),
        dbc.Col(
            html.Div([
                html.Div("Recent Sessions", className="card-header"),
                html.Div(id="ov-session-table", className="p-0"),
            ], className="section-card"),
            lg=6,
        ),
    ], className="g-3 mb-4"),

    # Trigger initial load
    dcc.Interval(id="ov-init", interval=300, max_intervals=1),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(Output("ov-kpi-row", "children"), Input("ov-init", "n_intervals"))
def _kpis(_):
    kpi = queries.kpi_totals()
    legacy = kpi.get("legacy_events", 0) or 0
    estimated = kpi.get("estimated_events", 0) or 0
    total = kpi["total_requests"]
    new_count = total - legacy

    cards = [
        kpi_card("Requests",      f"{total:,}",                       "📨"),
        kpi_card("Prompt Tokens",  fmt_number(kpi["total_prompt"]),    "📝"),
        kpi_card("Output Tokens",  fmt_number(kpi["total_output"]),    "💬"),
        kpi_card("Premium Est.",   f"~{kpi['total_premium']:,.0f}",   "💎"),
        kpi_card("Workspaces",     str(kpi["workspaces"]),             "📂"),
        kpi_card("Sessions",       str(kpi["sessions"]),               "🗂️"),
    ]

    # Data-source breakdown bar (full-width, sits inside same Row)
    source_bar = dbc.Col(
        html.Div([
            html.Div([
                html.Span("📊", style={"fontSize": "1.1rem", "marginRight": "0.5rem"}),
                html.Span("Data Sources", className="kpi-label",
                          style={"textTransform": "uppercase", "letterSpacing": "0.5px"}),
            ], className="d-inline-flex align-items-center me-4"),
            html.Div([
                html.Span(f"{new_count:,}", style={"color": "#58a6ff", "fontWeight": "700", "fontSize": "1.1rem"}),
                html.Span(" JSONL", className="text-muted ms-1", style={"fontSize": ".8rem"}),
                html.Span("  ·  ", className="text-muted mx-2"),
                html.Span(f"{legacy:,}", style={"color": "#d29922", "fontWeight": "700", "fontSize": "1.1rem"}),
                html.Span(" Legacy", className="text-muted ms-1", style={"fontSize": ".8rem"}),
            ], className="d-inline-flex align-items-baseline me-4"),
            html.Div(
                f"({estimated:,} events with estimated tokens)",
                className="text-muted d-inline",
                style={"fontSize": ".78rem"},
            ) if estimated else None,
        ], className="kpi-card d-flex align-items-center justify-content-center flex-wrap px-4 py-2"),
        xs=12,
    )

    return cards + [source_bar]


@callback(Output("ov-timeline", "figure"), Input("ov-init", "n_intervals"))
def _timeline(_):
    rows = queries.daily_timeseries()
    if not rows:
        return empty_fig("No data yet")
    df = pd.DataFrame(rows)
    df["model_short"] = df["model"].str.replace("copilot/", "", regex=False)
    fig = px.bar(
        df, x="date", y="prompt_tokens", color="model_short",
        labels={"prompt_tokens": "Prompt Tokens", "date": "", "model_short": "Model"},
        color_discrete_sequence=px.colors.qualitative.Set2,
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=10, b=30, l=60, r=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        bargap=0.15,
        xaxis=dict(gridcolor="rgba(48,54,61,.5)"),
        yaxis=dict(gridcolor="rgba(48,54,61,.5)"),
    )
    return fig


@callback(Output("ov-source-chart", "figure"), Input("ov-init", "n_intervals"))
def _source_chart(_):
    rows = queries.daily_by_source()
    if not rows:
        return empty_fig("No data yet")
    df = pd.DataFrame(rows)
    label_map = {"jsonl": "JSONL (actual)", "legacy_json": "Legacy JSON (estimated)"}
    df["source_label"] = df["source"].map(label_map).fillna(df["source"])
    color_map = {"JSONL (actual)": "#58a6ff", "Legacy JSON (estimated)": "#d29922"}
    fig = go.Figure()
    for src_label, grp in df.groupby("source_label"):
        fig.add_trace(go.Bar(
            x=grp["date"], y=grp["prompt_tokens"],
            name=src_label,
            marker_color=color_map.get(src_label, "#888"),
        ))
    fig.update_layout(
        barmode="stack",
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=10, b=30, l=60, r=10),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        bargap=0.15,
        xaxis=dict(gridcolor="rgba(48,54,61,.5)", title=""),
        yaxis=dict(gridcolor="rgba(48,54,61,.5)", title="Prompt Tokens"),
    )
    return fig


@callback(Output("ov-model-pie", "figure"), Input("ov-init", "n_intervals"))
def _model_pie(_):
    rows = queries.model_mix()
    if not rows:
        return empty_fig("No data yet")
    df = pd.DataFrame(rows)
    df["model_short"] = df["model"].str.replace("copilot/", "", regex=False)
    fig = px.pie(
        df, values="total_tokens", names="model_short",
        color_discrete_sequence=px.colors.qualitative.Set2,
        hole=0.45,
    )
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=10, b=10, l=10, r=10),
        legend=dict(font=dict(size=11)),
    )
    fig.update_traces(textposition="inside", textinfo="percent+label", textfont_size=11)
    return fig


@callback(Output("ov-workspace-table", "children"), Input("ov-init", "n_intervals"))
def _ws_table(_):
    rows = queries.workspace_table()
    if not rows:
        return html.P("No data yet", className="text-muted p-3")
    header = html.Thead(html.Tr([
        html.Th("Workspace"), html.Th("Requests"), html.Th("Prompt"),
        html.Th("Output"), html.Th("Premium"), html.Th("Top Model"),
    ]))
    body = html.Tbody([
        html.Tr([
            html.Td(short_path(r["workspace_path"]), title=r["workspace_path"]),
            html.Td(f"{r['requests']:,}"),
            html.Td(fmt_number(r["prompt_tokens"])),
            html.Td(fmt_number(r["output_tokens"])),
            html.Td(f"~{r['premium']:.0f}"),
            html.Td((r["top_model"] or "").replace("copilot/", "")),
        ]) for r in rows
    ])
    return dbc.Table([header, body], striped=True, hover=True, size="sm",
                     color="dark", className="mb-0")


@callback(Output("ov-session-table", "children"), Input("ov-init", "n_intervals"))
def _sess_table(_):
    rows = queries.session_list(limit=50)
    if not rows:
        return html.P("No data yet", className="text-muted p-3")
    header = html.Thead(html.Tr([
        html.Th("Session"), html.Th("Workspace"), html.Th("Model"),
        html.Th("Reqs"), html.Th("Prompt"), html.Th("Output"), html.Th("Prem."),
    ]))
    body = html.Tbody([
        html.Tr([
            html.Td(r["session_id"][:12] + "…", title=r["session_id"]),
            html.Td(short_path(r["workspace_path"]), title=r["workspace_path"]),
            html.Td((r["model"] or "").replace("copilot/", "")),
            html.Td(str(r["requests"])),
            html.Td(fmt_number(r["prompt_tokens"])),
            html.Td(fmt_number(r["output_tokens"])),
            html.Td(f"~{r['premium']:.0f}"),
        ]) for r in rows
    ])
    return dbc.Table([header, body], striped=True, hover=True, size="sm",
                     color="dark", className="mb-0")
