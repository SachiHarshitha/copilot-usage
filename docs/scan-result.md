# GitHub Copilot Chat Token Persistence Reference

Last updated: 2026-04-17

## Purpose

This document captures the on-disk persistence formats observed for GitHub Copilot Chat under:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage`

The goal is to support a local tool that builds a chronological token-usage timeline from persisted VS Code data.

This is a read-only forensic summary based on actual files observed on disk. It distinguishes between:

- confirmed primary sources for token accounting
- useful secondary metadata sources
- folders that look related but are not reliable token ledgers

## Executive Summary

The best source for a local token timeline is:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\chatSessions\*.jsonl`

Why:

- It is chronological and append-only.
- It preserves per-event request updates.
- Some JSONL session files contain exact `promptTokens` and `outputTokens`.
- The same files also carry request timestamps, request IDs, model IDs, and session anchors.

Secondary sources are useful, but not as the primary token ledger:

- `workspace.json`: maps workspace hash to real workspace path.
- `chatSessions\*.json`: older full-session snapshots with good metadata and `toolCallRounds`, but sampled files did not carry exact `promptTokens` and `outputTokens`.
- `state.vscdb`: index/helper source for session title and last message timestamps.

Important negative findings from this scan:

- `inputTokens` was not found in the inspected Copilot storage.
- `totalTokens` was not found in the inspected Copilot storage.
- `createdAt` was not found in core Copilot `chatSessions` files; matches appeared only in unrelated or secondary content.

## Additional Findings from Source and Docs

The local storage findings above were cross-checked against:

- the public Copilot Chat source repository: `https://github.com/microsoft/vscode-copilot-chat`
- GitHub Copilot billing documentation for requests and premium requests

These additional checks materially refine two points:

- premium request consumption is request-based, not token-based
- project or workspace attribution is possible, but only as an estimation layer unless you also read session metadata beyond the raw chat transcript

## Premium Requests: Confirmed Model

### Official Billing Rule

GitHub's public documentation defines premium request usage this way:

- in Copilot Chat, one user prompt counts as one request
- premium request usage is that request multiplied by the selected model's multiplier
- for agentic features, autonomous tool calls do not count as additional premium requests
- on paid plans, included models can have a multiplier of `0`, so they do not consume premium requests
- in VS Code auto model selection, paid plans can receive a 10% multiplier discount

This means premium request accounting is fundamentally based on user prompt count and model multiplier, not on prompt token count or completion token count.

### Source-Code Hints That Match the Docs

The extension source contains a strong implementation signal that billing is request-multiplier based:

- `src/platform/endpoint/common/endpointProvider.ts` defines model metadata with `billing?: { is_premium: boolean; multiplier: number; restricted_to?: string[] }`
- `src/platform/endpoint/node/chatEndpoint.ts` exposes `isPremium` and `multiplier` from model metadata
- `src/platform/endpoint/node/autoChatEndpoint.ts` applies a discounted multiplier for auto mode
- `src/platform/chat/common/chatQuotaServiceImpl.ts` reads quota snapshots from headers such as `x-quota-snapshot-premium_models` and `x-quota-snapshot-premium_interactions`
- `src/extension/conversation/vscode-node/chatParticipants.ts` switches users back to a base model when premium quota is exhausted, based on `endpoint.multiplier`, not on token counts

Taken together, this strongly supports the conclusion that token usage is displayed and persisted for analysis, but quota and premium billing are tracked as request counts weighted by model multiplier.

### Practical Formula

For Copilot Chat in VS Code, the best working estimator is:

`estimatedPremiumRequests = sum(effectiveMultiplier(r) for each billable user prompt r)`

Where:

- each billable user prompt contributes one base request
- `effectiveMultiplier(r)` is the model multiplier for the model used for that prompt
- if the model is included on a paid plan, the multiplier is effectively `0`
- if auto model selection discount applies, use the discounted multiplier
- tool calls inside the request do not add more premium requests

Equivalent expanded form:

`estimatedPremiumRequests = sum(1 * m_r for each request r)`

Where $m_r$ is the effective model multiplier for request $r$.

### What Token Counts Can and Cannot Tell You

Token counts are still useful, but for a different purpose:

- good for estimating relative cost or resource intensity by project
- good for showing prompt/completion trends over time
- not sufficient to derive official premium-request consumption by themselves

Example:

- one short prompt to Claude Opus 4.6 can cost more premium requests than one long prompt to GPT-4.1 on a paid plan
- the difference comes from model multiplier, not from token volume

### Recommended Premium Request Estimation Pipeline

For a local estimator, use this order of precedence:

1. count one billable request per user prompt in `chatSessions`
2. resolve the model ID used for that prompt
3. map the model ID to a multiplier
4. apply any known special rules:
	 - included model on paid plan -> `0`
	 - auto mode discount in VS Code -> reduce multiplier by 10%
	 - cloud agent session pricing is separate and should not be mixed into IDE chat unless explicitly detected
5. sum the effective multipliers

### Important Caveats

- the extension source exposes multipliers and quota snapshots, but final billing logic still lives on GitHub services
- public documentation explicitly says multipliers and included models can change
- if the user is on Copilot Free, model access and request charging rules differ from paid plans
- some system-initiated requests may be marked as skippable for billing in source APIs, but that is not currently proven to be recoverable from the local `chatSessions` files we inspected

## Workspace and Project Attribution

### What the Source Suggests

The Copilot Chat source contains several signals that session-to-folder association exists internally:

- `src/extension/chatSessions/vscode-node/chatSessionWorkspaceFolderServiceImpl.ts` tracks a workspace folder per session and persists it through a metadata store
- `src/extension/chatSessions/vscode-node/chatSessionMetadataStoreImpl.ts` can retrieve:
	- session workspace folder
	- session workspace folder entry
	- session IDs for a workspace folder
	- worktree properties
- `src/extension/chatSessions/common/workspaceInfo.ts` models session workspace information including folder, repository, and worktree
- `src/extension/chatSessions/vscode-node/folderRepositoryManagerImpl.ts` resolves folder/repository/worktree context for sessions
- `src/extension/chatSessions/vscode-node/claudeChatSessionContentProvider.ts` resolves per-session `cwd` and additional directories

This is important because it means the extension itself does keep a concept of session-to-folder association beyond the raw request transcript.

### What This Means for the Local Estimator

You should treat workspace attribution in two layers:

#### Layer 1: High-confidence workspace ownership

Use the storage hash mapping from `workspace.json`:

- storage folder `workspace_id`
- decoded real workspace path from `workspace.json`

This gives a reliable attribution from a chat session file to the VS Code workspace that owned the storage directory.

This is already enough for many cases where one VS Code window corresponds to one product or repository.

#### Layer 2: Session folder or repository attribution inside a workspace

When a workspace contains multiple folders or repositories, refine attribution by reading session metadata that tracks selected workspace folder or worktree.

The source strongly suggests this metadata exists and is persisted through `ChatSessionMetadataStore` and `ChatSessionWorkspaceFolderService`.

That means the next place to inspect locally is not the `chatSessions` transcript itself, but the extension's per-session metadata files or global-state storage used by the metadata store.

### Recommended Allocation Strategy

Use a two-step allocation approach:

#### A. Workspace-level allocation

Allocate every chat session to the workspace folder identified by:

- `workspaceStorage/<workspace_id>/workspace.json`

This is the minimum reliable grouping and should be considered authoritative.

#### B. Project-folder allocation within a workspace

Where available, use session metadata to map each `chat_session_id` to:

- selected workspace folder
- repository root
- worktree path

Then allocate the session's token and premium-request estimates to that specific project folder.

If this metadata is unavailable, fall back to the workspace root.

### Recommended Allocation Formula

For product or project cost reporting, maintain two parallel measures:

#### 1. Premium-request estimate

`projectPremiumEstimate = sum(effectiveMultiplier(r) for each project request r)`

#### 2. Token-based internal cost proxy

`projectTokenVolume = sum(promptTokens_r + outputTokens_r for each project request r)`

Then, if you want a proportional internal cost split across products for a given period:

`projectShare = projectTokenVolume / sum(tokenVolumeAcrossProjects)`

This second formula is not GitHub billing. It is a management/accounting proxy for internal allocation.

### Best-Effort Attribution Rules

If the same session touches multiple folders, use this priority:

1. explicit session workspace folder or repository metadata
2. session worktree mapping
3. owning workspace from `workspace.json`
4. if a session truly spans multiple projects, split proportionally by referenced files only if you later parse references from tool results; otherwise keep the session assigned to its primary folder

### Current Confidence

High confidence:

- workspace-level attribution by `workspaceStorage/<workspace_id>/workspace.json`
- premium request estimation should be request-count × model multiplier, not token-count based

Medium confidence:

- per-session folder or repository attribution is likely recoverable locally from metadata-store-backed session metadata

Not yet verified on disk in this workspace scan:

- the exact file path and on-disk schema of the session metadata store that records workspace folder or repository selection for every session type

## Recommended Next Inspection

If you want to tighten project attribution further, the next local inspection target should be the metadata files used by the chat session metadata store, not the transcript logs.

Search locally for metadata associated with:

- `workspaceFolder`
- `folderPath`
- `repositoryProperties`
- `worktreeProperties`
- `ChatSessionMetadataStore`

That inspection should determine whether the extension persists a direct `chat_session_id -> folderPath/repositoryPath` mapping that can be joined with the token timeline.

## Local Metadata Store Inspection Result

An additional local inspection was performed specifically for the chat session metadata store described in the Copilot Chat source.

### Source-Derived Expected Locations

From `src/extension/chatSessions/vscode-node/chatSessionMetadataStoreImpl.ts` and `src/extension/chatSessions/copilotcli/node/cliHelpers.ts`, the expected storage locations are:

- bulk cache under the extension global storage:
	- `...\GitHub.copilot-chat\copilotcli\copilotcli.session.metadata.json`
- per-session metadata under Copilot CLI session state:
	- `~/.copilot/session-state/<sessionId>/vscode.metadata.json`
- per-session request details:
	- `~/.copilot/session-state/<sessionId>/vscode.requests.metadata.json`

Expected schema fields include:

- `workspaceFolder.folderPath`
- `repositoryProperties.repositoryPath`
- `worktreeProperties.repositoryPath`
- `worktreeProperties.worktreePath`

### Actual Local Findings on This Machine

The expected metadata store is not currently populated for the IDE chat sessions inspected in this environment.

Confirmed local results:

- `C:\Users\sachi\.copilot\session-state` does not exist
- `C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\d4a9162b8717383539a39e3fb822bb9e\GitHub.copilot-chat\copilotcli\copilotcli.session.metadata.json` does not exist
- no `vscode.metadata.json` files were found under `workspaceStorage`
- no `copilotcli.session.metadata.json` files were found under `workspaceStorage`
- no `workspaceFolder`, `folderPath`, `repositoryPath`, or `worktreeProperties` keys were found in the current workspace storage folder or under `C:\Users\sachi\.copilot`
- no legacy memento keys for:
	- `github.copilot.cli.sessionWorkspaceFolders`
	- `github.copilot.cli.sessionWorktrees`
	were found in the inspected `state.vscdb` files

### What Was Found Instead

Two local persistence mechanisms still reveal workspace-level context:

1. `workspaceStorage/<workspace_id>/workspace.json`
	 - maps the hashed VS Code workspace storage folder to the real workspace path

2. `C:\Users\sachi\.copilot\ide\*.lock`
	 - active IDE lock files contain a `workspaceFolders` array
	 - the active lock file for this workspace contained:
		 - `"workspaceFolders": ["c:\\101_CodeProjects\\copilot-token-estimator"]`

Important limitation:

The `.copilot\ide\*.lock` files identify the active IDE workspace set, but they do not provide a stable per-chat-session mapping from `chat_session_id` to `folderPath` or `repositoryPath`.

### Conclusion

For the regular VS Code Copilot Chat sessions inspected here, no concrete on-disk `sessionId -> folderPath/repositoryPath` mapping was found.

The practical consequence is:

- workspace-level attribution is confirmed and reliable
- per-session project-folder attribution is not currently recoverable from local on-disk metadata in this environment
- the source code indicates that such mappings exist for Copilot CLI-style session flows, but those storage paths are not populated on this machine right now

### Best Available Join Strategy Right Now

Use this priority order for attribution in the current environment:

1. `workspaceStorage/<workspace_id>/workspace.json` for authoritative workspace ownership
2. optional `.copilot\ide\*.lock` `workspaceFolders` as a live-environment corroboration signal
3. if later discovered, join `chat_session_id` to `vscode.metadata.json` or `copilotcli.session.metadata.json`
4. otherwise treat workspace root as the finest reliable attribution boundary

## Workspace Mapping

Each VS Code workspace is stored under a hashed directory:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>`

The real workspace path is mapped by:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\workspace.json`

Confirmed example from the current workspace:

- workspace storage hash: `d4a9162b8717383539a39e3fb822bb9e`
- file: `C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\d4a9162b8717383539a39e3fb822bb9e\workspace.json`
- observed content: `{"folder":"file:///c%3A/101_CodeProjects/copilot-token-estimator"}`

This mapping is required if you want timeline rows grouped by actual workspace path rather than by storage hash.

## Storage Locations and Reliability

### 1. Primary Source: `chatSessions\*.jsonl`

Path pattern:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\chatSessions\<session_id>.jsonl`

Format:

- JSONL
- one JSON object per line
- append-only event/patch stream
- records commonly include `kind` and sometimes `k`

Why it matters:

- This is the only observed file family that definitively contained exact `promptTokens` and `outputTokens`.
- It also contains the most timeline-friendly chronology.

Confirmed fields seen in this format:

- `sessionId`
- `creationDate`
- `requestId`
- `timestamp`
- `modelId`
- `promptTokens`
- `outputTokens`
- `kind`
- `k`
- selected model metadata such as `maxInputTokens` and `maxOutputTokens`

Important nuance:

The top-level chat session ID and the nested session ID on token-bearing lines may differ.

Treat them separately:

- `chat_session_id`: file stem or `kind=0` session anchor
- `provider_session_id`: nested `sessionId` on request/result lines

#### Confirmed Token-Bearing Example

Sample file:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\96326818b20e995433feff77103d178d\chatSessions\54f6b91a-374c-415d-a026-aa4c2c5c1768.jsonl`

Observed session anchor from the first line:

- `kind=0`
- `sessionId=54f6b91a-374c-415d-a026-aa4c2c5c1768`
- `creationDate=1775223215713`
- `inputState.selectedModel.identifier=copilot/claude-opus-4.6`
- `inputState.selectedModel.metadata.name=Claude Opus 4.6`
- `inputState.selectedModel.metadata.maxInputTokens=127805`
- `inputState.selectedModel.metadata.maxOutputTokens=64000`

Observed token-bearing events from later lines:

- `LINE=15 kind=2 k=["requests"] requestId=request_c665a1cf-0415-4ffc-8813-2b9ac5d2251f sessionId=28453db6-823b-4908-84fc-2115909bb1d8 timestamp=1775223912908 modelId=copilot/claude-opus-4.6 promptTokens=23109 outputTokens=2`
- `LINE=38 kind=2 k=["requests"] requestId=request_ff649517-5559-49d0-9644-4d30a943224d sessionId=28453db6-823b-4908-84fc-2115909bb1d8 timestamp=1775225336371 modelId=copilot/claude-opus-4.6 promptTokens=33983 outputTokens=394`
- `LINE=55 kind=1 k=["requests",8,"result"] timestamp=1775225602150 promptTokens=44149 outputTokens=191`

File shape observed:

- `lineCount=160`
- `last.kind=1`
- `last.k=hasPendingEdits`

Interpretation:

- `kind=0` acts as a session anchor.
- later `kind=1` and `kind=2` lines are request append or request-result patch events.
- token counters appear on specific request/result updates, not necessarily on every line.

#### Current Workspace Example Without Tokens Yet

Sample file:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\d4a9162b8717383539a39e3fb822bb9e\chatSessions\a2fb32ec-d33d-4c46-94ef-0ae79407cc19.jsonl`

Observed in this file:

- `creationDate`
- `sessionId`
- `requestId`
- `timestamp`
- selected model metadata
- response patch structure

Not yet observed in this file:

- `promptTokens`
- `outputTokens`

This indicates that an active session can persist transcript/request structure before token counters appear, or may omit them entirely depending on session state and timing.

### 2. Secondary Source: `chatSessions\*.json`

Path pattern:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\chatSessions\<session_id>.json`

Format:

- JSON
- older full-session snapshot structure

Why it matters:

- Useful for session metadata and request chronology.
- Useful for `toolCallRounds`.
- Not the best primary token source based on the sampled files.

Confirmed representative file:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\ce11cb1f762fe78497a48651dc6c234a\chatSessions\a6a751b2-08f3-4345-90fb-1bcf642dfc0d.json`

Confirmed fields in sampled legacy JSON:

- top-level `sessionId`
- `creationDate`
- `lastMessageDate`
- per-request `requestId`
- per-request `timestamp`
- per-request `modelId`
- `requests[i].result.metadata.toolCallRounds`
- model metadata containing `maxInputTokens` and `maxOutputTokens`

Not found in the sampled legacy JSON files:

- `promptTokens`
- `outputTokens`
- `inputTokens`
- `totalTokens`

Recommendation:

Use this format as fallback metadata only, especially when a session has no token-bearing JSONL events.

### 3. Secondary Helper: `state.vscdb`

Path pattern:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\state.vscdb`

Format:

- VS Code state database
- not convenient for direct token parsing

Observed readable fragment in the current workspace database:

- `chat.ChatSessionStore.index`
- nested fields including `sessionId`, `title`, and `lastMessageDate`

Recommendation:

Use only as an optional recovery or enrichment source for:

- session title
- last message timestamp
- confirming session existence

Do not use it as the primary timeline source.

### 4. Not a Primary Token Source: `chatEditingSessions`

Path pattern:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\chatEditingSessions\<chat_session_id>\...`

Observed contents:

- checkpoint state JSON
- edit timeline metadata
- content snapshots

Usefulness:

- helpful for edit-history reconstruction
- not useful for Copilot token accounting

### 5. Not a Primary Token Source: `GitHub.copilot-chat\chat-session-resources`

Path pattern:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\<workspace_id>\GitHub.copilot-chat\chat-session-resources\<chat_session_id>\<call_id>\content.txt`

Observed contents:

- persisted tool outputs and resource captures

Usefulness:

- can reconstruct what tools returned during a chat
- not a reliable token ledger

Note:

Folder names may embed a timestamp suffix such as `__vscode-1776455761299`, but this is incidental and not a substitute for request event timing.

## Confirmed Field Inventory

### Confirmed Present in `chatSessions\*.jsonl`

- `promptTokens`
- `outputTokens`
- `sessionId`
- `requestId`
- `timestamp`
- `creationDate`
- `modelId`
- `kind`
- `k`
- selected model metadata including `name`, `maxInputTokens`, `maxOutputTokens`

### Confirmed Present in `chatSessions\*.json`

- `sessionId`
- `requestId`
- `timestamp`
- `creationDate`
- `lastMessageDate`
- `modelId`
- `toolCallRounds`
- model limit metadata including `maxInputTokens`, `maxOutputTokens`

### Confirmed Absent in the Inspected Copilot Chat Session Files

- `inputTokens`
- `totalTokens`

### Present Elsewhere but Not Reliable for Core Token Accounting

- `createdAt`

This was found only in secondary or unrelated locations, not in the primary `chatSessions` files used for timeline extraction.

## Recommended Source Hierarchy

Use the following source order when building the parser:

1. `workspace.json` for workspace resolution.
2. `chatSessions\*.jsonl` for timeline and token events.
3. `chatSessions\*.json` for fallback request/session metadata and `toolCallRounds`.
4. `state.vscdb` only for optional enrichment such as session title or missing last-message timestamps.
5. Ignore `chatEditingSessions` and `chat-session-resources` for token accounting.

## Recommended Normalized Event Schema

Suggested normalized fields for each emitted event row:

- `workspace_id`
- `workspace_path`
- `chat_session_id`
- `provider_session_id`
- `source_format`
- `source_file`
- `source_line_number`
- `raw_kind`
- `raw_k_path`
- `request_index`
- `request_id`
- `event_timestamp`
- `session_creation_timestamp`
- `session_last_message_timestamp`
- `model_id`
- `model_name`
- `prompt_tokens`
- `output_tokens`
- `total_tokens`
- `total_tokens_derived`
- `max_input_tokens`
- `max_output_tokens`
- `tool_round_count`
- `has_tool_rounds`
- `session_title`
- `source_confidence`
- `raw_record_pointer`

Field meanings:

- `chat_session_id`: file stem or `kind=0` session anchor ID.
- `provider_session_id`: nested `sessionId` on request/result lines, if present.
- `raw_k_path`: the JSONL patch path such as `["requests"]` or `["requests",8,"result"]`.
- `total_tokens`: derived as `prompt_tokens + output_tokens` when the source does not provide a total.
- `raw_record_pointer`: stable pointer such as `source_file:line_number`.

## Parser Design

### High-Level Algorithm

1. Enumerate all directories under `C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage`.
2. For each workspace directory, read `workspace.json` if present.
3. Enumerate `chatSessions\*.jsonl` and `chatSessions\*.json`.
4. Parse JSONL files line by line in file order.
5. Use `kind=0` lines to capture session anchors.
6. Use later patch lines to reconstruct request-level state and token-bearing events.
7. Parse legacy JSON as fallback when a session has no token-bearing JSONL records.
8. Optionally enrich with `state.vscdb`.
9. Write normalized events to SQLite, CSV, JSON, or all three.

### JSONL Parsing Rules

For each `.jsonl` line:

- parse the JSON object
- capture `kind`
- capture `k` if present

If `kind=0`:

- record `v.sessionId`
- record `v.creationDate`
- record selected model from `v.inputState.selectedModel`

If the line appends a full request, often with `k=["requests"]`:

- extract `requestId`
- extract `timestamp`
- extract `modelId`
- extract `promptTokens` and `outputTokens` if present

If the line patches a request result, often with `k=["requests",N,"result"]`:

- extract request index `N`
- extract token counters if present
- extract nested `sessionId` if present
- extract `timestamp` if present

Maintain per-file in-memory mappings:

- request index to request ID
- request index to timestamp
- request index to model ID
- latest selected model

This allows backfilling missing fields on later patch lines.

### Legacy JSON Fallback Rules

For each `.json` session file:

- read top-level `sessionId`
- read `creationDate`
- read `lastMessageDate`
- iterate `requests[]`
- extract `requestId`
- extract `timestamp`
- extract `modelId`
- extract `result.metadata.toolCallRounds`

Emit these records only as fallback metadata when no token-bearing JSONL exists for the same session.

## Deduplication Strategy

Keep two outputs:

- raw event timeline
- rolled-up per-request view

Raw timeline:

- keep every token-bearing JSONL event in file order

Rolled-up view:

- key by `workspace_id`, `chat_session_id`, `request_id`
- keep the last token-bearing event by file order, or the one with the highest `output_tokens` when multiple partial updates exist

Drop only strict duplicates where all of the following match:

- `workspace_id`
- `chat_session_id`
- `request_id`
- `event_timestamp`
- `prompt_tokens`
- `output_tokens`
- `raw_k_path`

## Suggested Implementation Layout

Recommended language: Python

Suggested modules:

- `scan_workspace_storage.py`: CLI entry point
- `workspace_index.py`: resolves `workspace_id -> workspace_path`
- `parse_chat_jsonl.py`: streams JSONL files and emits token events
- `parse_chat_json.py`: parses legacy JSON session snapshots
- `parse_state_vscdb.py`: optional title/index recovery
- `models.py`: normalized data structures
- `sink_sqlite.py`: writes database output

Suggested SQLite tables:

### `workspaces`

- `workspace_id`
- `workspace_path`

### `sessions`

- `workspace_id`
- `chat_session_id`
- `session_title`
- `creation_timestamp`
- `last_message_timestamp`
- `source_file`

### `events`

- `workspace_id`
- `chat_session_id`
- `provider_session_id`
- `request_id`
- `request_index`
- `event_timestamp`
- `model_id`
- `model_name`
- `prompt_tokens`
- `output_tokens`
- `total_tokens`
- `total_tokens_derived`
- `raw_kind`
- `raw_k_path`
- `source_file`
- `source_line_number`

## Practical Recommendations

- Build the tool around `chatSessions\*.jsonl` first.
- Do not assume every session file contains token counters.
- Derive `total_tokens` yourself when needed.
- Store both chat session ID and nested provider session ID.
- Treat `createdAt` as non-authoritative for token timing.
- Keep `toolCallRounds` as optional enrichment from legacy JSON, not as a required field.

## Confidence and Limits

High confidence:

- `chatSessions\*.jsonl` is the best source for a chronological token timeline.
- exact `promptTokens` and `outputTokens` are persisted in some JSONL files.
- `workspace.json` is the correct mapping source for workspace hash resolution.
- legacy JSON files are useful fallback metadata sources.

Medium confidence:

- token appearance may vary by session age, Copilot Chat version, or whether the session has fully persisted.

Low confidence or not established by this scan:

- whether all future Copilot versions will keep the same JSONL patch structure
- whether there are additional hidden debug channels that expose richer token telemetry on this machine

## Next Use

If you build the parser later, the first file to validate against should be:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\96326818b20e995433feff77103d178d\chatSessions\54f6b91a-374c-415d-a026-aa4c2c5c1768.jsonl`

Use the current workspace mapping file to validate workspace resolution:

`C:\Users\sachi\AppData\Roaming\Code\User\workspaceStorage\d4a9162b8717383539a39e3fb822bb9e\workspace.json`