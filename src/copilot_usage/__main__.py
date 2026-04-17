"""CLI entrypoint: analyze → dashboard."""
from __future__ import annotations

import argparse
import logging
import sys
import webbrowser


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        prog="copilot-usage",
        description="Local Copilot usage analytics and dashboard",
    )
    parser.add_argument(
        "mode",
        nargs="?",
        default="run",
        choices=["run", "analyze", "dashboard"],
        help="run = analyze then dashboard (default); analyze = scan only; dashboard = serve only",
    )
    parser.add_argument("--port", type=int, default=8050, help="Dashboard port")
    parser.add_argument("--no-browser", action="store_true", help="Don't auto-open browser")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-5s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    from copilot_usage.db import get_connection

    if args.mode in ("run", "analyze"):
        from copilot_usage.pipeline import run_scan

        con = get_connection()
        stats = run_scan(con)
        con.close()
        print(f"\nScan complete: {stats['files_parsed']} files parsed, "
              f"{stats['events_ingested']} events ingested in {stats['elapsed_s']}s\n")

        if args.mode == "analyze":
            return

    if args.mode in ("run", "dashboard"):
        from copilot_usage.dashboard.app import create_app

        app = create_app()
        url = f"http://127.0.0.1:{args.port}/"
        if not args.no_browser:
            webbrowser.open(url)
        print(f"Dashboard at {url}  (Ctrl+C to stop)")
        app.run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()
