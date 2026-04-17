"""Dash multi-page application factory."""
from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
from dash import dcc, html, page_container

_COPILOT_LOGO = html.Img(
    src="https://github.githubassets.com/favicons/favicon-dark.svg",
    height="24",
    className="me-2",
    style={"filter": "brightness(1.8)"},
)


def create_app() -> dash.Dash:
    app = dash.Dash(
        __name__,
        use_pages=True,
        pages_folder="pages",
        external_stylesheets=[dbc.themes.DARKLY],
        title="Copilot Usage",
        update_title=None,
        suppress_callback_exceptions=True,
    )

    navbar = dbc.Navbar(
        dbc.Container(
            [
                dbc.NavbarBrand(
                    [_COPILOT_LOGO, "Copilot Usage"],
                    href="/",
                    className="d-flex align-items-center",
                ),
                dbc.Nav(
                    [
                        dbc.NavItem(dbc.NavLink("Overview", href="/", active="exact")),
                        dbc.NavItem(dbc.NavLink("Explorer", href="/explorer", active="exact")),
                    ],
                    className="ms-auto",
                    pills=True,
                ),
            ],
            fluid=True,
        ),
        color="dark",
        dark=True,
        className="mb-4",
        style={"borderBottom": "1px solid #30363d"},
    )

    app.layout = html.Div(
        [
            navbar,
            dbc.Container(page_container, fluid=True, className="px-4 pb-4"),
        ],
        style={"minHeight": "100vh"},
    )

    return app


# ---------------------------------------------------------------------------
# Shared helpers used by pages
# ---------------------------------------------------------------------------

def fmt_number(n: int | float) -> str:
    """Format large numbers with K/M suffix."""
    n = int(n)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,}"


def short_path(p: str) -> str:
    """Show last 2 path segments of a workspace path."""
    if not p:
        return "\u2014"
    parts = p.replace("\\", "/").rstrip("/").split("/")
    return "/".join(parts[-2:]) if len(parts) >= 2 else p


def empty_fig(msg: str):
    """Return a dark-themed empty figure with a centered message."""
    import plotly.graph_objects as go
    fig = go.Figure()
    fig.add_annotation(text=msg, showarrow=False, font=dict(size=16, color="#8b949e"))
    fig.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=40, b=20),
    )
    return fig


def kpi_card(label: str, value: str, icon: str = "") -> dbc.Col:
    """Build a single KPI card column."""
    return dbc.Col(
        html.Div(
            [
                html.Div(icon, className="kpi-icon mb-1") if icon else None,
                html.Div(value, className="kpi-value"),
                html.Div(label, className="kpi-label mt-1"),
            ],
            className="kpi-card text-center p-3",
        ),
        xs=6, sm=4, md=2,
    )
