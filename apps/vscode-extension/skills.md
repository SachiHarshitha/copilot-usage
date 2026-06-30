# VS Code Extension Testing Skills

This guide captures practical testing lessons from recent implementation work on the extension and its cross-repo dependency.

## Scope

- Project: Copilot Usage VS Code extension
- Folder: apps/vscode-extension
- Dependency coupling: promptstreak/packages/shared-schema
- OS context: Windows PowerShell

## Reliable Test Sequence

Run these in order for the fastest feedback loop:

1. Type-only compile for extension tests
   - npm run compile-tests
2. Full extension validation (includes pretest hooks)
   - npm test
3. If shared schema changed (or runtime import errors appear), rebuild shared schema first
   - npm --prefix C:/101_CodeProjects/promptstreak/packages/shared-schema run build

## What npm test Actually Does

In this extension, npm test runs pretest first:

- compile-tests
- compile (check-types + lint + bundle)
- lint
- vscode-test (launches extension host and runs test suite)

So a green npm test means TypeScript, lint, bundle, and test host all completed.

## High-Value Failure Patterns and Fixes

### 1) TypeScript mismatch in share run actions

Symptom:
- TS2322 in sync.ts
- actions[].type inferred as string instead of ShareActionType

Fix pattern:
- Explicitly type intermediate actions as ShareRunInput['actions'] before returning mapped objects.
- Avoid untyped object literals in complex map chains when strict union types are expected.

### 2) Extension-host runtime failure from shared-schema imports

Symptom:
- ERR_MODULE_NOT_FOUND from shared-schema/dist/index.js
- Missing module path like dist/contentDenylist

Root cause:
- ESM runtime resolution with extensionless local imports in emitted dist files.

Fix pattern:
- Use explicit .js local specifiers in shared-schema source exports/imports.
- Rebuild shared schema so dist emits runtime-resolvable paths.

Example scope that needed updates:
- packages/shared-schema/src/index.ts
- packages/shared-schema/src/agent-snapshot.ts

### 3) Confusing but non-fatal logs during vscode-test

Observed logs:
- Error mutex already exists
- DEP0190 warning about shell args

Interpretation:
- These can appear even when tests pass.
- Trust exit code and summary (for example: 139 passing).

## Cross-Repo Contract Awareness

The extension imports @copilot-usage/shared-schema by file path/workspace link.

Implications:
- Extension runtime tests can fail due to schema package emit issues even if extension code compiles.
- After shared-schema changes, always rebuild schema before extension test runs.

## Fast Debug Checklist

1. Run compile-tests first.
2. If compile passes but npm test fails in extension host startup:
   - Rebuild shared schema.
   - Verify shared-schema/dist contains expected files.
   - Verify dist/index.js imports use .js specifiers.
3. Re-run npm test.
4. Only then investigate extension feature logic failures.

## Environment Notes

- promptstreak integration tests require PostgreSQL on localhost:5432.
- Those failures are infrastructure/environment issues, not extension unit/runtime-test failures.
- Keep extension test validation separate from server integration validation.

## Recommended Habit for Future PRs

For any share payload or schema-touching PR:

1. npm --prefix C:/101_CodeProjects/promptstreak/packages/shared-schema run build
2. npm run compile-tests
3. npm test
4. Record any new recurring failure signature and add it to this file.
