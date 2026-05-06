"""Textual-based terminal UI dashboard for Copilot usage stats."""
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.widgets import Button, DataTable, Footer, Header, Label, ProgressBar, Static


def _fmt_tokens(n: int | float) -> str:
    """Format token count with comma separators."""
    return f"{int(n):,}"


def _fmt_prem(n: float) -> str:
    """Format premium as 1.2x etc."""
    return f"{n:.1f}×" if n else "0×"


def _load_dashboard_queries():
    """Import dashboard query helpers.

    Wrapped in a helper so TUI actions can fail gracefully in frozen builds
    instead of throwing an unhandled ModuleNotFoundError.
    """
    try:
        import copilot_usage.dashboard.queries as queries_module
    except Exception as exc:
        raise RuntimeError("Dashboard query module is unavailable in this build") from exc
    return queries_module


class KpiCard(Static):
    """A single KPI metric card."""

    def __init__(self, title: str, value: str = "–", **kw) -> None:
        super().__init__(**kw)
        self._title = title
        self._value = value

    def compose(self) -> ComposeResult:
        yield Label(self._value, id="kpi-value", classes="kpi-value")
        yield Label(self._title, classes="kpi-label")

    def update_value(self, value: str) -> None:
        self._value = value
        try:
            self.query_one("#kpi-value", Label).update(value)
        except Exception:
            pass


class CostDetailModal(ModalScreen):
    """Modal popup showing per-model cost breakdown and plan impact."""

    BINDINGS = [("escape", "dismiss", "Close")]

    CSS = """
    CostDetailModal {
        align: center middle;
    }
    #cost-modal-dialog {
        width: 90%;
        max-height: 80%;
        background: $surface;
        border: solid $primary;
        padding: 1 2;
    }
    .cost-modal-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }
    .cost-col-r {
        text-align: right;
    }
    """

    def __init__(self, cost_data: dict) -> None:
        super().__init__()
        self._cost_data = cost_data

    def compose(self) -> ComposeResult:
        summary = self._cost_data.get("summary")
        impact  = self._cost_data.get("impact")
        trend   = self._cost_data.get("trend")

        with Vertical(id="cost-modal-dialog"):
            yield Label("Cost Estimator", classes="cost-modal-title")

            if summary is None:
                yield Label("No cost data available. Run a scan first.", classes="text-muted")
            else:
                # Per-model table
                dt = DataTable(id="cost-modal-table", show_header=True)
                dt.add_columns("Model", "Provider", "Prompt (mo)", "Output (mo)", "Total/mo", "Credits")
                for r in summary.rows:
                    dt.add_row(
                        r.display_name,
                        r.provider,
                        f"{r.monthly_prompt_tokens:,.0f}",
                        f"{r.monthly_output_tokens:,.0f}",
                        f"${r.total_cost_usd:.4f}",
                        f"{r.monthly_credits:,}",
                    )
                yield dt
                yield Label(
                    f"Total: ${summary.total_monthly_usd:.4f}/mo · {summary.total_monthly_credits:,} credits",
                    classes="cost-modal-title",
                )

                # Plan impact
                if impact is not None:
                    status_icons = {
                        "within_allowance":              "✓",
                        "over_allowance_within_budget":  "⚠",
                        "over_allowance_exceeds_budget": "✗",
                        "pooled_org":                    "ℹ",
                        "estimate_only":                 "ℹ",
                    }
                    icon = status_icons.get(impact.status, "ℹ")
                    plan_name = impact.plan_id.replace("_", " ").title()
                    included = f"{impact.included_credits:,}" if impact.included_credits else "—"
                    yield Label(
                        f"{icon} Plan: {plan_name} · Included: {included} credits",
                    )
                    if impact.overage_credits > 0:
                        yield Label(
                            f"  Overage: {impact.overage_credits:,} credits (${impact.estimated_extra_usd:.2f})",
                        )
                    for w in impact.warnings:
                        yield Label(f"  {w}", classes="text-muted")

                # Trend
                if trend is not None:
                    delta_pct, label = trend
                    arrow = "↑" if delta_pct >= 0 else "↓"
                    yield Label(f"{arrow} Trend: {label}")

            yield Button("Close  [Esc]", id="cost-modal-close", variant="default")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "cost-modal-close":
            self.dismiss()


class CopilotTUI(App):
    """Terminal dashboard showing Copilot usage analytics."""

    TITLE = "Copilot Usage Analytics"
    SUB_TITLE = "by Sachith Liyanagama"
    CSS = """
    Screen {
        background: $surface;
    }
    #kpi-row {
        height: 5;
        margin: 1 2;
    }
    KpiCard {
        width: 1fr;
        height: 5;
        border: solid $primary;
        padding: 0 1;
        content-align: center middle;
        text-align: center;
    }
    .kpi-value {
        text-style: bold;
        color: $text;
        text-align: center;
        width: 100%;
    }
    .kpi-label {
        color: $text-muted;
        text-align: center;
        width: 100%;
    }
    #tables-row {
        margin: 0 2;
    }
    #model-pane {
        width: 1fr;
        height: 100%;
        border: solid $primary;
        margin: 0 1 0 0;
    }
    #workspace-pane {
        width: 2fr;
        height: 100%;
        border: solid $primary;
    }
    .section-title {
        text-style: bold;
        color: $accent;
        padding: 0 1;
        margin: 0 0 0 0;
    }
    #scan-bar {
        dock: bottom;
        height: 3;
        padding: 0 2;
        background: $surface-darken-1;
        display: none;
    }
    #scan-step {
        height: 1;
        color: $accent;
        padding: 0 0;
    }
    #scan-progress {
        height: 1;
        margin: 0 0;
    }
    #status-bar {
        dock: bottom;
        height: 1;
        padding: 0 2;
        color: $text-muted;
        background: $surface-darken-1;
    }
    """

    BINDINGS = [
        Binding("r", "refresh", "Refresh data"),
        Binding("s", "scan", "Run scan"),
        Binding("c", "show_cost", "Cost estimate"),
        Binding("q", "quit", "Quit"),
    ]

    data_loaded = reactive(False)
    scanning = reactive(False)
    _cost_data: dict | None = None

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="kpi-row"):
            yield KpiCard("Requests",     id="kpi-requests")
            yield KpiCard("Prompt Tokens", id="kpi-prompt")
            yield KpiCard("Output Tokens", id="kpi-output")
            yield KpiCard("Premium",       id="kpi-premium")
            yield KpiCard("Workspaces",    id="kpi-workspaces")
            yield KpiCard("Sessions",      id="kpi-sessions")
            yield KpiCard("Est. Cost/mo",  id="kpi-cost")
        with Horizontal(id="tables-row"):
            with Vertical(id="model-pane"):
                yield Label("Models", classes="section-title")
                yield DataTable(id="model-table")
            with VerticalScroll(id="workspace-pane"):
                yield Label("Workspaces", classes="section-title")
                yield DataTable(id="workspace-table")
        with Vertical(id="scan-bar"):
            yield Label("", id="scan-step")
            yield ProgressBar(id="scan-progress", total=100, show_eta=False)
        yield Label("Loading…", id="status-bar")
        yield Footer()

    def on_mount(self) -> None:
        self._setup_tables()
        self._load_data()

    def _setup_tables(self) -> None:
        mt = self.query_one("#model-table", DataTable)
        mt.add_columns("Model", "Requests", "Tokens", "Premium")
        mt.cursor_type = "row"

        wt = self.query_one("#workspace-table", DataTable)
        wt.add_columns("Workspace", "Requests", "Prompt", "Output", "Premium", "Top Model")
        wt.cursor_type = "row"

    def _load_data(self) -> None:
        """Load data from the database and update the UI."""
        self.run_worker(self._fetch_and_render, thread=True, exit_on_error=False)

    def _fetch_and_render(self) -> None:
        """Run queries in a worker thread, then update widgets."""
        from copilot_usage.pricing import compute_monthly_cost, compute_plan_impact, compute_trend

        try:
            queries = _load_dashboard_queries()
            kpi = queries.kpi_totals()
            models = queries.model_mix()
            workspaces = queries.workspace_table()
            cost_rows = queries.cost_by_model(days=30)
            windows = queries.token_totals_windows()
            plan_id = queries.get_cost_setting("cost.plan", "pro")
            extra_usd = float(queries.get_cost_setting("cost.extra_budget_usd", "0") or 0)
        except Exception as e:
            self.call_from_thread(self._set_status, f"Error loading data: {e}")
            return

        # Build cost data for modal
        summary = compute_monthly_cost(cost_rows, days_observed=30)
        impact  = compute_plan_impact(summary, plan_id, extra_usd)
        last_30 = windows.get("last_30d", 0)
        last_90 = windows.get("last_90d", 0)
        days_90 = windows.get("days_90", 0)
        trend = compute_trend(last_30, last_90) if days_90 >= 30 else None
        self._cost_data = {"summary": summary, "impact": impact, "trend": trend}

        self.call_from_thread(self._render, kpi, models, workspaces, summary)

    def _render(self, kpi: dict, models: list[dict], workspaces: list[dict], summary=None) -> None:
        # KPIs
        self.query_one("#kpi-requests",  KpiCard).update_value(_fmt_tokens(kpi["total_requests"]))
        self.query_one("#kpi-prompt",    KpiCard).update_value(_fmt_tokens(kpi["total_prompt"]))
        self.query_one("#kpi-output",    KpiCard).update_value(_fmt_tokens(kpi["total_output"]))
        self.query_one("#kpi-premium",   KpiCard).update_value(_fmt_prem(kpi["total_premium"]))
        self.query_one("#kpi-workspaces",KpiCard).update_value(str(kpi["workspaces"]))
        self.query_one("#kpi-sessions",  KpiCard).update_value(str(kpi["sessions"]))
        if summary is not None:
            self.query_one("#kpi-cost", KpiCard).update_value(f"${summary.total_monthly_usd:.2f}")

        # Model table
        mt = self.query_one("#model-table", DataTable)
        mt.clear()
        for m in models:
            mt.add_row(
                m["model"],
                _fmt_tokens(m["requests"]),
                _fmt_tokens(m["total_tokens"]),
                _fmt_prem(m["premium"]),
            )

        # Workspace table
        wt = self.query_one("#workspace-table", DataTable)
        wt.clear()
        for w in workspaces:
            ws_display = w["workspace_path"] or w["workspace_id"]
            # Truncate long paths to last 2 segments
            parts = ws_display.replace("\\", "/").split("/")
            if len(parts) > 2:
                ws_display = "…/" + "/".join(parts[-2:])
            wt.add_row(
                ws_display,
                _fmt_tokens(w["requests"]),
                _fmt_tokens(w["prompt_tokens"]),
                _fmt_tokens(w["output_tokens"]),
                _fmt_prem(w["premium"]),
                w.get("top_model", "–"),
            )

        self.data_loaded = True
        self._set_status(
            f"Loaded: {kpi['total_requests']:,} requests · "
            f"{len(models)} models · {len(workspaces)} workspaces  |  "
            f"[R] Refresh  [S] Scan  [Q] Quit"
        )

    def _set_status(self, text: str) -> None:
        self.query_one("#status-bar", Label).update(text)

    def action_refresh(self) -> None:
        try:
            queries = _load_dashboard_queries()
            queries.invalidate_cache()
        except Exception as exc:
            self._set_status(f"Refresh failed: {exc}")
            return
        self._set_status("Refreshing…")
        self._load_data()

    def action_scan(self) -> None:
        if self.scanning:
            return
        self.scanning = True
        # Show progress bar
        scan_bar = self.query_one("#scan-bar")
        scan_bar.styles.display = "block"
        self.query_one("#scan-progress", ProgressBar).update(progress=0)
        self.query_one("#scan-step", Label).update("⏳ Starting scan…")
        self._set_status("Scan in progress…  (steps shown above)")
        self.run_worker(self._do_scan, thread=True, exit_on_error=False)

    def _scan_progress_cb(self, msg: str, pct: float | None) -> None:
        """Called from the scan worker thread to update UI."""
        self.call_from_thread(self._update_scan_ui, msg, pct)

    def _update_scan_ui(self, msg: str, pct: float | None) -> None:
        try:
            step_label = self.query_one("#scan-step", Label)
            step_label.update(f"⏳ {msg}")
            if pct is not None:
                self.query_one("#scan-progress", ProgressBar).update(progress=pct)
        except Exception:
            pass

    def _do_scan(self) -> None:
        from copilot_usage.db import get_connection
        from copilot_usage.logging import setup_logging
        from copilot_usage.pipeline import run_scan

        setup_logging(verbose=False)
        try:
            queries = _load_dashboard_queries()
            queries.close_connections()
            con = get_connection()
            try:
                stats = run_scan(con, on_progress=self._scan_progress_cb)
            finally:
                con.close()
        except Exception as exc:
            def _on_error():
                try:
                    self.query_one("#scan-bar").styles.display = "none"
                except Exception:
                    pass
                self.scanning = False
                self._set_status(f"Scan failed: {exc}")
            self.call_from_thread(_on_error)
            return

        def _finish():
            try:
                self.query_one("#scan-bar").styles.display = "none"
            except Exception:
                pass
            self.scanning = False
            msg = (
                f"✓ Scan done: {stats.get('files_parsed', 0)} files, "
                f"{stats.get('events_ingested', 0)} events in "
                f"{stats.get('elapsed_s', 0):.1f}s"
            )
            self._set_status(msg)
            self._load_data()

        self.call_from_thread(_finish)

    def action_show_cost(self) -> None:
        """Open the cost detail modal (C key)."""
        self.push_screen(CostDetailModal(self._cost_data or {}))
