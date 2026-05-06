"""Cost Estimator page — monthly USD projection, plan impact, trend."""
from __future__ import annotations

import math

import dash
import dash_bootstrap_components as dbc
import plotly.graph_objects as go
from dash import Input, Output, State, callback, dcc, html

import copilot_usage.dashboard.queries as queries
from copilot_usage.dashboard.app import empty_fig
from copilot_usage.pricing import (
    PLAN_ALLOWANCES,
    CopilotPlan,
    compute_monthly_cost,
    compute_plan_impact,
    compute_trend,
)

dash.register_page(__name__, path="/cost", name="Cost Estimator", order=4)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WINDOW_OPTIONS = [
    {"label": "Last 7 days",  "value": 7},
    {"label": "Last 30 days", "value": 30},
    {"label": "Last 90 days", "value": 90},
]

PLAN_OPTIONS = [{"label": a.display_name, "value": k} for k, a in PLAN_ALLOWANCES.items()]

# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------

def _kpi_card(title: str, value_id: str, sub_id: str | None = None, color: str = "primary"):
    children = [
        html.Div(title, className="card-kpi-label"),
        html.Div("—", id=value_id, className="card-kpi-value"),
    ]
    if sub_id:
        children.append(html.Div("", id=sub_id, className="card-kpi-sub text-muted"))
    return dbc.Col(
        html.Div(children, className=f"section-card p-3 h-100 border-{color}"),
        xs=6, md=3,
    )


def _plan_select():
    return html.Div([
        html.Div("Plan Settings", className="card-header"),
        html.Div([
            dbc.Row([
                dbc.Col([
                    html.Label("Copilot Plan", className="settings-label"),
                    dcc.Dropdown(
                        id="cost-plan-select",
                        options=PLAN_OPTIONS,
                        value="pro",
                        clearable=False,
                        className="theme-dropdown",
                    ),
                ], md=4),
                dbc.Col([
                    html.Label("Observation Window", className="settings-label"),
                    dcc.Dropdown(
                        id="cost-window-select",
                        options=WINDOW_OPTIONS,
                        value=30,
                        clearable=False,
                        className="theme-dropdown",
                    ),
                ], md=3),
                dbc.Col([
                    html.Label("Extra Budget (USD/month)", className="settings-label"),
                    dbc.Input(
                        id="cost-extra-budget",
                        type="number", min=0, step=1,
                        value=0,
                        placeholder="0",
                        className="theme-input",
                        size="sm",
                    ),
                ], md=3),
                dbc.Col([
                    html.Label("\u00a0", className="settings-label d-block"),
                    dbc.Button(
                        [html.I(className="bi bi-save me-1"), "Save"],
                        id="cost-save-btn",
                        color="primary", size="sm",
                    ),
                    html.Span("", id="cost-save-msg", className="ms-2 text-success",
                              style={"fontSize": ".8rem"}),
                ], md=2, className="d-flex align-items-end gap-2"),
            ]),
        ], className="p-3"),
    ], className="section-card mb-4")


# ---------------------------------------------------------------------------
# Page layout
# ---------------------------------------------------------------------------

layout = html.Div([
    dcc.Store(id="cost-data-store"),

    # Settings row
    _plan_select(),

    # KPI row
    dbc.Row(id="cost-kpi-row", className="g-3 mb-4", children=[
        _kpi_card("Est. Monthly Cost",   "cost-kpi-usd",     "cost-kpi-usd-sub"),
        _kpi_card("AI Credits / Month",  "cost-kpi-credits",  "cost-kpi-credits-sub"),
        _kpi_card("Plan Allowance",      "cost-kpi-included", color="success"),
        _kpi_card("Est. Overage",        "cost-kpi-overage",  color="danger"),
    ]),

    # Trend alert
    html.Div(id="cost-trend-alert", className="mb-4"),

    # Plan status alert
    html.Div(id="cost-plan-alert", className="mb-4"),

    # Breakdown table
    dbc.Row([
        dbc.Col(
            html.Div([
                html.Div("Per-Model Cost Breakdown", className="card-header"),
                html.Div(id="cost-table-container", className="p-2"),
            ], className="section-card"),
            lg=8,
        ),
        dbc.Col(
            html.Div([
                html.Div("Cost Distribution", className="card-header"),
                dcc.Graph(
                    id="cost-pie",
                    config={"displayModeBar": False},
                    style={"height": "360px"},
                ),
            ], className="section-card"),
            lg=4,
        ),
    ], className="g-3 mb-4"),
])


# ---------------------------------------------------------------------------
# Callbacks
# ---------------------------------------------------------------------------

@callback(
    Output("cost-data-store", "data"),
    Input("cost-window-select", "value"),
    prevent_initial_call=False,
)
def _load_cost_data(days: int):
    """Fetch raw token data and pack into store."""
    rows = queries.cost_by_model(days=int(days or 30))
    windows = queries.token_totals_windows()
    return {"rows": rows, "windows": windows, "days": int(days or 30)}


@callback(
    Output("cost-plan-select",   "value"),
    Output("cost-extra-budget",  "value"),
    Input("cost-window-select",  "value"),   # triggers on load
    prevent_initial_call=False,
)
def _load_saved_settings(_):
    """Restore persisted plan + budget from DB."""
    plan  = queries.get_cost_setting("cost.plan", "pro")
    budget = queries.get_cost_setting("cost.extra_budget_usd", "0")
    try:
        budget_val = float(budget)
    except (ValueError, TypeError):
        budget_val = 0.0
    return plan, budget_val


@callback(
    Output("cost-save-msg", "children"),
    Input("cost-save-btn", "n_clicks"),
    State("cost-plan-select", "value"),
    State("cost-extra-budget", "value"),
    prevent_initial_call=True,
)
def _save_settings(_, plan: str, budget):
    queries.save_cost_setting("cost.plan", plan or "pro")
    queries.save_cost_setting("cost.extra_budget_usd", str(budget or 0))
    return "Saved"


@callback(
    Output("cost-kpi-usd",          "children"),
    Output("cost-kpi-usd-sub",      "children"),
    Output("cost-kpi-credits",      "children"),
    Output("cost-kpi-credits-sub",  "children"),
    Output("cost-kpi-included",     "children"),
    Output("cost-kpi-overage",      "children"),
    Output("cost-trend-alert",      "children"),
    Output("cost-plan-alert",       "children"),
    Output("cost-table-container",  "children"),
    Output("cost-pie",              "figure"),
    Input("cost-data-store",        "data"),
    Input("cost-plan-select",       "value"),
    Input("cost-extra-budget",      "value"),
    prevent_initial_call=False,
)
def _render_cost(store, plan_id: str, extra_budget):
    if not store:
        empty = empty_fig()
        return ("—", "", "—", "", "—", "—", None, None, html.P("No data."), empty)

    rows = store.get("rows", [])
    days = store.get("days", 30)
    windows = store.get("windows", {})

    extra_usd = float(extra_budget or 0)
    plan_id = plan_id or "pro"

    summary = compute_monthly_cost(rows, days_observed=days)
    impact  = compute_plan_impact(summary, plan_id, extra_usd)

    # ── KPIs ────────────────────────────────────────────────────────────────
    usd_str      = f"${summary.total_monthly_usd:.2f}"
    credits_str  = f"{summary.total_monthly_credits:,}"
    usd_sub      = f"based on {days}-day window"
    credits_sub  = "AI Credits"

    included_str = "—"
    overage_str  = "—"
    if impact.included_credits is not None:
        included_str = f"{impact.included_credits:,}"
    if impact.overage_credits > 0:
        overage_str = f"{impact.overage_credits:,} (${impact.estimated_extra_usd:.2f})"
    else:
        overage_str = "None"

    # ── Trend alert ─────────────────────────────────────────────────────────
    trend_el = None
    last_30 = windows.get("last_30d", 0)
    last_90 = windows.get("last_90d", 0)
    days_90 = windows.get("days_90", 0)
    if days_90 >= 30 and last_90 > 0:
        result = compute_trend(last_30, last_90)
        if result is not None:
            delta_pct, label = result
            color = "warning" if delta_pct > 20 else ("success" if delta_pct < -20 else "info")
            icon  = "bi-graph-up-arrow" if delta_pct >= 0 else "bi-graph-down-arrow"
            trend_el = dbc.Alert(
                [html.I(className=f"bi {icon} me-2"), label],
                color=color, className="mb-0",
            )

    # ── Plan alert ──────────────────────────────────────────────────────────
    plan_el = None
    status_map = {
        "within_allowance":              ("success", "bi-check-circle", "Within plan allowance"),
        "over_allowance_within_budget":  ("warning", "bi-exclamation-triangle",
                                          "Over allowance but within extra budget"),
        "over_allowance_exceeds_budget": ("danger",  "bi-x-circle",
                                          "Over allowance and exceeds extra budget"),
        "pooled_org":                    ("info",    "bi-people", "Organisation pooled plan"),
        "estimate_only":                 ("secondary","bi-info-circle", "Estimate only"),
    }
    if impact.status in status_map:
        sev, icon, msg = status_map[impact.status]
        body_parts: list = [html.Strong(f"{msg}. ")]
        for w in impact.warnings:
            body_parts.append(html.Span(w))
        plan_el = dbc.Alert(
            [html.I(className=f"bi {icon} me-2")] + body_parts,
            color=sev, className="mb-0",
        )

    # ── Table ───────────────────────────────────────────────────────────────
    if not summary.rows:
        table_el = html.P("No model data available for this window.", className="text-muted p-2")
    else:
        header = html.Thead(html.Tr([
            html.Th("Model"),
            html.Th("Provider"),
            html.Th("Prompt Tokens (mo)"),
            html.Th("Output Tokens (mo)"),
            html.Th("Input Cost"),
            html.Th("Output Cost"),
            html.Th("Total / mo"),
            html.Th("Credits"),
        ]))
        body_rows = []
        for r in summary.rows:
            body_rows.append(html.Tr([
                html.Td(r.display_name),
                html.Td(r.provider, className="text-muted"),
                html.Td(f"{r.monthly_prompt_tokens:,.0f}"),
                html.Td(f"{r.monthly_output_tokens:,.0f}"),
                html.Td(f"${r.input_cost_usd:.4f}"),
                html.Td(f"${r.output_cost_usd:.4f}"),
                html.Td(html.Strong(f"${r.total_cost_usd:.4f}")),
                html.Td(f"{r.monthly_credits:,}"),
            ]))
        body_rows.append(html.Tr([
            html.Td(html.Strong("Total"), colSpan=6),
            html.Td(html.Strong(f"${summary.total_monthly_usd:.4f}")),
            html.Td(html.Strong(f"{summary.total_monthly_credits:,}")),
        ], className="table-active"))
        table_el = dbc.Table(
            [header, html.Tbody(body_rows)],
            bordered=True, hover=True, responsive=True,
            size="sm", className="mb-0",
            style={"fontSize": ".82rem"},
        )

    # ── Pie chart ───────────────────────────────────────────────────────────
    pie_rows = [r for r in summary.rows if r.total_cost_usd > 0]
    if pie_rows:
        labels = [r.display_name for r in pie_rows]
        values = [r.total_cost_usd for r in pie_rows]
        fig = go.Figure(go.Pie(
            labels=labels, values=values,
            hole=0.45,
            textinfo="percent+label",
            hovertemplate="<b>%{label}</b><br>$%{value:.4f}/mo<extra></extra>",
        ))
        fig.update_layout(
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font={"color": "#e6edf3"},
            showlegend=False,
            margin={"t": 10, "b": 10, "l": 10, "r": 10},
        )
    else:
        fig = empty_fig()

    return (
        usd_str, usd_sub,
        credits_str, credits_sub,
        included_str, overage_str,
        trend_el, plan_el,
        table_el, fig,
    )
