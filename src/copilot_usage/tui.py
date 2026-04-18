"""Textual-based terminal UI dashboard for Copilot usage stats."""
from __future__ import annotations

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.reactive import reactive
from textual.widgets import DataTable, Footer, Header, Label, ProgressBar, Static


def _fmt_tokens(n: int | float) -> str:
    """Format token count with comma separators."""
    return f"{int(n):,}"


def _fmt_prem(n: float) -> str:
    """Format premium as 1.2x etc."""
    return f"{n:.1f}×" if n else "0×"


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
        Binding("q", "quit", "Quit"),
    ]

    data_loaded = reactive(False)
    scanning = reactive(False)

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="kpi-row"):
            yield KpiCard("Requests", id="kpi-requests")
            yield KpiCard("Prompt Tokens", id="kpi-prompt")
            yield KpiCard("Output Tokens", id="kpi-output")
            yield KpiCard("Premium", id="kpi-premium")
            yield KpiCard("Workspaces", id="kpi-workspaces")
            yield KpiCard("Sessions", id="kpi-sessions")
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
        self.run_worker(self._fetch_and_render, thread=True)

    def _fetch_and_render(self) -> None:
        """Run queries in a worker thread, then update widgets."""
        from copilot_usage.dashboard.queries import (
            kpi_totals,
            model_mix,
            workspace_table,
        )

        try:
            kpi = kpi_totals()
            models = model_mix()
            workspaces = workspace_table()
        except Exception as e:
            self.call_from_thread(self._set_status, f"Error loading data: {e}")
            return

        self.call_from_thread(self._render, kpi, models, workspaces)

    def _render(self, kpi: dict, models: list[dict], workspaces: list[dict]) -> None:
        # KPIs
        self.query_one("#kpi-requests", KpiCard).update_value(_fmt_tokens(kpi["total_requests"]))
        self.query_one("#kpi-prompt", KpiCard).update_value(_fmt_tokens(kpi["total_prompt"]))
        self.query_one("#kpi-output", KpiCard).update_value(_fmt_tokens(kpi["total_output"]))
        self.query_one("#kpi-premium", KpiCard).update_value(_fmt_prem(kpi["total_premium"]))
        self.query_one("#kpi-workspaces", KpiCard).update_value(str(kpi["workspaces"]))
        self.query_one("#kpi-sessions", KpiCard).update_value(str(kpi["sessions"]))

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
        from copilot_usage.dashboard.queries import invalidate_cache

        invalidate_cache()
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
        self.run_worker(self._do_scan, thread=True)

    def _scan_progress_cb(self, msg: str, pct: float | None) -> None:
        """Called from the scan worker thread to update UI."""
        self.call_from_thread(self._update_scan_ui, msg, pct)

    def _update_scan_ui(self, msg: str, pct: float | None) -> None:
        step_label = self.query_one("#scan-step", Label)
        step_label.update(f"⏳ {msg}")
        if pct is not None:
            self.query_one("#scan-progress", ProgressBar).update(progress=pct)

    def _do_scan(self) -> None:
        from copilot_usage.db import get_connection
        from copilot_usage.logging import setup_logging
        from copilot_usage.pipeline import run_scan
        from copilot_usage.dashboard.queries import close_connections

        setup_logging(verbose=False)
        close_connections()
        try:
            con = get_connection()
            try:
                stats = run_scan(con, on_progress=self._scan_progress_cb)
            finally:
                con.close()
        except Exception as exc:
            def _on_error():
                self.query_one("#scan-bar").styles.display = "none"
                self.scanning = False
                self._set_status(f"Scan failed: {exc}")
            self.call_from_thread(_on_error)
            return

        def _finish():
            self.query_one("#scan-bar").styles.display = "none"
            self.scanning = False
            msg = (
                f"✓ Scan done: {stats.get('files_parsed', 0)} files, "
                f"{stats.get('events_ingested', 0)} events in "
                f"{stats.get('elapsed_s', 0):.1f}s"
            )
            self._set_status(msg)
            self._load_data()

        self.call_from_thread(_finish)
