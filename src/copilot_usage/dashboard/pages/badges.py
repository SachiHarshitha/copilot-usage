"""Badges page — generate and preview Shields.io badge JSON."""
from __future__ import annotations

import json

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html

from copilot_usage.config import BADGE_DIR
from copilot_usage.dashboard import queries
from copilot_usage.dashboard.app import fmt_number, short_path

dash.register_page(__name__, path="/badges", name="Badges", order=3)


def _shields_url(badge: dict) -> str:
    """Build a Shields.io static badge URL from badge JSON."""
    label = badge.get("label", "")
    message = badge.get("message", "")
    color = badge.get("color", "blue")
    logo = badge.get("namedLogo", "")
    parts = f"https://img.shields.io/badge/{_escape(label)}-{_escape(message)}-{color}"
    if logo:
        parts += f"?logo={logo}&logoColor=white"
    return parts


def _escape(s: str) -> str:
    return s.replace("-", "--").replace("_", "__").replace(" ", "_")


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    html.H4("Badge Generator", className="mb-3", style={"color": "#e6edf3"}),

    # Summary badge
    html.Div([
        html.Div("Summary Badge", className="card-header"),
        html.Div(id="bg-summary", className="p-3"),
    ], className="section-card mb-3"),

    # Custom badge builder
    html.Div([
        html.Div("Custom Badge Builder", className="card-header"),
        html.Div([
            dbc.Row([
                dbc.Col([
                    html.Label("Label", className="form-label badge-label"),
                    dbc.Input(id="bg-label", value="Copilot Tokens",
                              className="bg-dark text-light border-secondary"),
                ], md=3),
                dbc.Col([
                    html.Label("Color", className="form-label badge-label"),
                    dcc.Dropdown(
                        id="bg-color",
                        options=[
                            {"label": "🟢 green", "value": "green"},
                            {"label": "🔵 blue", "value": "blue"},
                            {"label": "🟠 orange", "value": "orange"},
                            {"label": "🔴 red", "value": "red"},
                            {"label": "🟣 purple", "value": "blueviolet"},
                            {"label": "⚫ dark", "value": "555"},
                        ],
                        value="blue",
                        clearable=False,
                        className="dash-dark-dropdown",
                    ),
                ], md=2),
                dbc.Col([
                    html.Label("Metric", className="form-label badge-label"),
                    dcc.Dropdown(
                        id="bg-metric",
                        options=[
                            {"label": "Total Tokens", "value": "total_tokens"},
                            {"label": "Requests", "value": "requests"},
                            {"label": "Prompt Tokens", "value": "prompt_tokens"},
                            {"label": "Output Tokens", "value": "output_tokens"},
                            {"label": "Premium Est.", "value": "premium"},
                        ],
                        value="total_tokens",
                        clearable=False,
                        className="dash-dark-dropdown",
                    ),
                ], md=3),
                dbc.Col([
                    html.Label("Workspace", className="form-label badge-label"),
                    dcc.Dropdown(
                        id="bg-workspace",
                        placeholder="All (summary)",
                        className="dash-dark-dropdown",
                    ),
                ], md=4),
            ], className="g-3 mb-3"),

            # Preview
            html.Div([
                html.Label("Preview", className="badge-label d-block mb-2"),
                html.Div(id="bg-preview", className="mb-3"),
            ]),

            # JSON output
            html.Div([
                html.Label("Badge JSON", className="badge-label d-block mb-2"),
                html.Pre(id="bg-json", className="console-output",
                         style={"maxHeight": "180px"}),
            ]),

            # Markdown
            html.Div([
                html.Label("Markdown", className="badge-label d-block mb-2"),
                html.Pre(id="bg-markdown", className="console-output",
                         style={"maxHeight": "60px"}),
            ]),
        ], className="p-3"),
    ], className="section-card mb-3"),

    # Per-workspace badges table
    html.Div([
        html.Div("Workspace Badges", className="card-header"),
        html.Div(id="bg-ws-table", className="p-0"),
    ], className="section-card mb-3"),

    # badge directory info
    html.Div([
        html.Small(
            f"Badge JSON files are exported to: {BADGE_DIR}",
            className="text-muted",
        ),
    ], className="mb-4"),

    # Init trigger
    dcc.Interval(id="bg-init", interval=300, max_intervals=1),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(
    [Output("bg-summary", "children"), Output("bg-ws-table", "children"),
     Output("bg-workspace", "options")],
    Input("bg-init", "n_intervals"),
)
def _load_badges(_):
    data = queries.badge_data()
    kpi = queries.kpi_totals()

    # Summary badge preview
    total_tok = kpi["total_prompt"] + kpi["total_output"]
    summary_badge = {
        "schemaVersion": 1,
        "label": "Copilot Usage",
        "message": f"{kpi['total_requests']} reqs | {fmt_number(total_tok)} tokens",
        "color": "green",
        "namedLogo": "githubcopilot",
    }
    summary_url = _shields_url(summary_badge)
    summary_content = html.Div([
        html.Img(src=summary_url, style={"height": "28px"}, className="mb-2"),
        html.Div([
            html.Code(json.dumps(summary_badge, indent=2),
                      className="d-block",
                      style={"fontSize": "0.8rem", "color": "#c9d1d9"}),
        ]),
    ])

    # Workspace table
    if not data:
        ws_table = html.P("No badge data. Run the pipeline first.", className="text-muted p-3")
    else:
        header = html.Thead(html.Tr([
            html.Th("Workspace"), html.Th("Requests"),
            html.Th("Prompt"), html.Th("Output"), html.Th("Badge Preview"),
        ]))
        rows = []
        for r in data:
            tok = (r["prompt_tokens"] or 0) + (r["output_tokens"] or 0)
            ws_badge = {
                "schemaVersion": 1, "label": "Copilot Tokens",
                "message": fmt_number(tok), "color": "blue", "namedLogo": "githubcopilot",
            }
            rows.append(html.Tr([
                html.Td(short_path(r["workspace_path"]), title=r["workspace_path"]),
                html.Td(f"{r['requests']:,}"),
                html.Td(fmt_number(r["prompt_tokens"] or 0)),
                html.Td(fmt_number(r["output_tokens"] or 0)),
                html.Td(html.Img(src=_shields_url(ws_badge), style={"height": "20px"})),
            ]))
        ws_table = dbc.Table([header, html.Tbody(rows)],
                             striped=True, hover=True, size="sm",
                             color="dark", className="mb-0")

    # Workspace dropdown options
    ws_opts = [{"label": short_path(d["workspace_path"]), "value": d["workspace_id"]}
               for d in data]

    return summary_content, ws_table, ws_opts


@callback(
    [Output("bg-preview", "children"), Output("bg-json", "children"),
     Output("bg-markdown", "children")],
    [Input("bg-label", "value"), Input("bg-color", "value"),
     Input("bg-metric", "value"), Input("bg-workspace", "value")],
)
def _build_custom(label, color, metric, workspace_id):
    data = queries.badge_data()
    kpi = queries.kpi_totals()

    # Determine the value
    if workspace_id:
        ws = next((d for d in data if d["workspace_id"] == workspace_id), None)
        if ws:
            values = {
                "total_tokens": (ws["prompt_tokens"] or 0) + (ws["output_tokens"] or 0),
                "requests": ws["requests"] or 0,
                "prompt_tokens": ws["prompt_tokens"] or 0,
                "output_tokens": ws["output_tokens"] or 0,
                "premium": ws["premium"] or 0,
            }
        else:
            values = {k: 0 for k in ["total_tokens", "requests", "prompt_tokens", "output_tokens", "premium"]}
    else:
        values = {
            "total_tokens": kpi["total_prompt"] + kpi["total_output"],
            "requests": kpi["total_requests"],
            "prompt_tokens": kpi["total_prompt"],
            "output_tokens": kpi["total_output"],
            "premium": kpi["total_premium"],
        }

    raw_val = values.get(metric or "total_tokens", 0)
    if metric == "premium":
        message = f"~{raw_val:,.0f}"
    else:
        message = fmt_number(raw_val)

    badge = {
        "schemaVersion": 1,
        "label": label or "Copilot",
        "message": message,
        "color": color or "blue",
        "namedLogo": "githubcopilot",
    }

    url = _shields_url(badge)
    preview = html.Img(src=url, style={"height": "28px"})
    badge_json = json.dumps(badge, indent=2)
    markdown = f"![{badge['label']}]({url})"

    return preview, badge_json, markdown
