# Copilot Usage

Local-first analytics for your GitHub Copilot Chat token usage in VS Code.

## Features

- **Workspace Analysis** — View token usage, model distribution, and daily trends for the current workspace
- **Global Dashboard** — See aggregated stats across all workspaces with session data
- **Status Bar** — Live token count for the current workspace, click to open analysis
- **Auto-refresh** — File watcher detects new chat session data automatically

## Commands

- `Copilot Usage: Workspace Analysis` — Open workspace-scoped token analysis panel
- `Copilot Usage: Global Dashboard` — Open cross-workspace dashboard
- `Copilot Usage: Refresh Data` — Manually refresh status bar data

## How It Works

Parses JSONL and legacy JSON chat session files from VS Code's workspace storage directory. All processing is local — no data is sent externally.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
