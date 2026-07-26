"""Tests for credit accounting (mirrors the extension's credits.test.ts)."""
from __future__ import annotations

from copilot_usage.credits import (
    credits_for_request,
    fallback_rate_for,
    parse_credit_rates_from_catalog,
)
from copilot_usage.pricing import AI_CREDIT_USD_VALUE, MODEL_PRICING


def test_fallback_rate_derived_from_model_pricing():
    rate = fallback_rate_for("claude-opus-4.7")
    assert rate is not None
    pricing = MODEL_PRICING["claude-opus-4.7"]
    assert rate[0] == pricing.input_per_million / AI_CREDIT_USD_VALUE
    assert rate[1] == pricing.output_per_million / AI_CREDIT_USD_VALUE


def test_fallback_rate_strips_copilot_prefix():
    assert fallback_rate_for("copilot/claude-opus-4.7") == fallback_rate_for("claude-opus-4.7")


def test_fallback_rate_unknown_model_is_none():
    assert fallback_rate_for("totally-made-up-model") is None


def test_credits_for_request_matches_usd_times_100():
    # 10M input + 300K output @ Claude Opus 4.7 → $57.50 → 5750 credits
    credits = credits_for_request("claude-opus-4.7", 10_000_000, 300_000)
    assert round(credits) == 5750


def test_real_rates_take_precedence_over_fallback():
    rates = {"claude-opus-4.7": (999.0, 1.0)}
    assert credits_for_request("claude-opus-4.7", 1_000_000, 0, rates) == 999.0


def test_credits_for_unknown_or_missing_model_is_zero():
    assert credits_for_request("totally-made-up-model", 1_000_000, 1_000_000) == 0.0
    assert credits_for_request(None, 1_000_000, 1_000_000) == 0.0


def test_parse_catalog_reads_default_token_prices():
    catalog = """
    [
      {
        "id": "claude-opus-4.8-fast",
        "capabilities": {"family": "claude-opus-4.8-fast"},
        "billing": {"token_prices": {"default": {"input_price": 1000, "output_price": 5000}}}
      }
    ]
    """
    rates = parse_credit_rates_from_catalog(catalog)
    assert rates["claude-opus-4.8-fast"] == (1000.0, 5000.0)
    credits = credits_for_request("claude-opus-4.8-fast", 500_000, 100_000, rates)
    assert credits == 0.5 * 1000 + 0.1 * 5000


def test_parse_catalog_ignores_non_numeric_prices():
    catalog = """
    [
      {"id": "no-billing"},
      {"id": "no-default", "billing": {"token_prices": {}}},
      {"id": "bad-types", "billing": {"token_prices": {"default": {"input_price": "x"}}}}
    ]
    """
    assert parse_credit_rates_from_catalog(catalog) == {}


def test_parse_catalog_invalid_or_non_array_returns_empty():
    assert parse_credit_rates_from_catalog("not json") == {}
    assert parse_credit_rates_from_catalog('{"id": "x"}') == {}
