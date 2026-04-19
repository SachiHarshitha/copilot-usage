# Copilot Usage

**Local-first** analytics for your GitHub Copilot Chat token usage in VS Code. All processing happens on your machine — no data is sent externally.

## Features

- **Workspace Analysis** — Token usage, model distribution, and daily trends for the current workspace
- **Global Dashboard** — Aggregated stats across all workspaces: KPIs, daily chart, model breakdown, and workspace comparison
- **Status Bar** — Live token count for the current workspace; click to open analysis
- **Tool Call Rounds** — Track how many agentic tool-call rounds Copilot uses per session
- **Auto-refresh Timer** — Set a 30s / 1m / 2m / 5m interval to keep dashboards up to date

## Screenshots

### Global Dashboard

KPIs, daily token usage chart, model distribution, and per-workspace breakdown across all your projects.

![Global Dashboard](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_global.png)

### Workspace View

Focused analysis for the current workspace — token usage, daily trends, and model stats.

![Workspace View](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_workspace.png)

### Status Bar

Always-visible token count in the status bar. Click to open the workspace analysis panel.

![Status Bar](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_statusbar.png)

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Usage: Workspace Analysis` | Open workspace-scoped token analysis panel |
| `Copilot Usage: Global Dashboard` | Open cross-workspace dashboard |
| `Copilot Usage: Refresh Data` | Manually refresh status bar data |

## How It Works

Parses JSONL and legacy JSON chat session files from VS Code's workspace storage directory (`workspaceStorage/{hash}/chatSessions/`). Extracts prompt tokens, output tokens, model identifiers, tool-call rounds, and timestamps — then aggregates everything into interactive dashboards.

## Links

- [GitHub Repository](https://github.com/SachiHarshitha/copilot-usage)
- [Report an Issue](https://github.com/SachiHarshitha/copilot-usage/issues)

**Enjoy!**
