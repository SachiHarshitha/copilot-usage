# Copilot Usage

[![GitHub Repo stars](https://img.shields.io/github/stars/SachiHarshitha/copilot-usage?style=social)](https://github.com/SachiHarshitha/copilot-usage/stargazers)

**Local-first** analytics for your GitHub Copilot Chat token usage in VS Code. All processing happens on your machine — no data is sent externally.

## Features

- **Workspace Analysis** — Token usage, model distribution, and daily trends for the current workspace
- **Global Dashboard** — Aggregated stats across all workspaces: KPIs, daily chart, model breakdown, and workspace comparison
- **Cost Estimator (Preview)** — Estimate monthly Copilot AI Credits usage and compare model costs
- **Capability-aware Provider Comparison** — Compare provider options using model family and tier coverage, capability risk labels, grouped recommendations, and savings-vs-baseline signals with a near-current buffer
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

### Cost Estimator (Overview)

Estimated monthly impact based on your observed usage window, selected plan, and selected model.

![Cost Estimator Overview](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_estimator_overview.png)

### Cost Estimator (Model Comparison)

Compare projected monthly cost and AI Credits across available models.

![Cost Estimator Model Comparison](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_estimator_models.png)

### Cost Estimator (Provider Comparison - Capability-Aware)

Evaluate provider portfolios with fit score, substitution coverage, capability risk, and savings vs baseline.

![Cost Estimator Provider Comparison](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_estimator_provider_1.png)

### Cost Estimator (Provider Comparison - Recommendation View)

See grouped recommendation cards and a decision-oriented table to identify comparable portfolios and cheaper-but-riskier alternatives.

![Cost Estimator Provider Recommendations](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_estimator_provider_2.png)

### Status Bar

Always-visible token count in the status bar. Click to open the workspace analysis panel.

![Status Bar](https://raw.githubusercontent.com/SachiHarshitha/copilot-usage/master/docs/images/vscode_statusbar.png)

## Commands

| Command | Description |
|---------|-------------|
| `Copilot Usage: Workspace Analysis` | Open workspace-scoped token analysis panel |
| `Copilot Usage: Global Dashboard` | Open cross-workspace dashboard |
| `Copilot Usage: Cost Estimator (Preview)` | Open monthly AI Credits cost estimator |
| `Copilot Usage: Refresh Data` | Manually refresh status bar data |

## How It Works

Parses JSONL and legacy JSON chat session files from VS Code's workspace storage directory (`workspaceStorage/{hash}/chatSessions/`). Extracts prompt tokens, output tokens, model identifiers, tool-call rounds, and timestamps — then aggregates everything into interactive dashboards.

## Disclaimer

Copilot Usage is an independent, community-built project. It is not affiliated with, endorsed by, sponsored by, or approved by Microsoft or GitHub.

The Cost Estimator uses this project's own methodology based on local usage data and publicly available pricing references. It is not an official Microsoft or GitHub billing calculator and does not constitute billing, accounting, tax, legal, or financial advice.

GitHub and Microsoft names and trademarks are the property of their respective owners.

## Links

- [GitHub Repository](https://github.com/SachiHarshitha/copilot-usage)
- [Report an Issue](https://github.com/SachiHarshitha/copilot-usage/issues)

**Enjoy!**
