"""Parse Copilot chat session JSONL files into structured events."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger(__name__)


@dataclass
class SessionAnchor:
    chat_session_id: str
    creation_date: int | None = None  # epoch ms
    model_id: str | None = None
    model_name: str | None = None
    multiplier_raw: str | None = None  # e.g. "3x"


@dataclass
class RequestEvent:
    """A completed request with token counts."""
    chat_session_id: str
    request_index: int
    request_id: str | None = None
    model_id: str | None = None
    timestamp_ms: int | None = None
    prompt_tokens: int = 0
    output_tokens: int = 0
    tool_call_rounds: int = 0


@dataclass
class ParsedFile:
    source_path: Path
    workspace_id: str
    workspace_path: str
    anchor: SessionAnchor | None = None
    requests: list[RequestEvent] = field(default_factory=list)
    # Track request-index → model_id from kind=2 append lines
    _request_models: dict[int, str] = field(default_factory=dict)
    # Track request-index → request_id from kind=2 append lines
    _request_ids: dict[int, str] = field(default_factory=dict)
    # Track request-index → timestamp from kind=2 append lines
    _request_timestamps: dict[int, int] = field(default_factory=dict)
    # Track the next expected request index for new request appends
    _next_request_index: int = 0


def parse_jsonl(
    jsonl_path: Path,
    workspace_id: str,
    workspace_path: str,
) -> ParsedFile:
    """Parse a single JSONL file and extract session anchor + request events."""
    pf = ParsedFile(
        source_path=jsonl_path,
        workspace_id=workspace_id,
        workspace_path=workspace_path,
    )

    try:
        raw_lines = jsonl_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        log.warning("Cannot read %s: %s", jsonl_path, exc)
        return pf

    for line_no, raw in enumerate(raw_lines):
        if not raw.strip():
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            log.debug("Malformed JSON at %s:%d", jsonl_path.name, line_no)
            continue
        _process_line(pf, obj, line_no)

    # If no session anchor was found, use the file stem as session ID
    if not pf.anchor:
        pf.anchor = SessionAnchor(chat_session_id=jsonl_path.stem)
    elif not pf.anchor.chat_session_id:
        pf.anchor.chat_session_id = jsonl_path.stem

    # Back-fill model_id from request-append lines onto result events
    for req in pf.requests:
        if not req.chat_session_id:
            req.chat_session_id = pf.anchor.chat_session_id
        if not req.model_id:
            req.model_id = pf._request_models.get(req.request_index)
        if not req.model_id and pf.anchor:
            req.model_id = pf.anchor.model_id
        if not req.request_id:
            req.request_id = pf._request_ids.get(req.request_index)

    return pf


def _process_line(pf: ParsedFile, obj: dict, line_no: int) -> None:
    kind = obj.get("kind")
    k = obj.get("k")
    v = obj.get("v")

    if kind == 0:
        _handle_session_anchor(pf, v or obj)
        return

    if kind == 2 and isinstance(k, list) and k == ["requests"] and isinstance(v, list):
        _handle_new_requests(pf, v)
        return

    if kind == 1 and isinstance(k, list) and len(k) == 3 and k[0] == "requests" and k[2] == "result":
        request_index = k[1]
        if isinstance(request_index, int) and isinstance(v, dict):
            _handle_result(pf, v, request_index)
        return


def _handle_session_anchor(pf: ParsedFile, v: dict) -> None:
    sid = v.get("sessionId", "")
    pf.anchor = SessionAnchor(
        chat_session_id=sid,
        creation_date=v.get("creationDate"),
    )
    # Extract model info from inputState.selectedModel
    input_state = v.get("inputState", {})
    if isinstance(input_state, dict):
        selected = input_state.get("selectedModel", {})
        if isinstance(selected, dict):
            pf.anchor.model_id = selected.get("identifier")
            md = selected.get("metadata", {})
            if isinstance(md, dict):
                pf.anchor.model_name = md.get("name")
                pf.anchor.multiplier_raw = md.get("multiplier")


def _handle_new_requests(pf: ParsedFile, v: list) -> None:
    """Process kind=2 k=['requests'] – array of new request objects being appended."""
    for item in v:
        if not isinstance(item, dict):
            continue
        idx = pf._next_request_index
        pf._next_request_index += 1

        model_id = item.get("modelId")
        request_id = item.get("requestId")
        timestamp = item.get("timestamp")
        if model_id:
            pf._request_models[idx] = model_id
        if request_id:
            pf._request_ids[idx] = request_id
        if timestamp:
            pf._request_timestamps[idx] = timestamp


def _handle_result(pf: ParsedFile, v: dict, request_index: int) -> None:
    """Process kind=1 k=['requests', N, 'result'] – the token-bearing result line."""
    md = v.get("metadata", {})
    usage = v.get("usage", {})

    prompt_tokens = md.get("promptTokens") or usage.get("promptTokens") or 0
    output_tokens = md.get("outputTokens") or usage.get("completionTokens") or 0

    tcr = md.get("toolCallRounds", [])
    tool_rounds = len(tcr) if isinstance(tcr, list) else 0

    # Timestamp: prefer timings.requestSent or the first toolCallRound timestamp
    timings = v.get("timings", {})
    timestamp_ms = None
    if isinstance(timings, dict):
        timestamp_ms = timings.get("requestSent") or timings.get("firstTokenReceived")
    if not timestamp_ms and isinstance(tcr, list) and tcr:
        first_round = tcr[0] if isinstance(tcr[0], dict) else {}
        timestamp_ms = first_round.get("timestamp")
    # Fallback: use the request-append timestamp
    if not timestamp_ms:
        timestamp_ms = pf._request_timestamps.get(request_index)

    chat_session_id = ""
    if pf.anchor:
        chat_session_id = pf.anchor.chat_session_id

    event = RequestEvent(
        chat_session_id=chat_session_id,
        request_index=request_index,
        model_id=md.get("modelId"),  # often None; back-filled later
        timestamp_ms=timestamp_ms,
        prompt_tokens=prompt_tokens,
        output_tokens=output_tokens,
        tool_call_rounds=tool_rounds,
    )
    pf.requests.append(event)
