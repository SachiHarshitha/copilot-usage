"""Explorer page — search, filter, and browse event-level data."""
from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html

from copilot_usage.dashboard import queries
from copilot_usage.dashboard.app import fmt_number, short_path

dash.register_page(__name__, path="/explorer", name="Explorer", order=1)

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    # Filter bar
    html.Div([
        dbc.Row([
            # Search
            dbc.Col([
                html.Label("Search"),
                dbc.Input(
                    id="ex-search", type="text",
                    placeholder="Session ID, workspace, or model…",
                    debounce=True,
                    className="bg-dark text-light border-secondary",
                ),
            ], md=4),
            # Workspace filter
            dbc.Col([
                html.Label("Workspace"),
                dcc.Dropdown(
                    id="ex-workspace", multi=True,
                    placeholder="All workspaces",
                    className="dash-dark-dropdown",
                ),
            ], md=3),
            # Model filter
            dbc.Col([
                html.Label("Model"),
                dcc.Dropdown(
                    id="ex-model", multi=True,
                    placeholder="All models",
                    className="dash-dark-dropdown",
                ),
            ], md=3),
            # Min tokens
            dbc.Col([
                html.Label("Min Tokens"),
                dbc.Input(
                    id="ex-min-tokens", type="number",
                    placeholder="0", min=0,
                    className="bg-dark text-light border-secondary",
                ),
            ], md=2),
        ], className="g-3"),
        dbc.Row([
            dbc.Col([
                html.Label("Date Range"),
                dcc.DatePickerRange(
                    id="ex-dates",
                    display_format="YYYY-MM-DD",
                    className="d-block",
                ),
            ], md=4),
            dbc.Col([
                html.Label("Sort By"),
                dcc.Dropdown(
                    id="ex-sort",
                    options=[
                        {"label": "Date (newest)", "value": "ts_desc"},
                        {"label": "Date (oldest)", "value": "ts_asc"},
                        {"label": "Prompt tokens ↓", "value": "prompt_desc"},
                        {"label": "Output tokens ↓", "value": "output_desc"},
                        {"label": "Premium ↓", "value": "premium_desc"},
                    ],
                    value="ts_desc",
                    clearable=False,
                    className="dash-dark-dropdown",
                ),
            ], md=2),
            dbc.Col([
                html.Label("\u00a0"),  # spacer
                html.Div([
                    dbc.Button("Apply", id="ex-apply", color="primary", className="me-2"),
                    dbc.Button("Reset", id="ex-reset", color="secondary", outline=True),
                ], className="d-flex"),
            ], md=2),
            dbc.Col([
                html.Label("\u00a0"),
                html.Div(id="ex-result-count", className="text-muted pt-2",
                          style={"fontSize": "0.85rem"}),
            ], md=4),
        ], className="g-3 mt-2"),
    ], className="filter-bar"),

    # Results table
    html.Div([
        html.Div("Events", className="card-header"),
        html.Div(id="ex-table", className="p-0", style={"overflowX": "auto"}),
    ], className="section-card"),

    # Pagination
    html.Div([
        dbc.Pagination(
            id="ex-pagination",
            max_value=1,
            active_page=1,
            fully_expanded=False,
            first_last=True,
            previous_next=True,
            className="justify-content-center mt-3",
        ),
    ]),

    # Stores
    dcc.Store(id="ex-page-size", data=100),
    dcc.Store(id="ex-total-rows", data=0),

    # Trigger initial filter options load
    dcc.Interval(id="ex-init", interval=300, max_intervals=1),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(
    [Output("ex-workspace", "options"), Output("ex-model", "options")],
    Input("ex-init", "n_intervals"),
)
def _load_filter_options(_):
    workspaces = queries.explorer_workspaces()
    models = queries.explorer_models()
    ws_opts = [{"label": short_path(w["path"]), "value": w["id"]} for w in workspaces]
    model_opts = [{"label": m.replace("copilot/", ""), "value": m} for m in models]
    return ws_opts, model_opts


@callback(
    [
        Output("ex-table", "children"),
        Output("ex-result-count", "children"),
        Output("ex-pagination", "max_value"),
        Output("ex-total-rows", "data"),
    ],
    [
        Input("ex-apply", "n_clicks"),
        Input("ex-init", "n_intervals"),
        Input("ex-pagination", "active_page"),
    ],
    [
        State("ex-search", "value"),
        State("ex-workspace", "value"),
        State("ex-model", "value"),
        State("ex-min-tokens", "value"),
        State("ex-dates", "start_date"),
        State("ex-dates", "end_date"),
        State("ex-sort", "value"),
        State("ex-page-size", "data"),
    ],
)
def _apply_filters(_clicks, _init, active_page,
                   search, workspaces, models, min_tokens,
                   start_date, end_date, sort_by, page_size):
    page = max(1, active_page or 1)
    offset = (page - 1) * page_size

    total, rows = queries.explorer_events(
        search=search or None,
        workspace_ids=workspaces or None,
        model_ids=models or None,
        min_tokens=int(min_tokens) if min_tokens else None,
        start_date=start_date or None,
        end_date=end_date or None,
        sort_by=sort_by or "ts_desc",
        limit=page_size,
        offset=offset,
    )

    max_pages = max(1, (total + page_size - 1) // page_size)
    count_text = f"Showing {offset + 1}–{min(offset + page_size, total)} of {total:,} events"
    if total == 0:
        count_text = "No matching events"

    if not rows:
        table = html.P("No events match your filters.", className="text-muted p-3")
    else:
        header = html.Thead(html.Tr([
            html.Th("Date"), html.Th("Session"), html.Th("Workspace"),
            html.Th("Model"), html.Th("Req #"), html.Th("Prompt"),
            html.Th("Output"), html.Th("Tools"), html.Th("Premium"),
        ]))
        body = html.Tbody([
            html.Tr([
                html.Td(r["date_str"]),
                html.Td(r["session_short"], title=r["session_id"]),
                html.Td(short_path(r["workspace_path"]), title=r["workspace_path"]),
                html.Td((r["model_id"] or "").replace("copilot/", "")),
                html.Td(str(r["request_index"])),
                html.Td(fmt_number(r["prompt_tokens"])),
                html.Td(fmt_number(r["output_tokens"])),
                html.Td(str(r["tool_call_rounds"])),
                html.Td(f"~{r['premium']:.1f}"),
            ]) for r in rows
        ])
        table = dbc.Table([header, body], striped=True, hover=True, size="sm",
                          color="dark", className="mb-0")

    return table, count_text, max_pages, total


@callback(
    [
        Output("ex-search", "value"),
        Output("ex-workspace", "value"),
        Output("ex-model", "value"),
        Output("ex-min-tokens", "value"),
        Output("ex-dates", "start_date"),
        Output("ex-dates", "end_date"),
        Output("ex-sort", "value"),
    ],
    Input("ex-reset", "n_clicks"),
    prevent_initial_call=True,
)
def _reset(_):
    return "", [], [], None, None, None, "ts_desc"
