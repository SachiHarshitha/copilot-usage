"""CLI entrypoint: interactive launcher with rich output."""
from __future__ import annotations

import argparse
import sys
import webbrowser

REPO_URL = "https://github.com/SachiHarshitha/copilot-usage"


# ---------------------------------------------------------------------------
# Rich console helpers
# ---------------------------------------------------------------------------

def _console():
    """Shared console instance."""
    from rich.console import Console
    if not hasattr(_console, "_inst"):
        _console._inst = Console()
    return _console._inst


def _banner():
    from rich.align import Align
    from rich.panel import Panel
    from rich.text import Text
    from copilot_usage import __version__

    console = _console()
    inner = Text(justify="center")
    inner.append("\n")
    inner.append("Copilot Usage Analytics", style="bold bright_cyan")
    inner.append(f"  v{__version__}\n", style="dim")
    inner.append("Local-first analytics for GitHub Copilot token usage\n\n", style="dim")
    inner.append("Developed by ", style="dim")
    inner.append("Sachith Liyanagama", style="bold white")
    inner.append("  •  ", style="dim")
    inner.append(REPO_URL, style="dim underline link " + REPO_URL)
    inner.append("\n", style="dim")

    console.print(
        Panel(
            Align.center(inner),
            border_style="bright_blue",
            padding=(0, 2),
            expand=True,
        )
    )


def _run_scan_with_progress():
    """Execute the scan pipeline with a rich live display."""
    from rich.live import Live
    from rich.panel import Panel
    from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
    from rich.table import Table

    from copilot_usage.db import get_connection
    from copilot_usage.pipeline import run_scan

    console = _console()

    progress = Progress(
        SpinnerColumn("dots"),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=40, complete_style="bright_cyan", finished_style="green"),
        TextColumn("[dim]{task.percentage:>3.0f}%"),
        console=console,
    )
    task_id = progress.add_task("Starting scan…", total=100)

    log_lines: list[str] = []

    def _on_progress(msg: str, pct: float | None = None):
        log_lines.append(msg)
        if len(log_lines) > 12:
            log_lines.pop(0)
        if pct is not None:
            progress.update(task_id, completed=pct, description=msg[:60])

    def _make_layout():
        tbl = Table.grid(padding=0)
        tbl.add_row(progress)
        log_text = "\n".join(log_lines[-10:]) if log_lines else "[dim]Waiting…[/dim]"
        tbl.add_row(Panel(log_text, title="[dim]Pipeline Log[/dim]", border_style="dim",
                          height=min(14, len(log_lines) + 3), expand=True))
        return tbl

    con = get_connection()
    with Live(_make_layout(), console=console, refresh_per_second=8) as live:
        def _progress_cb(msg, pct):
            _on_progress(msg, pct)
            live.update(_make_layout())

        stats = run_scan(con, on_progress=_progress_cb)
        progress.update(task_id, completed=100, description="[green]✓ Scan complete")
        live.update(_make_layout())

    con.close()

    # Print summary
    console.print()
    summary = Table(title="Scan Results", show_header=False, border_style="bright_blue",
                    title_style="bold bright_cyan", pad_edge=False)
    summary.add_column("Key", style="dim")
    summary.add_column("Value", style="bold")
    summary.add_row("Files parsed", str(stats.get("files_parsed", 0)))
    summary.add_row("Events ingested", str(stats.get("events_ingested", 0)))
    summary.add_row("Duration", f"{stats.get('elapsed_s', 0):.2f}s")
    console.print(summary)
    console.print()


def _launch_dashboard(port: int, no_browser: bool):
    """Start the Dash server with a rich loading spinner then status message."""
    import signal
    import threading
    import socket
    import time

    console = _console()
    url = f"http://127.0.0.1:{port}/"

    with console.status("[bold cyan]Loading dashboard…", spinner="dots"):
        from copilot_usage.dashboard.app import create_app
        app = create_app()

    # Start server in a background thread
    server_ready = threading.Event()
    shutdown = threading.Event()
    srv = None

    def _serve():
        nonlocal srv
        import werkzeug.serving
        srv = werkzeug.serving.make_server("127.0.0.1", port, app.server)
        server_ready.set()
        srv.serve_forever()

    t = threading.Thread(target=_serve, daemon=True)
    t.start()

    with console.status("[bold cyan]Starting server…", spinner="dots"):
        server_ready.wait(timeout=15)
        for _ in range(30):
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                    break
            except OSError:
                time.sleep(0.2)

    if not no_browser:
        webbrowser.open(url)

    console.print(f"  [bold green]●[/bold green] Dashboard running at [link={url}]{url}[/link]")
    console.print(f"  [dim]Press Ctrl+C to stop[/dim]\n")

    # Use signal handler on main thread so Ctrl+C is caught reliably on Windows
    def _on_sigint(sig, frame):
        shutdown.set()

    prev_handler = signal.signal(signal.SIGINT, _on_sigint)
    try:
        # Poll so the main thread stays responsive to signals
        while not shutdown.is_set():
            shutdown.wait(timeout=0.5)
    finally:
        signal.signal(signal.SIGINT, prev_handler)
        console.print("\n[dim]Shutting down…[/dim]")
        if srv is not None:
            srv.shutdown()


# ---------------------------------------------------------------------------
# Interactive mode (no args → arrow-key menu)
# ---------------------------------------------------------------------------

def _interactive():
    """Launch interactive mode with InquirerPy arrow-key menus (loops until exit)."""
    console = _console()

    _banner()

    try:
        from InquirerPy import inquirer
        from InquirerPy.separator import Separator
    except ImportError:
        console.print("[yellow]InquirerPy not installed — falling back to non-interactive mode.[/yellow]")
        _classic_run(port=8050, no_browser=False, verbose=False, mode="run")
        return

    while True:
        action = inquirer.select(
            message="What would you like to do?",
            choices=[
                {"name": "🚀  Scan & Launch Dashboard", "value": "run"},
                {"name": "🔍  Scan Only  (analyze data, skip dashboard)", "value": "analyze"},
                {"name": "📊  Dashboard Only  (skip scan, serve existing data)", "value": "dashboard"},
                {"name": "🖥️   Terminal Dashboard  (view stats in terminal)", "value": "tui"},
                Separator(),
                {"name": "⚙️   Settings", "value": "settings"},
                {"name": "❌  Exit", "value": "exit"},
            ],
            default="run",
            pointer="❯",
            qmark="",
            amark="✓",
            instruction="(↑/↓ arrow keys, Enter to select)",
        ).execute()

        if action == "exit":
            console.print("[dim]Bye![/dim]")
            return

        if action == "settings":
            _settings_menu(console)
            continue

        if action == "tui":
            _launch_tui()
            continue

        # Run immediately with sensible defaults
        _classic_run(port=8050, no_browser=False, verbose=False, mode=action)

        # After dashboard/run (blocking), loop back is fine.
        # After analyze, we explicitly continue the loop.
        console.print()


def _settings_menu(console):
    """Interactive settings sub-menu."""
    from InquirerPy import inquirer
    from copilot_usage.config import APP_DATA_DIR, DB_PATH, VSCODE_STORAGE_ROOT
    from copilot_usage.logging import LOG_DIR
    from copilot_usage import __version__
    from rich.table import Table

    info = Table(title="Current Configuration", show_header=False,
                 border_style="bright_blue", title_style="bold bright_cyan")
    info.add_column("Key", style="dim")
    info.add_column("Value", style="bold")
    info.add_row("Version", __version__)
    info.add_row("Database", str(DB_PATH))
    info.add_row("App Data", str(APP_DATA_DIR))
    info.add_row("Log Dir", str(LOG_DIR))
    info.add_row("VS Code Storage", str(VSCODE_STORAGE_ROOT))
    console.print(info)
    console.print()

    action = inquirer.select(
        message="Settings action:",
        choices=[
            {"name": "📂  Open app data folder", "value": "open_data"},
            {"name": "📂  Open log folder", "value": "open_logs"},
            {"name": "🔙  Back to main menu", "value": "back"},
        ],
        pointer="❯",
        qmark="",
        amark="✓",
    ).execute()

    if action == "open_data":
        import subprocess, platform
        if platform.system() == "Windows":
            subprocess.Popen(["explorer", str(APP_DATA_DIR)])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(APP_DATA_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(APP_DATA_DIR)])
        console.print(f"[dim]Opened {APP_DATA_DIR}[/dim]")
    elif action == "open_logs":
        import subprocess, platform
        if platform.system() == "Windows":
            subprocess.Popen(["explorer", str(LOG_DIR)])
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", str(LOG_DIR)])
        else:
            subprocess.Popen(["xdg-open", str(LOG_DIR)])
        console.print(f"[dim]Opened {LOG_DIR}[/dim]")
    # "back" just returns to the caller's loop


# ---------------------------------------------------------------------------
# Terminal UI Dashboard (textual)
# ---------------------------------------------------------------------------

def _launch_tui():
    """Launch the Textual-based terminal dashboard."""
    from copilot_usage.tui import CopilotTUI
    app = CopilotTUI()
    app.run()


# ---------------------------------------------------------------------------
# Classic (non-interactive) runner
# ---------------------------------------------------------------------------

def _classic_run(*, port: int, no_browser: bool, verbose: bool, mode: str):
    """Execute the chosen mode with rich output."""
    from copilot_usage.logging import setup_logging
    setup_logging(verbose=verbose)

    console = _console()

    if mode == "tui":
        _launch_tui()
        return

    if mode in ("run", "analyze"):
        _run_scan_with_progress()
        if mode == "analyze":
            return

    if mode in ("run", "dashboard"):
        _launch_dashboard(port=port, no_browser=no_browser)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> None:
    # If no arguments given at all → interactive mode
    if argv is None and len(sys.argv) <= 1:
        _interactive()
        return

    parser = argparse.ArgumentParser(
        prog="copilot-usage",
        description="Local Copilot usage analytics and dashboard",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="run",
        choices=["run", "analyze", "dashboard", "tui"],
        help="run = analyze then dashboard; analyze = scan only; dashboard = web UI; tui = terminal UI",
    )
    parser.add_argument("--port", type=int, default=8050, help="Dashboard port")
    parser.add_argument("--no-browser", action="store_true", help="Don't auto-open browser")
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument("--no-interactive", action="store_true", help="Skip interactive menus")
    args = parser.parse_args(argv)

    _banner()
    _classic_run(port=args.port, no_browser=args.no_browser, verbose=args.verbose, mode=args.mode)


if __name__ == "__main__":
    main()
