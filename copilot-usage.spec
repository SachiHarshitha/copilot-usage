# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for building copilot-usage as a single executable."""

import os
import importlib
import sys

block_cipher = None

# ---------------------------------------------------------------------------
# Locate package paths
# ---------------------------------------------------------------------------
SRC = os.path.join(os.path.dirname(os.path.abspath(SPEC)), "src")

# Dash needs its own assets (renderer, etc.)
dash_pkg = os.path.dirname(importlib.import_module("dash").__file__)
dbc_pkg = os.path.dirname(importlib.import_module("dash_bootstrap_components").__file__)
dbt_pkg = os.path.dirname(importlib.import_module("dash_bootstrap_templates").__file__)
plotly_pkg = os.path.dirname(importlib.import_module("plotly").__file__)

# Our dashboard assets + pages
dashboard_root = os.path.join(SRC, "copilot_usage", "dashboard")

a = Analysis(
    [os.path.join(SRC, "copilot_usage", "__main__.py")],
    pathex=[SRC],
    binaries=[],
    datas=[
        # Our dashboard assets & pages
        (os.path.join(dashboard_root, "assets"), os.path.join("copilot_usage", "dashboard", "assets")),
        (os.path.join(dashboard_root, "pages"), os.path.join("copilot_usage", "dashboard", "pages")),
        # Dash internal renderer/deps
        (os.path.join(dash_pkg, "dash-renderer"), os.path.join("dash", "dash-renderer")),
        (os.path.join(dash_pkg, "dcc"), os.path.join("dash", "dcc")),
        (os.path.join(dash_pkg, "html"), os.path.join("dash", "html")),
        (os.path.join(dash_pkg, "dash_table"), os.path.join("dash", "dash_table")),
        # dash-bootstrap-components
        (dbc_pkg, "dash_bootstrap_components"),
        # dash-bootstrap-templates
        (dbt_pkg, "dash_bootstrap_templates"),
        # plotly templates/data
        (os.path.join(plotly_pkg, "package_data"), os.path.join("plotly", "package_data")),
    ],
    hiddenimports=[
        "copilot_usage",
        "copilot_usage.__main__",
        "copilot_usage.config",
        "copilot_usage.db",
        "copilot_usage.logging",
        "copilot_usage.parser",
        "copilot_usage.discovery",
        "copilot_usage.ingest",
        "copilot_usage.aggregator",
        "copilot_usage.badges",
        "copilot_usage.pipeline",
        "copilot_usage.tui",
        "copilot_usage.dashboard",
        "copilot_usage.dashboard.app",
        "copilot_usage.dashboard.queries",
        "copilot_usage.dashboard.pages.overview",
        "copilot_usage.dashboard.pages.explorer",
        "copilot_usage.dashboard.pages.pipeline",
        "copilot_usage.dashboard.pages.badges",
        "copilot_usage.dashboard.pages.settings",
        # Dash internals
        "dash",
        "dash.dash",
        "dash.dcc",
        "dash.html",
        "dash.dash_table",
        "dash_bootstrap_components",
        "dash_bootstrap_templates",
        "flask",
        "plotly",
        "plotly.express",
        "plotly.graph_objects",
        "pandas",
        "duckdb",
        "tiktoken",
        "tiktoken_ext",
        "tiktoken_ext.openai_public",
        "loguru",
        "rich",
        "InquirerPy",
        "prompt_toolkit",
        "pfzy",
        "textual",
        "textual.app",
        "textual.widgets",
        "textual.binding",
        "textual.containers",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "scipy",
        "numpy.testing",
        "rapidfuzz",
        "IPython",
        "jupyter",
        "pysqlite2",
        "MySQLdb",
        "psycopg2",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="copilot-usage",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,          # needs console for interactive prompts
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
