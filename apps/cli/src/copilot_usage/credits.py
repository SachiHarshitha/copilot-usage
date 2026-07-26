"""Credit accounting for Copilot usage.

Mirrors the VS Code extension's ``core/credits.ts``. GitHub Copilot meters usage
in "AI credits" where 1 credit = $0.01 of token cost. The real per-token credit
rates ship with the user's account in the Copilot Chat catalog
(``models.json`` → ``billing.token_prices``), whose ``input_price`` /
``output_price`` values are already denominated in credits per 1,000,000 tokens.
We use those real rates when available and fall back to the maintained
MODEL_PRICING table (USD ÷ credit value) otherwise.

The session logs record only the total prompt-token count (not the
cached/uncached split), so prompt tokens are priced at the standard input rate —
a slightly conservative approximation.
"""
from __future__ import annotations

import json
from pathlib import Path

from copilot_usage.config import VSCODE_STORAGE_ROOT
from copilot_usage.pricing import AI_CREDIT_USD_VALUE, MODEL_PRICING, _strip_prefix

PER_TOKEN_UNIT = 1_000_000

# (input_per_million_credits, output_per_million_credits)
CreditRate = tuple[float, float]
CreditRateMap = dict[str, CreditRate]


def fallback_rate_for(model_id: str) -> CreditRate | None:
    """Credit rate derived from the maintained MODEL_PRICING table (USD → credits)."""
    pricing = MODEL_PRICING.get(_strip_prefix(model_id or ""))
    if pricing is None:
        return None
    return (
        pricing.input_per_million / AI_CREDIT_USD_VALUE,
        pricing.output_per_million / AI_CREDIT_USD_VALUE,
    )


def credits_for_request(
    model_id: str | None,
    input_tokens: float,
    output_tokens: float,
    rates: CreditRateMap | None = None,
) -> float:
    """Credits consumed by a single request. Returns 0 when the model is unknown."""
    if not model_id:
        return 0.0
    rate: CreditRate | None = None
    if rates:
        rate = rates.get(_strip_prefix(model_id))
    if rate is None:
        rate = fallback_rate_for(model_id)
    if rate is None:
        return 0.0
    return input_tokens / PER_TOKEN_UNIT * rate[0] + output_tokens / PER_TOKEN_UNIT * rate[1]


def parse_credit_rates_from_catalog(raw: str) -> CreditRateMap:
    """Parse a Copilot ``models.json`` catalog into a credit-rate map."""
    out: CreditRateMap = {}
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return out
    if not isinstance(data, list):
        return out
    for entry in data:
        if not isinstance(entry, dict):
            continue
        billing = entry.get("billing") or {}
        token_prices = billing.get("token_prices") or {}
        prices = token_prices.get("default") or {}
        inp = prices.get("input_price")
        out_p = prices.get("output_price")
        if isinstance(inp, bool) or isinstance(out_p, bool):
            continue
        if not isinstance(inp, (int, float)) or not isinstance(out_p, (int, float)):
            continue
        rate: CreditRate = (float(inp), float(out_p))
        capabilities = entry.get("capabilities") or {}
        for key in (entry.get("id"), capabilities.get("family")):
            if isinstance(key, str) and key:
                out[_strip_prefix(key)] = rate
    return out


def _find_newest_catalog(storage_root: Path) -> Path | None:
    """Locate the most recently written ``models.json`` across all workspaces."""
    newest: Path | None = None
    newest_mtime = -1.0
    try:
        ws_dirs = list(storage_root.iterdir())
    except OSError:
        return None
    for ws_dir in ws_dirs:
        logs_dir = ws_dir / "GitHub.copilot-chat" / "debug-logs"
        if not logs_dir.is_dir():
            continue
        for candidate in logs_dir.glob("*/models.json"):
            try:
                mtime = candidate.stat().st_mtime
            except OSError:
                continue
            if mtime > newest_mtime:
                newest_mtime = mtime
                newest = candidate
    return newest


def load_credit_rates(storage_root: Path | None = None) -> CreditRateMap:
    """Load real credit rates from the Copilot catalog; empty map when unavailable."""
    root = Path(storage_root) if storage_root is not None else VSCODE_STORAGE_ROOT
    catalog = _find_newest_catalog(root)
    if catalog is None:
        return {}
    try:
        return parse_credit_rates_from_catalog(catalog.read_text(encoding="utf-8"))
    except OSError:
        return {}
