# VS Code Extension Testing Skills (Generic, Publishable)

This guide is a generic playbook for testing VS Code extensions.
It combines official guidance with practical troubleshooting patterns.

Primary reference:
- Official docs: https://code.visualstudio.com/api/working-with-extensions/testing-extension

## 1) Testing Model

VS Code extension integration tests run inside an Extension Development Host and have access to the VS Code API.
These are different from pure unit tests that run without launching VS Code.

## 2) Recommended Baseline Setup

Install test tooling:
- npm install --save-dev @vscode/test-cli @vscode/test-electron

Add package script:
- test: vscode-test

Create test config file:
- .vscode-test.js or .vscode-test.mjs
- Define at minimum a files pattern such as out/test/**/*.test.js

Compile test sources before running tests:
- Example script: compile-tests

## 3) Reliable Execution Flow

Use this order for fast diagnosis:

1. TypeScript compile for tests
- npm run compile-tests

2. Full extension test run
- npm test

3. If your extension depends on local workspace packages, rebuild those packages before retrying tests.

## 4) What Success Looks Like

A healthy run should include:
- Successful compile
- Successful extension host launch
- Test summary with passing tests and exit code 0

Always trust the final exit code and test summary over noisy logs.

## 5) Common Failure Patterns and Fast Fixes

### A) Type mismatch during compile

Typical symptoms:
- TS2322 or related assignment errors in mapped object literals

Fix approach:
- Add explicit typing on intermediate objects in map and reduce chains
- Avoid relying on broad string inference when a union type is required

### B) Extension host starts but tests fail with module resolution errors

Typical symptoms:
- ERR_MODULE_NOT_FOUND during runtime
- Dist output cannot resolve internal imports

Fix approach:
- Ensure emitted runtime imports are resolvable in your module system
- For Node ESM packages, prefer explicit .js local specifiers in source exports and imports
- Rebuild the dependent package and rerun tests

### C) Non-fatal warnings during vscode-test

Typical symptoms:
- Deprecation warnings
- One-off host warnings that do not fail the run

Fix approach:
- If tests pass and exit code is 0, treat as non-blocking
- Track recurring warnings and clean up separately

## 6) Debugging and Isolation

From the official docs:
- You can debug tests with an extensionHost launch config
- Use --disable-extensions to reduce interference from globally installed extensions
- If trust state matters, run separate trusted and untrusted test configurations

Useful launch args for deterministic runs:
- --disable-extensions
- --user-data-dir <isolated-folder>

## 7) Workspace Trust Coverage

If your extension behavior depends on trust:
- Run separate configurations for trusted and untrusted states
- Assert behavior using vscode.workspace.isTrusted in tests

## 8) CI Guidance

Recommended CI stages:

1. Install dependencies
2. Compile extension and tests
3. Run extension tests with vscode-test
4. Publish artifacts only when tests are green

Optional hardening:
- Add an insiders lane in CI for early compatibility checks
- Keep stable lane as release gate

## 9) Publish-Ready Checklist

Before publishing your extension testing guide or workflow:
- Commands are generic and repository-agnostic
- No private paths, usernames, hostnames, or internal tokens
- Official doc link is included
- Failure patterns include clear symptom and fix
- CI and debugging guidance are present

## 10) Suggested Minimal Script Set

- compile-tests
- test
- lint
- check-types

This keeps test triage straightforward and portable across projects.
