"""Parse Copilot chat session JSONL files into structured events."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_tokenizer():
    """Lazy-load tiktoken cl100k_base encoder (used by GPT-4 / Copilot models)."""
    try:
        import tiktoken
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return None


def estimate_tokens(text: str) -> int:
    """Estimate token count for a text string.

    Uses tiktoken cl100k_base if available, otherwise falls back to
    a ~4 chars/token heuristic.
    """
    if not text:
        return 0
    enc = _get_tokenizer()
    if enc is not None:
        return len(enc.encode(text))
    # Fallback: ~4 chars per token for English/code mix
    return max(1, len(text) // 4)


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
    tokens_estimated: bool = False


@dataclass
class ParsedFile:
    source_path: Path
    workspace_id: str
    workspace_path: str
    data_source: str = "jsonl"  # 'jsonl' or 'legacy_json'
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


def parse_legacy_json(
    json_path: Path,
    workspace_id: str,
    workspace_path: str,
) -> ParsedFile:
    """Parse a legacy (pre-Feb 2026) single-object .json session file."""
    pf = ParsedFile(
        source_path=json_path,
        workspace_id=workspace_id,
        workspace_path=workspace_path,
        data_source="legacy_json",
    )

    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Cannot read legacy JSON %s: %s", json_path, exc)
        return pf

    if not isinstance(data, dict):
        return pf

    session_id = data.get("sessionId", "") or json_path.stem
    creation_date = data.get("creationDate")

    # Extract model from selectedModel (newer legacy) or responder info
    model_id = None
    selected = data.get("selectedModel")
    if isinstance(selected, dict):
        model_id = selected.get("id") or selected.get("identifier")

    pf.anchor = SessionAnchor(
        chat_session_id=session_id,
        creation_date=creation_date,
        model_id=model_id,
    )

    requests = data.get("requests", [])
    if not isinstance(requests, list):
        return pf

    for idx, req in enumerate(requests):
        if not isinstance(req, dict):
            continue

        # Extract token data from response.result.metadata / usage
        resp = req.get("response", {})
        result = resp.get("result", {}) if isinstance(resp, dict) else {}
        md = result.get("metadata", {}) if isinstance(result, dict) else {}
        usage = result.get("usage", {}) if isinstance(result, dict) else {}

        prompt_tokens = 0
        output_tokens = 0
        if isinstance(md, dict):
            prompt_tokens = md.get("promptTokens") or 0
            output_tokens = md.get("outputTokens") or 0
        if not prompt_tokens and isinstance(usage, dict):
            prompt_tokens = usage.get("promptTokens") or 0
        if not output_tokens and isinstance(usage, dict):
            output_tokens = usage.get("completionTokens") or 0

        # Estimate tokens from text content when actual counts are missing
        estimated = False
        if not prompt_tokens or not output_tokens:
            prompt_text, resp_text = _extract_legacy_text(req)
            if not prompt_tokens and prompt_text:
                prompt_tokens = estimate_tokens(prompt_text)
                estimated = True
            if not output_tokens and resp_text:
                output_tokens = estimate_tokens(resp_text)
                estimated = True

        tool_rounds = 0
        if isinstance(md, dict):
            tcr = md.get("toolCallRounds", [])
            tool_rounds = len(tcr) if isinstance(tcr, list) else 0

        # Timestamp: use result timings, or derive from creationDate
        timestamp_ms = None
        if isinstance(result, dict):
            timings = result.get("timings", {})
            if isinstance(timings, dict):
                timestamp_ms = timings.get("requestSent") or timings.get("firstTokenReceived")
        if timestamp_ms is None:
            timestamp_ms = creation_date

        req_model = None
        if isinstance(md, dict):
            req_model = md.get("modelId")

        event = RequestEvent(
            chat_session_id=session_id,
            request_index=idx,
            request_id=None,
            model_id=req_model or model_id,
            timestamp_ms=timestamp_ms,
            prompt_tokens=prompt_tokens,
            output_tokens=output_tokens,
            tool_call_rounds=tool_rounds,
            tokens_estimated=estimated,
        )
        pf.requests.append(event)

    return pf


def _extract_legacy_text(req: dict) -> tuple[str, str]:
    """Extract (prompt_text, response_text) from a legacy JSON request object.

    prompt_text = message.text + variable context data
    response_text = concatenated response content parts
    """
    # --- Prompt side ---
    prompt_parts: list[str] = []
    msg = req.get("message", {})
    if isinstance(msg, dict):
        text = msg.get("text", "")
        if text:
            prompt_parts.append(text)

    # Variable/context data (attached files, selections, etc.)
    vd = req.get("variableData", {})
    if isinstance(vd, dict):
        for var in vd.get("variables", []):
            if isinstance(var, dict):
                val = var.get("value", "")
                if isinstance(val, str) and val:
                    prompt_parts.append(val)

    # --- Response side ---
    resp_parts: list[str] = []
    resp = req.get("response")

    if isinstance(resp, list):
        # Legacy format: response is a list of typed items
        for item in resp:
            if not isinstance(item, dict):
                continue
            val = item.get("value", "")
            if isinstance(val, str) and val:
                resp_parts.append(val)
            elif isinstance(val, dict):
                content = val.get("content", "")
                if content:
                    resp_parts.append(content)
            # Also check direct content key
            content = item.get("content", "")
            if isinstance(content, str) and content:
                resp_parts.append(content)
    elif isinstance(resp, dict):
        result = resp.get("result", {})
        if isinstance(result, dict):
            val = result.get("value", "")
            if isinstance(val, str) and val:
                resp_parts.append(val)

    return "\n".join(prompt_parts), "\n".join(resp_parts)


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
