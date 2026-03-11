"""
shock_simulation_service.py — Phase 4

Runs a personalized financial shock simulation for a given shock type.

Personalization approach (vs generic hardcoded templates):
  - Expense multipliers DERIVED from the user's actual spending ratios.
    e.g. illness health multiplier = max(base, base × (user_health_ratio / benchmark))
    → someone spending 23% on Health gets 5.75× vs someone at 5% getting 2.5× (floor)
  - Trends are extrapolated via linear regression over the user's own monthly history.
  - Income loss ratios adjusted for SOCSO proxy (stable employment via indicator scores).
  - One-time costs scale with the user's relevant category exposure + regional severity.
"""

from __future__ import annotations

from typing import Literal

ShockType = Literal["illness", "job_loss", "disaster", "war"]

# ─── Shock templates ──────────────────────────────────────────────────────────
# Defines the "anatomy" of each shock — base multipliers per category,
# income loss profile, and one-time cost range.
# Actual multipliers are SCALED per-user in _compute_personalized_multipliers().

SHOCK_BASE: dict[str, dict] = {
    "illness": {
        "income_loss_ratio": [0.00, 0.30, 0.50],   # fraction of income lost per month
        "category_sensitivity": {
            # scale "amp"  → high spender gets amplified impact
            "Health":    {"base": 2.5, "scale": "amp", "benchmark": 0.10},
            "Transport": {"base": 1.1, "scale": "amp", "benchmark": 0.15},
            "Food":      {"base": 1.0, "scale": "amp", "benchmark": 0.25},
        },
        "one_time_range":     (2_000.0, 15_000.0),
        "default_multiplier": 1.0,
    },
    "job_loss": {
        "income_loss_ratio": [1.0, 1.0, 1.0],       # total income loss
        "category_sensitivity": {
            # scale "cut" → high spender cuts MORE (lower multiplier)
            "Entertainment": {"base": 0.3, "scale": "cut", "benchmark": 0.08},
            "Shopping":      {"base": 0.3, "scale": "cut", "benchmark": 0.10},
        },
        "one_time_range":     (0.0, 0.0),
        "default_multiplier": 1.0,                   # fixed costs remain unchanged
    },
    "disaster": {
        "income_loss_ratio": [0.30, 0.20, 0.10],
        "category_sensitivity": {
            "Food":      {"base": 1.3, "scale": "amp", "benchmark": 0.25},
            "Transport": {"base": 1.2, "scale": "amp", "benchmark": 0.15},
            "Utilities": {"base": 1.5, "scale": "amp", "benchmark": 0.10},
        },
        "one_time_range":     (5_000.0, 20_000.0),
        "default_multiplier": 1.0,
    },
    "war": {
        "income_loss_ratio": [0.20, 0.30, 0.40],
        "category_sensitivity": {},                  # inflation applies to ALL categories
        "one_time_range":     (3_000.0, 10_000.0),
        "default_multiplier": 1.35,                  # broad currency/inflation multiplier
    },
}


# ─── Personalized multiplier computation ──────────────────────────────────────

def _compute_personalized_multipliers(
    profile: dict,
    shock_type: ShockType,
    severity: str,
) -> dict[str, float]:
    """
    Derives per-category expense multipliers from the user's actual spending ratios.

    Amplification categories (Health during illness, Food during disaster):
        exposure = user_ratio / benchmark   (capped at 3×)
        mult = max(base, base × exposure) × severity_factor
        → User at 23% health (vs 10% bench, exposure=2.3) → mult = 5.75
        → User at 5%  health                               → mult = 2.5 (base floor)

    Reduction categories (Entertainment/Shopping during job loss):
        mult = max(0.1, base / max(exposure, 1.0))
        → High spender cuts more (lower multiplier)
        → Low spender can't cut much (stays near base)
    """
    severity_factor = 1.4 if severity == "severe" else 1.0
    template = SHOCK_BASE[shock_type]
    avg_expense = profile["avg_monthly_expense"]
    period_months = max(profile.get("period_days", 92) / 30, 1.0)

    monthly_by_cat = {
        cat: amt / period_months for cat, amt in profile["by_category"].items()
    }

    multipliers: dict[str, float] = {}
    for cat, monthly_amt in monthly_by_cat.items():
        user_ratio = monthly_amt / avg_expense if avg_expense > 0 else 0.01
        sens = template["category_sensitivity"].get(cat)

        if sens:
            benchmark = max(sens["benchmark"], 0.01)
            exposure = min(user_ratio / benchmark, 3.0)

            if sens["scale"] == "amp":
                # Amplification: higher spending → worse impact, but floor at base
                raw = max(sens["base"], sens["base"] * exposure)
                multipliers[cat] = min(raw * severity_factor, 10.0)
            else:
                # Reduction: high spender cuts more (divisor effect)
                raw = max(0.1, sens["base"] / max(exposure, 1.0))
                multipliers[cat] = raw  # reductions are not severity-scaled
        else:
            multipliers[cat] = template["default_multiplier"] * severity_factor

    return multipliers


# ─── Trend computation ────────────────────────────────────────────────────────

def _compute_category_trends(
    expense_by_month: dict[str, dict[str, float]],
) -> dict[str, float]:
    """
    Fits a linear slope per category over the user's monthly expense history.
    Returns RM/month change (positive = rising, negative = falling).
    Returns {} if fewer than 2 months available (can't compute a slope).
    """
    if len(expense_by_month) < 2:
        return {}

    all_cats: set[str] = set()
    for m in expense_by_month.values():
        all_cats.update(m.keys())

    sorted_months = sorted(expense_by_month.keys())  # "YYYY-MM" is lexicographically chronological
    n = len(sorted_months)

    trends: dict[str, float] = {}
    for cat in all_cats:
        y = [expense_by_month[m].get(cat, 0.0) for m in sorted_months]
        x = list(range(n))
        mean_x = sum(x) / n
        mean_y = sum(y) / n
        num = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        den = sum((xi - mean_x) ** 2 for xi in x)
        trends[cat] = round(num / den, 2) if den != 0 else 0.0

    return trends


# ─── Monthly projection ───────────────────────────────────────────────────────

def _project_monthly_cash_flow(
    profile: dict,
    multipliers: dict[str, float],
    trends: dict[str, float],
    duration_months: int,
    income_loss_ratios: list[float],
    default_multiplier: float,
) -> list[dict]:
    """
    Projects income and expenses for each month of the shock duration.
    Applies personalized multipliers AND extrapolates the user's own spending trends.
    """
    avg_income = profile["avg_monthly_income"]
    period_months = max(profile.get("period_days", 92) / 30, 1.0)
    monthly_by_cat = {
        cat: amt / period_months for cat, amt in profile["by_category"].items()
    }

    projections = []
    for idx in range(duration_months):
        m = idx + 1
        loss = income_loss_ratios[min(idx, len(income_loss_ratios) - 1)]
        projected_income = avg_income * (1.0 - loss)

        projected_expense = 0.0
        breakdown: dict[str, float] = {}
        for cat, base_monthly in monthly_by_cat.items():
            trend_adj = trends.get(cat, 0.0) * idx        # extrapolate trend
            trended = max(base_monthly + trend_adj, 0.0)
            mult = multipliers.get(cat, default_multiplier)
            cat_expense = trended * mult
            projected_expense += cat_expense
            breakdown[cat] = round(cat_expense, 2)

        deficit = projected_income - projected_expense
        projections.append({
            "month":              m,
            "income":             round(projected_income, 2),
            "expense":            round(projected_expense, 2),
            "deficit":            round(deficit, 2),
            "category_breakdown": breakdown,
        })

    return projections


# ─── Main entry point ─────────────────────────────────────────────────────────

def run_shock_simulation(
    profile: dict,
    shock_type: ShockType,
    duration_months: int = 3,
    severity: str = "moderate",
    current_progress: float = 0.0,
    regional_severity: int = 1,
) -> dict:
    """
    Runs the full shock simulation and returns a report dict.

    Personalization highlights:
      - Multipliers derived from user's own spending ratios (not population averages)
      - Trends extrapolated from user's own monthly history via linear regression
      - SOCSO proxy: stable-employment users get partial income coverage in month 1
      - One-time costs scale with user's relevant exposure ratio AND regional severity
    """
    template = SHOCK_BASE[shock_type]

    # 1. Personalized multipliers
    multipliers = _compute_personalized_multipliers(profile, shock_type, severity)

    # 2. Trend analysis from the user's own monthly spending history
    trends = _compute_category_trends(profile.get("expense_by_month", {}))

    # 3. Income loss ratios, with SOCSO proxy for job_loss
    base_ratios = list(template["income_loss_ratio"])
    while len(base_ratios) < duration_months:
        base_ratios.append(base_ratios[-1])
    income_loss_ratios = base_ratios[:duration_months]

    if shock_type == "job_loss":
        # SOCSO EIS proxy: if single_income_source score is LOW, the user likely has
        # stable employment and SOCSO coverage → month 1 income loss is only ~20%
        single_income_score = next(
            (i["score"] for i in profile.get("indicators", [])
             if i["name"] == "single_income_source"),
            0.3,
        )
        if single_income_score < 0.5:
            income_loss_ratios[0] = min(income_loss_ratios[0], 0.20)

    # 4. Month-by-month projection
    projections = _project_monthly_cash_flow(
        profile, multipliers, trends,
        duration_months, income_loss_ratios,
        template["default_multiplier"],
    )

    # 5. Aggregate metrics
    total_shortfall = sum(p["deficit"] for p in projections if p["deficit"] < 0)
    severity_factor = 1.4 if severity == "severe" else 1.0
    regional_factor = 1.0 + regional_severity * 0.10   # +10% per severity point
    low, high = template["one_time_range"]
    one_time_cost = ((low + high) / 2) * severity_factor * regional_factor

    # For illness: scale one-time cost by health spending exposure
    if shock_type == "illness":
        period_months = max(profile.get("period_days", 92) / 30, 1.0)
        health_monthly = profile["by_category"].get("Health", 0.0) / period_months
        health_ratio = health_monthly / max(profile["avg_monthly_expense"], 1.0)
        one_time_cost *= (1.0 + health_ratio)

    grand_total = abs(total_shortfall) + one_time_cost

    # Months until current emergency fund runs out
    avg_deficit = abs(total_shortfall) / duration_months if total_shortfall < 0 else 0.0
    months_until_broke: float | None = None
    if avg_deficit > 0:
        months_until_broke = (
            round(current_progress / avg_deficit, 1) if current_progress > 0 else 0.0
        )

    # Severity label (based on impact-to-monthly-income ratio)
    avg_income = profile["avg_monthly_income"]
    impact_ratio = grand_total / max(avg_income, 1.0)
    severity_label = (
        "critical" if impact_ratio > 6 else
        "severe"   if impact_ratio > 3 else
        "moderate"
    )

    # Top category affected in month 1
    top_cat = "Other"
    if projections and projections[0]["category_breakdown"]:
        top_cat = max(
            projections[0]["category_breakdown"],
            key=lambda k: projections[0]["category_breakdown"][k],
        )

    return {
        "shock_type":               shock_type,
        "duration_months":          duration_months,
        "severity_label":           severity_label,
        "baseline_monthly_income":  round(profile["avg_monthly_income"], 2),
        "baseline_monthly_expense": round(profile["avg_monthly_expense"], 2),
        "monthly_projected":        projections,
        "total_shortfall":          round(total_shortfall, 2),
        "one_time_cost_estimate":   round(one_time_cost, 2),
        "grand_total_impact":       round(grand_total, 2),
        "months_until_broke":       months_until_broke,
        "regional_severity":        regional_severity,
        "trigger_indicators":       [i["name"] for i in profile.get("indicators", [])],
        "top_category_affected":    top_cat,
        "spending_trends":          trends,
    }
