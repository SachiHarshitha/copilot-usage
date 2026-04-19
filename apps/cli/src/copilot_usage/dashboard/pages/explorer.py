"""Explorer page — search, filter, and browse event-level data."""
from __future__ import annotations

import io

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, ctx, dash_table, dcc, html

from copilot_usage.dashboard import queries
from copilot_usage.dashboard.app import short_path

dash.register_page(__name__, path="/explorer", name="Explorer", order=1)

PAGE_SIZE = 100

# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

layout = html.Div([
    # Filter bar
    html.Div([
        dbc.Row([
            dbc.Col([
                html.Label("Search"),
                dbc.Input(
                    id="ex-search", type="text",
                    placeholder="Session ID, workspace, or model…",
                    debounce=True,
                    className="bg-dark text-light border-secondary",
                ),
            ], md=4),
            dbc.Col([
                html.Label("Workspace"),
                dcc.Dropdown(
                    id="ex-workspace", multi=True,
                    placeholder="All workspaces",
                    className="dash-dark-dropdown",
                ),
            ], md=3),
            dbc.Col([
                html.Label("Model"),
                dcc.Dropdown(
                    id="ex-model", multi=True,
                    placeholder="All models",
                    className="dash-dark-dropdown",
                ),
            ], md=3),
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
                html.Label("\u00a0"),
                html.Div([
                    dbc.Button("Apply", id="ex-apply", color="primary", className="me-2"),
                    dbc.Button("Reset", id="ex-reset", color="secondary", outline=True),
                    dbc.Button(
                        [html.I(className="bi bi-download me-1"), "CSV"],
                        id="ex-download-csv-btn", color="success", outline=True,
                        size="sm", className="ms-3",
                    ),
                    dbc.Button(
                        [html.I(className="bi bi-file-earmark-excel me-1"), "Excel"],
                        id="ex-download-xlsx-btn", color="success", outline=True,
                        size="sm", className="ms-1",
                    ),
                ], className="d-flex align-items-center"),
            ], md=8),
        ], className="g-3 mt-2"),
    ], className="filter-bar"),

    # Results DataTable with native sorting
    html.Div([
        html.Div([
            html.Span("Events", style={"fontWeight": "600"}),
            html.Span(id="ex-result-count", className="text-muted ms-3",
                      style={"fontSize": "0.82rem", "fontWeight": "400"}),
        ], className="card-header d-flex align-items-center"),
        dash_table.DataTable(
            id="ex-datatable",
            columns=[
                {"name": "Date", "id": "date"},
                {"name": "Session", "id": "session"},
                {"name": "Workspace", "id": "workspace"},
                {"name": "Model", "id": "model"},
                {"name": "Req #", "id": "req", "type": "numeric"},
                {"name": "Prompt", "id": "prompt", "type": "numeric"},
                {"name": "Output", "id": "output", "type": "numeric"},
                {"name": "Tools", "id": "tools", "type": "numeric"},
                {"name": "Premium", "id": "premium", "type": "numeric"},
                {"name": "Source", "id": "source"},
            ],
            data=[],
            sort_action="custom",
            sort_mode="single",
            sort_by=[{"column_id": "date", "direction": "desc"}],
            page_action="custom",
            page_current=0,
            page_size=PAGE_SIZE,
            page_count=1,
            style_table={"overflowX": "auto"},
            style_header={
                "backgroundColor": "#161b22",
                "color": "#c9d1d9",
                "fontWeight": "600",
                "borderBottom": "1px solid #30363d",
                "cursor": "pointer",
            },
            style_cell={
                "backgroundColor": "#0d1117",
                "color": "#c9d1d9",
                "borderBottom": "1px solid #21262d",
                "borderRight": "none",
                "fontSize": "0.84rem",
                "padding": "8px 12px",
                "textAlign": "left",
                "whiteSpace": "nowrap",
                "overflow": "hidden",
                "textOverflow": "ellipsis",
                "maxWidth": "200px",
            },
            style_data_conditional=[
                {"if": {"row_index": "odd"},
                 "backgroundColor": "#161b22"},
                {"if": {"filter_query": "{source} contains 'Legacy'"},
                 "color": "#d29922"},
            ],
            style_filter={
                "backgroundColor": "#161b22",
                "color": "#c9d1d9",
            },
        ),
    ], className="section-card"),

    # Stores & download
    dcc.Store(id="ex-total-rows", data=0),
    dcc.Download(id="ex-download"),
    dcc.Interval(id="ex-init", interval=300, max_intervals=1),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

# Map DataTable column_id → query sort key prefix
_COL_SORT_MAP = {
    "date": "ts",
    "workspace": "workspace",
    "model": "model",
    "prompt": "prompt",
    "output": "output",
    "premium": "premium",
}


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
        Output("ex-datatable", "data"),
        Output("ex-datatable", "page_count"),
        Output("ex-result-count", "children"),
        Output("ex-total-rows", "data"),
    ],
    [
        Input("ex-apply", "n_clicks"),
        Input("ex-init", "n_intervals"),
        Input("ex-datatable", "page_current"),
        Input("ex-datatable", "sort_by"),
    ],
    [
        State("ex-search", "value"),
        State("ex-workspace", "value"),
        State("ex-model", "value"),
        State("ex-min-tokens", "value"),
        State("ex-dates", "start_date"),
        State("ex-dates", "end_date"),
    ],
)
def _apply_filters(_clicks, _init, page_current, sort_by,
                   search, workspaces, models, min_tokens,
                   start_date, end_date):
    page = page_current or 0
    offset = page * PAGE_SIZE

    # Translate DataTable sort_by to query sort key
    query_sort = "ts_desc"
    if sort_by and len(sort_by) > 0:
        col = sort_by[0].get("column_id", "date")
        direction = sort_by[0].get("direction", "desc")
        prefix = _COL_SORT_MAP.get(col, "ts")
        query_sort = f"{prefix}_{direction}"

    total, rows = queries.explorer_events(
        search=search or None,
        workspace_ids=workspaces or None,
        model_ids=models or None,
        min_tokens=int(min_tokens) if min_tokens else None,
        start_date=start_date or None,
        end_date=end_date or None,
        sort_by=query_sort,
        limit=PAGE_SIZE,
        offset=offset,
    )

    page_count = max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE)
    count_text = f"Showing {offset + 1}–{min(offset + PAGE_SIZE, total)} of {total:,} events"
    if total == 0:
        count_text = "No matching events"

    # Build flat data for DataTable
    data = []
    for r in rows:
        src = "Legacy ≈" if r["data_source"] == "legacy_json" else "JSONL"
        if r["tokens_estimated"] and "Legacy" not in src:
            src += " ≈"
        data.append({
            "date": r["date_str"],
            "session": r["session_short"],
            "workspace": short_path(r["workspace_path"]),
            "model": (r["model_id"] or "").replace("copilot/", ""),
            "req": r["request_index"],
            "prompt": r["prompt_tokens"],
            "output": r["output_tokens"],
            "tools": r["tool_call_rounds"],
            "premium": round(r["premium"], 1),
            "source": src,
        })

    return data, page_count, count_text, total


@callback(
    [
        Output("ex-search", "value"),
        Output("ex-workspace", "value"),
        Output("ex-model", "value"),
        Output("ex-min-tokens", "value"),
        Output("ex-dates", "start_date"),
        Output("ex-dates", "end_date"),
        Output("ex-datatable", "sort_by"),
        Output("ex-datatable", "page_current"),
    ],
    Input("ex-reset", "n_clicks"),
    prevent_initial_call=True,
)
def _reset(_):
    return "", [], [], None, None, None, [{"column_id": "date", "direction": "desc"}], 0


def _gather_export_rows(search, workspaces, models, min_tokens, start_date, end_date):
    """Fetch all filtered rows (no pagination) for export."""
    _total, rows = queries.explorer_events(
        search=search or None,
        workspace_ids=workspaces or None,
        model_ids=models or None,
        min_tokens=int(min_tokens) if min_tokens else None,
        start_date=start_date or None,
        end_date=end_date or None,
        sort_by="ts_desc",
        limit=100_000,
        offset=0,
    )
    records = []
    for r in rows:
        records.append({
            "Date": r["date_str"],
            "Session": r["session_id"],
            "Workspace": r["workspace_path"],
            "Model": r["model_id"] or "",
            "Request #": r["request_index"],
            "Prompt Tokens": r["prompt_tokens"],
            "Output Tokens": r["output_tokens"],
            "Tool Rounds": r["tool_call_rounds"],
            "Premium Estimate": round(r["premium"], 2),
            "Source": r["data_source"],
            "Estimated": r["tokens_estimated"],
        })
    return records


@callback(
    Output("ex-download", "data"),
    [Input("ex-download-csv-btn", "n_clicks"),
     Input("ex-download-xlsx-btn", "n_clicks")],
    [
        State("ex-search", "value"),
        State("ex-workspace", "value"),
        State("ex-model", "value"),
        State("ex-min-tokens", "value"),
        State("ex-dates", "start_date"),
        State("ex-dates", "end_date"),
    ],
    prevent_initial_call=True,
)
def _download(csv_clicks, xlsx_clicks, search, workspaces, models,
              min_tokens, start_date, end_date):
    import pandas as pd

    triggered = ctx.triggered_id
    if not triggered:
        return dash.no_update

    records = _gather_export_rows(search, workspaces, models, min_tokens,
                                  start_date, end_date)
    if not records:
        return dash.no_update

    df = pd.DataFrame(records)

    if triggered == "ex-download-xlsx-btn":
        buf = io.BytesIO()
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Events")
        buf.seek(0)
        return dcc.send_bytes(buf.getvalue(), "copilot_usage_events.xlsx")

    # Default: CSV
    return dcc.send_data_frame(df.to_csv, "copilot_usage_events.csv", index=False)
