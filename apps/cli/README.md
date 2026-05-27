# Copilot Usage Analytics

`copilot-usage` is a local-first analytics tool for GitHub Copilot session data. It scans VS Code chat session files, stores structured results in DuckDB, and exposes both a CLI workflow and a local dashboard for exploring token usage, premium estimates, and workspace-level activity.

## Highlights

- Incremental scanning of Copilot chat session files
- Local DuckDB storage with no external data upload
- Workspace and model-level usage breakdowns
- Premium request estimation based on model multipliers
- Browser dashboard plus terminal-friendly workflows

## Install

```bash
pip install copilot-usage
```

## Run

```bash
copilot-usage
copilot-usage analyze
copilot-usage dashboard
copilot-usage tui
```

## Project

Source, documentation, and release notes live in the main repository:

- https://github.com/SachiHarshitha/copilot-usage
