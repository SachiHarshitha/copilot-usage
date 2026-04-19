"""Dash multi-page application factory."""
from __future__ import annotations

import os
import sys

import dash
import dash_bootstrap_components as dbc
from dash import dcc, html, page_container
from dash_bootstrap_templates import ThemeChangerAIO


def _resolve_dash_folder(subfolder: str) -> str:
    """Return absolute path to a dashboard subfolder, PyInstaller-aware."""
    if getattr(sys, "frozen", False):
        # Running as a PyInstaller bundle – data files live under _MEIPASS
        base = os.path.join(sys._MEIPASS, "copilot_usage", "dashboard")  # type: ignore[attr-defined]
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, subfolder)

_COPILOT_LOGO = html.Img(
    src="/assets/favicon.svg",
    height="28",
    className="me-2",
)

# Available themes (dark-oriented Bootswatch)
THEME_OPTIONS = [
    {"label": "Darkly", "value": dbc.themes.DARKLY},
    {"label": "Cyborg", "value": dbc.themes.CYBORG},
    {"label": "Slate", "value": dbc.themes.SLATE},
    {"label": "Solar", "value": dbc.themes.SOLAR},
    {"label": "Superhero", "value": dbc.themes.SUPERHERO},
    {"label": "Vapor", "value": dbc.themes.VAPOR},
    {"label": "Flatly (Light)", "value": dbc.themes.FLATLY},
    {"label": "Cosmo (Light)", "value": dbc.themes.COSMO},
]


def create_app() -> dash.Dash:
    # Ensure loguru is configured even when starting in dashboard-only mode
    from copilot_usage.logging import setup_logging
    setup_logging()

    app = dash.Dash(
        __name__,
        use_pages=True,
        pages_folder=_resolve_dash_folder("pages"),
        external_stylesheets=[
            dbc.themes.DARKLY,
            dbc.icons.BOOTSTRAP,
        ],
        title="Copilot Usage",
        update_title=None,
        suppress_callback_exceptions=True,
        assets_folder=_resolve_dash_folder("assets"),
    )
    app._favicon = "favicon.svg"

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
                        dbc.NavItem(dbc.NavLink(
                            [html.I(className="bi bi-grid me-1"), "Overview"],
                            href="/", active="exact", className="nav-btn",
                        )),
                        dbc.NavItem(dbc.NavLink(
                            [html.I(className="bi bi-search me-1"), "Explorer"],
                            href="/explorer", active="exact", className="nav-btn",
                        )),
                        dbc.NavItem(dbc.NavLink(
                            [html.I(className="bi bi-play-circle me-1"), "Pipeline"],
                            href="/pipeline", active="exact", className="nav-btn",
                        )),
                        dbc.NavItem(dbc.NavLink(
                            [html.I(className="bi bi-award me-1"), "Badges"],
                            href="/badges", active="exact", className="nav-btn",
                        )),
                        dbc.NavItem(dbc.NavLink(
                            html.I(className="bi bi-gear"),
                            href="/settings", active="exact",
                            className="nav-btn nav-btn-icon ms-2",
                        )),
                        dbc.NavItem(
                            html.A(
                                [html.I(className="bi bi-star me-1"), "Star"],
                                href="https://github.com/SachiHarshitha/copilot-usage",
                                target="_blank",
                                rel="noopener noreferrer",
                                className="btn btn-outline-warning btn-sm ms-3",
                                style={"fontSize": "0.8rem"},
                            ),
                        ),
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
            className="kpi-card text-center px-3 py-2",
        ),
        xs=6, sm=4, md=2,
    )
