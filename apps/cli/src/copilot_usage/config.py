"""Paths, constants, and model multiplier table."""
from __future__ import annotations

import os
import pathlib
import platform

# ---------------------------------------------------------------------------
# VS Code workspace storage root
# ---------------------------------------------------------------------------

def _default_vscode_storage_roots() -> list[pathlib.Path]:
    sys_name = platform.system()
    if sys_name == "Windows":
        base = pathlib.Path(os.environ.get("APPDATA", "") or str(pathlib.Path.home() / "AppData" / "Roaming"))
    elif sys_name == "Darwin":
        base = pathlib.Path.home() / "Library" / "Application Support"
    else:  # Linux / other
        base = pathlib.Path(os.environ.get("XDG_CONFIG_HOME", "") or str(pathlib.Path.home() / ".config"))
    candidates = [
        base / "Code" / "User" / "workspaceStorage",
        base / "Code - Insiders" / "User" / "workspaceStorage",
    ]
    found = [p for p in candidates if p.exists()]
    return found if found else [candidates[0]]


VSCODE_STORAGE_ROOTS: list[pathlib.Path] = _default_vscode_storage_roots()
# Backward-compat alias: first discovered root (stable Code path when neither exists yet)
VSCODE_STORAGE_ROOT: pathlib.Path = VSCODE_STORAGE_ROOTS[0]

# ---------------------------------------------------------------------------
# App data directory (writable; holds DuckDB, layout JSON, badge exports)
# ---------------------------------------------------------------------------

def _default_app_data() -> pathlib.Path:
    sys = platform.system()
    if sys == "Windows":
        base = pathlib.Path(os.environ.get("LOCALAPPDATA", "") or str(pathlib.Path.home() / "AppData" / "Local"))
    elif sys == "Darwin":
        base = pathlib.Path.home() / "Library" / "Application Support"
    else:
        base = pathlib.Path(os.environ.get("XDG_DATA_HOME", "") or str(pathlib.Path.home() / ".local" / "share"))
    return base / "copilot-usage"


APP_DATA_DIR = _default_app_data()
DB_PATH = APP_DATA_DIR / "copilot_usage.duckdb"
BADGE_DIR = APP_DATA_DIR / "badges"
LAYOUT_PATH = APP_DATA_DIR / "layout.json"

# ---------------------------------------------------------------------------
# Model multiplier table (May 2026 snapshot)
# Source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests#model-multipliers
#
# Keys are the model identifier prefix as it appears in the JSONL files
# (e.g. "copilot/claude-opus-4.6").  Value is the multiplier on paid plans.
# Models included at no extra cost on paid plans have multiplier 0.
# ---------------------------------------------------------------------------

MODEL_MULTIPLIERS: dict[str, float] = {
    # ── Included models (0× on paid plans) ──────────────────────────────
    "copilot/gpt-4.1":             0.0,
    "copilot/gpt-4.1-mini":        0.0,   # legacy alias
    "copilot/gpt-4o":              0.0,
    "copilot/gpt-4o-mini":         0.0,   # legacy
    "copilot/gpt-5-mini":          0.0,   # GPT-5 mini (included)
    "copilot/raptor-mini":         0.0,   # Raptor mini (included)
    # ── 0.25× ───────────────────────────────────────────────────────────
    "copilot/gpt-5.4-nano":        0.25,
    "copilot/grok-code-fast-1":    0.25,
    # ── 0.33× ───────────────────────────────────────────────────────────
    "copilot/claude-haiku-4.5":    0.33,
    "copilot/gemini-3-flash":      0.33,
    "copilot/gpt-5.4-mini":        0.33,
    # ── 1× ──────────────────────────────────────────────────────────────
    "copilot/claude-sonnet-4":     1.0,
    "copilot/claude-sonnet-4.5":   1.0,
    "copilot/claude-sonnet-4.6":   1.0,
    "copilot/claude-sonnet-4-thinking": 1.0,
    "copilot/gemini-2.5-pro":      1.0,
    "copilot/gemini-3.1-pro":      1.0,
    "copilot/gpt-5.2":             1.0,
    "copilot/gpt-5.2-codex":       1.0,
    "copilot/gpt-5.3-codex":       1.0,
    "copilot/gpt-5.4":             1.0,
    "copilot/o4-mini":             1.0,
    # ── 3× ──────────────────────────────────────────────────────────────
    "copilot/claude-opus-4.5":     3.0,
    "copilot/claude-opus-4.6":     3.0,
    "copilot/o3":                  3.0,
    # ── 7.5× ────────────────────────────────────────────────────────────
    "copilot/gpt-5.5":             7.5,
    # ── 15× ─────────────────────────────────────────────────────────────
    "copilot/claude-opus-4.7":     15.0,
    # ── 30× ─────────────────────────────────────────────────────────────
    "copilot/claude-opus-4.6-fast": 30.0,  # Opus 4.6 fast mode (preview)
    # ── auto-mode ───────────────────────────────────────────────────────
    "copilot/auto":                0.0,   # auto-mode; discount applied separately
    # ── Legacy / fallback ───────────────────────────────────────────────
    "copilot/gpt-4":               0.0,
    "copilot/gpt-3.5-turbo":       0.0,
    "copilot/gemini-2.5-flash":    0.0,   # legacy; succeeded by Gemini 3 Flash
}

# For auto-model-selection, paid plans get a 10 % discount on the multiplier.
AUTO_MODE_DISCOUNT = 0.10

def get_multiplier(model_id: str, *, auto_mode: bool = False) -> float:
    """Return the effective premium-request multiplier for *model_id*."""
    m = MODEL_MULTIPLIERS.get(model_id)
    if m is None:
        # Unknown model – conservative default of 1.0
        m = 1.0
    if auto_mode and m > 0:
        m *= (1.0 - AUTO_MODE_DISCOUNT)
    return m
