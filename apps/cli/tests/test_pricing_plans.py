"""Parity tests for CLI pricing: new models, retirements, base+flex plans, Max."""
from copilot_usage.pricing import (
    MODEL_PRICING,
    MODEL_PRICING_LIST,
    PLAN_ALLOWANCES,
    CostSummary,
    compute_plan_impact,
)


def _summary(credits: int) -> CostSummary:
    return CostSummary(
        days_observed=30,
        total_monthly_usd=credits * 0.01,
        total_monthly_credits=credits,
    )


def test_new_models_present():
    for model_id in (
        "claude-opus-4.8",
        "claude-opus-4.8-fast",
        "claude-fable-5",
        "gemini-3.5-flash",
        "mai-code-1-flash",
    ):
        assert model_id in MODEL_PRICING
    assert MODEL_PRICING["mai-code-1-flash"].provider == "Microsoft"


def test_retired_models_flagged():
    retired = {
        "gpt-4.1": "gpt-5.5",
        "gpt-5.2": "gpt-5.5",
        "gpt-5.2-codex": "gpt-5.3-codex",
        "grok-code-fast-1": "gpt-5-mini",
        "claude-sonnet-4": "claude-sonnet-4.6",
        "goldeneye": None,
    }
    for model_id, successor in retired.items():
        m = MODEL_PRICING[model_id]
        assert m.release_status == "Retired", model_id
        assert m.retired_date is not None, model_id
        if successor:
            assert m.successor_id == successor, model_id


def test_raptor_mini_is_ga():
    assert MODEL_PRICING["raptor-mini"].release_status == "GA"


def test_model_list_sorts_retired_last():
    statuses = [m.release_status == "Retired" for m in MODEL_PRICING_LIST]
    first_retired = statuses.index(True) if True in statuses else len(statuses)
    # No active model appears after the first retired one.
    assert all(statuses[i] for i in range(first_retired, len(statuses)))


def test_plan_allowances_base_flex_and_max():
    pro = PLAN_ALLOWANCES["pro"]
    assert (pro.base_credits_per_month, pro.flex_credits_per_month) == (1000, 500)
    assert pro.included_credits_per_month == 1500

    pro_plus = PLAN_ALLOWANCES["pro_plus"]
    assert (pro_plus.base_credits_per_month, pro_plus.flex_credits_per_month) == (3900, 3100)
    assert pro_plus.included_credits_per_month == 7000

    mx = PLAN_ALLOWANCES["max"]
    assert (mx.base_credits_per_month, mx.flex_credits_per_month) == (10000, 10000)
    assert mx.included_credits_per_month == 20000
    assert mx.included_usd_value == 100.0


def test_plan_impact_flex_on_vs_off():
    on = compute_plan_impact(_summary(5750), "pro_plus", include_flex=True)
    assert on.included_credits == 7000
    assert on.flex_applied is True
    assert on.overage_credits == 0
    assert on.status == "within_allowance"

    off = compute_plan_impact(_summary(5750), "pro_plus", include_flex=False)
    assert off.included_credits == 3900
    assert off.included_base_credits == 3900
    assert off.included_flex_credits == 3100
    assert off.flex_applied is False
    assert off.overage_credits == 1850
    assert round(off.estimated_extra_usd, 2) == 18.5
    assert off.status == "over_allowance_exceeds_budget"


def test_plan_impact_max():
    on = compute_plan_impact(_summary(15000), "max", include_flex=True)
    assert on.included_credits == 20000
    assert on.status == "within_allowance"

    off = compute_plan_impact(_summary(15000), "max", include_flex=False)
    assert off.included_credits == 10000
    assert off.overage_credits == 5000
