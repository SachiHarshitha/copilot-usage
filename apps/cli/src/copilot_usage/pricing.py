"""Cost estimation logic for Copilot usage.

Mirrors the VS Code extension's costEstimator feature.
All USD values per 1,000,000 tokens unless noted otherwise.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PER_TOKEN_UNIT = 1_000_000          # pricing denominator
AI_CREDIT_USD_VALUE = 0.01          # $0.01 per AI Credit
ESTIMATION_MONTH_DAYS = 30          # standard normalisation window

# ---------------------------------------------------------------------------
# Model pricing table
# Source: https://docs.github.com/en/copilot/concepts/billing/copilot-requests
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ModelPricing:
    id: str
    display_name: str
    provider: str
    category: str
    input_per_million: float
    output_per_million: float
    cached_input_per_million: float = 0.0
    cache_write_per_million: float = 0.0


MODEL_PRICING: dict[str, ModelPricing] = {
    # ── OpenAI ──────────────────────────────────────────────────────────────
    "gpt-4.1": ModelPricing(
        id="gpt-4.1", display_name="GPT-4.1", provider="OpenAI", category="Versatile",
        input_per_million=2.0, cached_input_per_million=0.5, output_per_million=8.0,
    ),
    "gpt-5-mini": ModelPricing(
        id="gpt-5-mini", display_name="GPT-5 mini", provider="OpenAI", category="Lightweight",
        input_per_million=0.25, cached_input_per_million=0.025, output_per_million=2.0,
    ),
    "gpt-5.2": ModelPricing(
        id="gpt-5.2", display_name="GPT-5.2", provider="OpenAI", category="Versatile",
        input_per_million=1.75, cached_input_per_million=0.175, output_per_million=14.0,
    ),
    "gpt-5.2-codex": ModelPricing(
        id="gpt-5.2-codex", display_name="GPT-5.2-Codex", provider="OpenAI", category="Powerful",
        input_per_million=1.75, cached_input_per_million=0.175, output_per_million=14.0,
    ),
    "gpt-5.3-codex": ModelPricing(
        id="gpt-5.3-codex", display_name="GPT-5.3-Codex", provider="OpenAI", category="Powerful",
        input_per_million=1.75, cached_input_per_million=0.175, output_per_million=14.0,
    ),
    "gpt-5.4": ModelPricing(
        id="gpt-5.4", display_name="GPT-5.4", provider="OpenAI", category="Versatile",
        input_per_million=2.5, cached_input_per_million=0.25, output_per_million=15.0,
    ),
    "gpt-5.4-mini": ModelPricing(
        id="gpt-5.4-mini", display_name="GPT-5.4 mini", provider="OpenAI", category="Lightweight",
        input_per_million=0.75, cached_input_per_million=0.075, output_per_million=4.5,
    ),
    "gpt-5.4-nano": ModelPricing(
        id="gpt-5.4-nano", display_name="GPT-5.4 nano", provider="OpenAI", category="Lightweight",
        input_per_million=0.2, cached_input_per_million=0.02, output_per_million=1.25,
    ),
    "gpt-5.5": ModelPricing(
        id="gpt-5.5", display_name="GPT-5.5", provider="OpenAI", category="Powerful",
        input_per_million=5.0, cached_input_per_million=0.5, output_per_million=30.0,
    ),
    # ── Anthropic ───────────────────────────────────────────────────────────
    "claude-haiku-4.5": ModelPricing(
        id="claude-haiku-4.5", display_name="Claude Haiku 4.5", provider="Anthropic", category="Versatile",
        input_per_million=1.0, cached_input_per_million=0.1, cache_write_per_million=1.25, output_per_million=5.0,
    ),
    "claude-sonnet-4": ModelPricing(
        id="claude-sonnet-4", display_name="Claude Sonnet 4", provider="Anthropic", category="Versatile",
        input_per_million=3.0, cached_input_per_million=0.3, cache_write_per_million=3.75, output_per_million=15.0,
    ),
    "claude-sonnet-4.5": ModelPricing(
        id="claude-sonnet-4.5", display_name="Claude Sonnet 4.5", provider="Anthropic", category="Versatile",
        input_per_million=3.0, cached_input_per_million=0.3, cache_write_per_million=3.75, output_per_million=15.0,
    ),
    "claude-sonnet-4.6": ModelPricing(
        id="claude-sonnet-4.6", display_name="Claude Sonnet 4.6", provider="Anthropic", category="Versatile",
        input_per_million=3.0, cached_input_per_million=0.3, cache_write_per_million=3.75, output_per_million=15.0,
    ),
    "claude-opus-4.5": ModelPricing(
        id="claude-opus-4.5", display_name="Claude Opus 4.5", provider="Anthropic", category="Powerful",
        input_per_million=5.0, cached_input_per_million=0.5, cache_write_per_million=6.25, output_per_million=25.0,
    ),
    "claude-opus-4.6": ModelPricing(
        id="claude-opus-4.6", display_name="Claude Opus 4.6", provider="Anthropic", category="Powerful",
        input_per_million=5.0, cached_input_per_million=0.5, cache_write_per_million=6.25, output_per_million=25.0,
    ),
    "claude-opus-4.7": ModelPricing(
        id="claude-opus-4.7", display_name="Claude Opus 4.7", provider="Anthropic", category="Powerful",
        input_per_million=5.0, cached_input_per_million=0.5, cache_write_per_million=6.25, output_per_million=25.0,
    ),
    # ── Google ──────────────────────────────────────────────────────────────
    "gemini-2.5-pro": ModelPricing(
        id="gemini-2.5-pro", display_name="Gemini 2.5 Pro", provider="Google", category="Powerful",
        input_per_million=1.25, cached_input_per_million=0.125, output_per_million=10.0,
    ),
    "gemini-3-flash": ModelPricing(
        id="gemini-3-flash", display_name="Gemini 3 Flash", provider="Google", category="Lightweight",
        input_per_million=0.5, cached_input_per_million=0.05, output_per_million=3.0,
    ),
    "gemini-3.1-pro": ModelPricing(
        id="gemini-3.1-pro", display_name="Gemini 3.1 Pro", provider="Google", category="Powerful",
        input_per_million=2.0, cached_input_per_million=0.2, output_per_million=12.0,
    ),
    # ── xAI ─────────────────────────────────────────────────────────────────
    "grok-code-fast-1": ModelPricing(
        id="grok-code-fast-1", display_name="Grok Code Fast 1", provider="xAI", category="Lightweight",
        input_per_million=0.2, cached_input_per_million=0.02, output_per_million=1.5,
    ),
    # ── GitHub fine-tuned ────────────────────────────────────────────────────
    "raptor-mini": ModelPricing(
        id="raptor-mini", display_name="Raptor mini", provider="GitHub", category="Versatile",
        input_per_million=0.25, cached_input_per_million=0.025, output_per_million=2.0,
    ),
    "goldeneye": ModelPricing(
        id="goldeneye", display_name="Goldeneye", provider="GitHub", category="Powerful",
        input_per_million=1.25, cached_input_per_million=0.125, output_per_million=10.0,
    ),
}

# Sorted cheapest-output-first for UI display
MODEL_PRICING_LIST: list[ModelPricing] = sorted(
    MODEL_PRICING.values(), key=lambda m: m.output_per_million
)

# ---------------------------------------------------------------------------
# Plan allowances
# ---------------------------------------------------------------------------

CopilotPlan = Literal["free", "pro", "pro_plus", "business", "enterprise", "unknown"]
AllowanceType = Literal["individual", "pooled_org", "limited_or_unknown"]


@dataclass(frozen=True)
class PlanAllowance:
    display_name: str
    allowance_type: AllowanceType
    included_credits_per_month: int | None = None       # individual plans
    included_credits_per_user_per_month: int | None = None  # org plans
    included_usd_value: float | None = None


PLAN_ALLOWANCES: dict[str, PlanAllowance] = {
    "pro": PlanAllowance(
        display_name="Copilot Pro",
        allowance_type="individual",
        included_credits_per_month=1000,
        included_usd_value=10.0,
    ),
    "pro_plus": PlanAllowance(
        display_name="Copilot Pro+",
        allowance_type="individual",
        included_credits_per_month=3900,
        included_usd_value=39.0,
    ),
    "business": PlanAllowance(
        display_name="Copilot Business",
        allowance_type="pooled_org",
        included_credits_per_user_per_month=1900,
    ),
    "enterprise": PlanAllowance(
        display_name="Copilot Enterprise",
        allowance_type="pooled_org",
        included_credits_per_user_per_month=3900,
    ),
    "free": PlanAllowance(
        display_name="Copilot Free",
        allowance_type="limited_or_unknown",
    ),
    "unknown": PlanAllowance(
        display_name="Not selected",
        allowance_type="limited_or_unknown",
    ),
}

# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

def _strip_prefix(model_id: str) -> str:
    """Strip 'copilot/' prefix if present, returning bare model key."""
    return model_id.removeprefix("copilot/")


def get_model_pricing(model_id: str) -> ModelPricing | None:
    """Return pricing for a model_id (with or without 'copilot/' prefix)."""
    return MODEL_PRICING.get(_strip_prefix(model_id))


# ---------------------------------------------------------------------------
# Calculation dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ModelCostRow:
    model_id: str
    display_name: str
    provider: str
    observed_prompt_tokens: int
    observed_output_tokens: int
    monthly_prompt_tokens: float
    monthly_output_tokens: float
    input_cost_usd: float
    output_cost_usd: float
    total_cost_usd: float
    monthly_credits: int


@dataclass
class CostSummary:
    days_observed: int
    total_monthly_usd: float
    total_monthly_credits: int
    rows: list[ModelCostRow] = field(default_factory=list)
    # Trend fields (populated by compute_trend separately)
    trend_delta_pct: int | None = None
    trend_label: str | None = None


@dataclass
class PlanImpact:
    plan_id: str
    status: Literal[
        "within_allowance",
        "over_allowance_within_budget",
        "over_allowance_exceeds_budget",
        "pooled_org",
        "estimate_only",
    ]
    estimated_credits: int
    included_credits: int | None
    extra_budget_credits: int
    overage_credits: int
    estimated_extra_usd: float
    is_within_allowance: bool | None
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Core calculations
# ---------------------------------------------------------------------------

def compute_monthly_cost(
    token_rows: list[dict],
    days_observed: int,
) -> CostSummary:
    """Compute estimated monthly USD cost from aggregated token rows.

    Args:
        token_rows: list of dicts with keys:
            ``model_id``, ``prompt_tokens``, ``output_tokens``
        days_observed: number of days the token_rows span (used for
            normalising to a 30-day month).

    Returns:
        :class:`CostSummary` with per-model breakdown and totals.
    """
    days = max(1, days_observed)
    scale = ESTIMATION_MONTH_DAYS / days  # >1 when observing less than 30 days

    rows: list[ModelCostRow] = []
    total_usd = 0.0
    total_credits = 0

    for row in token_rows:
        raw_model = row.get("model_id") or row.get("model") or ""
        prompt_obs = int(row.get("prompt_tokens", 0) or 0)
        output_obs = int(row.get("output_tokens", 0) or 0)

        monthly_prompt = prompt_obs * scale
        monthly_output = output_obs * scale

        pricing = get_model_pricing(raw_model)
        if pricing is None:
            # Unknown model: use 0 cost but still record the row
            rows.append(ModelCostRow(
                model_id=raw_model,
                display_name=_strip_prefix(raw_model) or "unknown",
                provider="Unknown",
                observed_prompt_tokens=prompt_obs,
                observed_output_tokens=output_obs,
                monthly_prompt_tokens=monthly_prompt,
                monthly_output_tokens=monthly_output,
                input_cost_usd=0.0,
                output_cost_usd=0.0,
                total_cost_usd=0.0,
                monthly_credits=0,
            ))
            continue

        input_usd = (monthly_prompt / PER_TOKEN_UNIT) * pricing.input_per_million
        output_usd = (monthly_output / PER_TOKEN_UNIT) * pricing.output_per_million
        row_usd = input_usd + output_usd
        row_credits = math.ceil(row_usd / AI_CREDIT_USD_VALUE)

        total_usd += row_usd
        total_credits += row_credits

        rows.append(ModelCostRow(
            model_id=raw_model,
            display_name=pricing.display_name,
            provider=pricing.provider,
            observed_prompt_tokens=prompt_obs,
            observed_output_tokens=output_obs,
            monthly_prompt_tokens=monthly_prompt,
            monthly_output_tokens=monthly_output,
            input_cost_usd=input_usd,
            output_cost_usd=output_usd,
            total_cost_usd=row_usd,
            monthly_credits=row_credits,
        ))

    rows.sort(key=lambda r: r.total_cost_usd, reverse=True)
    return CostSummary(
        days_observed=days,
        total_monthly_usd=total_usd,
        total_monthly_credits=math.ceil(total_usd / AI_CREDIT_USD_VALUE),
        rows=rows,
    )


def compute_plan_impact(
    summary: CostSummary,
    plan_id: str,
    extra_budget_usd: float = 0.0,
) -> PlanImpact:
    """Compare estimated monthly credits against a Copilot plan allowance."""
    allowance = PLAN_ALLOWANCES.get(plan_id, PLAN_ALLOWANCES["unknown"])
    extra_budget_credits = max(0, math.ceil(extra_budget_usd / AI_CREDIT_USD_VALUE))
    estimated = summary.total_monthly_credits
    warnings: list[str] = []

    if allowance.allowance_type == "individual" and allowance.included_credits_per_month is not None:
        included = allowance.included_credits_per_month
        overage = max(0, estimated - included)
        extra_usd = overage * AI_CREDIT_USD_VALUE
        within = estimated <= included

        if within:
            status = "within_allowance"
        elif overage <= extra_budget_credits:
            status = "over_allowance_within_budget"
        else:
            status = "over_allowance_exceeds_budget"

        return PlanImpact(
            plan_id=plan_id,
            status=status,
            estimated_credits=estimated,
            included_credits=included,
            extra_budget_credits=extra_budget_credits,
            overage_credits=overage,
            estimated_extra_usd=extra_usd,
            is_within_allowance=within,
            warnings=warnings,
        )

    if allowance.allowance_type == "pooled_org":
        per_user = allowance.included_credits_per_user_per_month
        if plan_id == "business":
            warnings.append(
                "Copilot Business: 1,900 credits per assigned user per month, "
                "pooled at the billing entity level. This shows your personal usage "
                "equivalent, not your organisation's final bill."
            )
        else:
            warnings.append(
                "Copilot Enterprise: 3,900 credits per assigned user per month, "
                "pooled at the billing entity level. This shows your personal usage "
                "equivalent, not your organisation's final bill."
            )
        return PlanImpact(
            plan_id=plan_id,
            status="pooled_org",
            estimated_credits=estimated,
            included_credits=per_user,
            extra_budget_credits=extra_budget_credits,
            overage_credits=0,
            estimated_extra_usd=0.0,
            is_within_allowance=None,
            warnings=warnings,
        )

    # free / unknown
    if plan_id == "free":
        warnings.append(
            "Copilot Free has limited usage. This estimate shows token-based value "
            "but may not reflect Free-plan limits exactly."
        )
    else:
        warnings.append("Select your Copilot plan to see personalised plan impact.")

    return PlanImpact(
        plan_id=plan_id,
        status="estimate_only",
        estimated_credits=estimated,
        included_credits=None,
        extra_budget_credits=extra_budget_credits,
        overage_credits=0,
        estimated_extra_usd=0.0,
        is_within_allowance=None,
        warnings=warnings,
    )


def compute_trend(
    tokens_last_30d: int,
    tokens_last_90d: int,
) -> tuple[int, str] | None:
    """Compare last-30d tokens vs 3-month average.

    Returns ``(delta_pct, label)`` or ``None`` when insufficient data.
    Requires both windows to be non-zero.
    """
    if tokens_last_90d == 0:
        return None
    long_term_monthly = tokens_last_90d / 3
    if long_term_monthly == 0:
        return None
    delta_pct = round(((tokens_last_30d - long_term_monthly) / long_term_monthly) * 100)
    if delta_pct >= 0:
        label = f"Your last 30 days are {delta_pct}% higher than your 3-month average."
    else:
        label = f"Your last 30 days are {abs(delta_pct)}% lower than your 3-month average."
    return delta_pct, label
