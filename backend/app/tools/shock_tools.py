"""
Shock simulation tool — runs ONLY inside the ShockSimulatorSubAgent.
Isolated context window prevents complex simulation from polluting main agent.
"""
import json
from langchain.tools import tool
from app.tools.data_source import FinancialDataSource

_ds = FinancialDataSource()

# Monthly cost multipliers for each shock scenario
_SCENARIO_COSTS = {
    "illness": {
        "label": "Medical Emergency",
        "icon": "medkit",
        "extra_monthly_cost": 1800.0,   # medical bills, reduced income
        "income_reduction": 0.5,         # 50% income drop (MC / hospitalisation)
        "description": "Hospitalisation + reduced income during recovery",
    },
    "job_loss": {
        "label": "Job Loss",
        "icon": "briefcase",
        "extra_monthly_cost": 0.0,
        "income_reduction": 1.0,          # 100% income loss
        "description": "Complete income loss until new job found",
    },
    "disaster": {
        "label": "Natural Disaster",
        "icon": "thunderstorm",
        "extra_monthly_cost": 2500.0,    # repairs, relocation
        "income_reduction": 0.3,          # 30% income loss
        "description": "Home repairs + partial income disruption",
    },
    "war": {
        "label": "Civil Unrest / War",
        "icon": "shield",
        "extra_monthly_cost": 3000.0,    # evacuation, essentials surge pricing
        "income_reduction": 0.8,
        "description": "Evacuation costs + severe income disruption",
    },
}


@tool
async def simulate_shock(scenario: str, months: int, user_id: str) -> str:
    """
    Simulate the month-by-month financial impact of a shock scenario.
    scenario: one of 'illness', 'job_loss', 'disaster', 'war'
    months: duration of the shock in months (1-12)
    user_id: the user to simulate for
    Returns a month-by-month savings depletion timeline.
    """
    profile = await _ds.get_profile(user_id)
    cfg = _SCENARIO_COSTS.get(scenario, _SCENARIO_COSTS["job_loss"])

    reduced_income = profile.monthly_income * (1 - cfg["income_reduction"])
    shock_expenses = profile.fixed_expenses + cfg["extra_monthly_cost"]
    # Flexible expenses drop somewhat during crisis
    crisis_flexible = profile.flexible_expenses * 0.6
    total_monthly_burn = shock_expenses + crisis_flexible
    monthly_net = reduced_income - total_monthly_burn

    timeline = []
    savings = profile.savings_balance

    for m in range(1, months + 1):
        savings += monthly_net
        if savings <= 0:
            timeline.append({
                "month": m,
                "savings_remaining": 0.0,
                "status": "depleted",
                "label": f"Month {m}",
            })
            # Fill remaining months as depleted
            for r in range(m + 1, months + 1):
                timeline.append({
                    "month": r,
                    "savings_remaining": 0.0,
                    "status": "depleted",
                    "label": f"Month {r}",
                })
            break
        else:
            if savings < profile.total_monthly_expenses:
                status = "critical"
            elif savings < profile.total_monthly_expenses * 2:
                status = "warning"
            else:
                status = "ok"
            timeline.append({
                "month": m,
                "savings_remaining": round(savings, 0),
                "status": status,
                "label": f"Month {m}",
            })

    depletes_at = next(
        (t["month"] for t in timeline if t["status"] == "depleted"), None
    )

    data = {
        "card": "shock",
        "scenario": scenario,
        "scenario_label": cfg["label"],
        "scenario_icon": cfg["icon"],
        "scenario_description": cfg["description"],
        "months_simulated": months,
        "monthly_burn": round(total_monthly_burn, 0),
        "reduced_income": round(reduced_income, 0),
        "starting_savings": round(profile.savings_balance, 0),
        "timeline": timeline,
        "depletes_at_month": depletes_at,
        "survives": depletes_at is None,
    }
    return json.dumps(data)
