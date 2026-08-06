# Change Log

All notable changes to the "copilot-usage" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- Excel report export for the Global Dashboard. A **⤓ Report** button (and the
  `Copilot Usage: Export Excel Report` command) saves an `.xlsx` workbook with a formatted
  Dashboard slide plus `Models`, `Repos`, `Workspaces`, `DailyData` and `Metadata` sheets.
  The workbook reflects the dashboard's active date range and contains aggregate counts only.
- `copilot-usage.export.shortenWorkspacePaths` setting to control whether exported workspace and
  repository paths are shortened to their last two segments (default `true`).

### Changed

- Daily statistics now also track tool-call rounds, premium units, credits, and distinct sessions
  per day; model statistics now track prompt and output tokens separately.
- Repository attribution now reports weighted AI Credits alongside requests and tokens.

- Initial release