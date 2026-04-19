"""Centralized loguru configuration with file rotation."""
from __future__ import annotations

import sys

from loguru import logger

from copilot_usage.config import APP_DATA_DIR

LOG_DIR = APP_DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

_configured = False


def setup_logging(*, verbose: bool = False) -> None:
    """Configure loguru sinks (call once at app startup).

    - **stderr** sink for console output
    - **file** sink with daily rotation (7-day retention)
    """
    global _configured
    if _configured:
        return
    _configured = True

    # Remove the default stderr sink so we can reconfigure it
    logger.remove()

    level = "DEBUG" if verbose else "INFO"

    # Console sink
    logger.add(
        sys.stderr,
        level=level,
        format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>: {message}",
        colorize=True,
    )

    # Rotating file sink
    logger.add(
        str(LOG_DIR / "copilot_usage_{time:YYYY-MM-DD}.log"),
        level="DEBUG",
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
        rotation="00:00",  # new file every midnight
        retention="7 days",
        encoding="utf-8",
        enqueue=True,  # thread-safe
    )


def get_log_files() -> list[dict]:
    """Return metadata for all log files (newest first)."""
    files = []
    for p in sorted(LOG_DIR.glob("copilot_usage_*.log"), reverse=True):
        stat = p.stat()
        files.append({
            "name": p.name,
            "path": str(p),
            "size_kb": round(stat.st_size / 1024, 1),
            "modified": stat.st_mtime,
        })
    return files


def read_log_file(name: str, tail_lines: int = 500) -> str:
    """Read the last *tail_lines* of a named log file. Returns safe text."""
    import re

    # Sanitise the name to prevent path traversal
    safe = re.sub(r"[^a-zA-Z0-9_.\-]", "", name)
    target = LOG_DIR / safe
    if not target.is_file() or not str(target).startswith(str(LOG_DIR)):
        return f"Log file not found: {safe}"
    try:
        lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-tail_lines:])
    except OSError as exc:
        return f"Error reading log: {exc}"
