"""Parity tests for date-versioned legacy multipliers."""
from copilot_usage.config import (
    MODEL_MULTIPLIERS_2026_06,
    MODEL_MULTIPLIERS_PRE_2026_06,
    MULTIPLIER_REBASE_CUTOFF_MS,
    get_multiplier,
)

BEFORE = MULTIPLIER_REBASE_CUTOFF_MS - 1
AFTER = MULTIPLIER_REBASE_CUTOFF_MS


def test_cutoff_is_2026_06_01_utc():
    # 2026-06-01T00:00:00Z == 1_780_272_000_000 ms
    assert MULTIPLIER_REBASE_CUTOFF_MS == 1_780_272_000_000


def test_pre_cutoff_uses_original_scale():
    assert get_multiplier("copilot/gpt-5.5", timestamp_ms=BEFORE) == 7.5
    assert get_multiplier("copilot/claude-sonnet-4.6", timestamp_ms=BEFORE) == 1.0
    assert get_multiplier("copilot/gpt-5-mini", timestamp_ms=BEFORE) == 0.0
    assert get_multiplier("copilot/claude-opus-4.7", timestamp_ms=BEFORE) == 15.0


def test_post_cutoff_uses_rebased_scale():
    assert get_multiplier("copilot/gpt-5.5", timestamp_ms=AFTER) == 57.0
    assert get_multiplier("copilot/claude-sonnet-4.6", timestamp_ms=AFTER) == 9.0
    assert get_multiplier("copilot/gpt-5-mini", timestamp_ms=AFTER) == 0.33
    assert get_multiplier("copilot/claude-opus-4.7", timestamp_ms=AFTER) == 27.0
    assert get_multiplier("copilot/claude-opus-4.8", timestamp_ms=AFTER) == 27.0
    assert get_multiplier("copilot/claude-opus-4.8-fast", timestamp_ms=AFTER) == 54.0


def test_no_timestamp_defaults_to_current_era():
    assert get_multiplier("copilot/gpt-5.5") == 57.0


def test_unknown_defaults_to_one_both_eras():
    assert get_multiplier("copilot/nope", timestamp_ms=BEFORE) == 1.0
    assert get_multiplier("copilot/nope", timestamp_ms=AFTER) == 1.0


def test_auto_mode_discount_applies():
    # opus 4.7 post-cutoff = 27 -> 27 * 0.9 = 24.3
    assert round(get_multiplier("copilot/claude-opus-4.7", auto_mode=True, timestamp_ms=AFTER), 4) == 24.3


def test_auto_is_zero_both_tables():
    assert MODEL_MULTIPLIERS_PRE_2026_06["copilot/auto"] == 0.0
    assert MODEL_MULTIPLIERS_2026_06["copilot/auto"] == 0.0
