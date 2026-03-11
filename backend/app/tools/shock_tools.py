"""
Shock simulation tools — run ONLY inside the ShockSimulatorSubAgent.
Isolated context window prevents complex simulation from polluting main agent.

Tools exposed:
  simulate_shock          — rich multi-phase simulation with safety nets & survival actions
  stress_test_scenarios   — compare all 4 shock scenarios side-by-side
"""
import asyncio
import json
import os
from langchain.tools import tool
from google import genai as _genai
from app.tools.data_source import FinancialDataSource

_ds = FinancialDataSource()

# ─── Scenario configuration ──────────────────────────────────────────────────
# Each scenario now has three phases that evolve over the simulated months.
_SCENARIO_CONFIGS = {
    "illness": {
        "label": "Medical Emergency",
        "icon": "medkit",
        "description": "Hospitalisation + reduced income during recovery",
        "risk_probability": "Moderate — 1 in 8 Malaysians hospitalised annually",
        "insurance_gap_note": "MedCard costs ~RM120–250/mo; currently uninsured",
        # Phase thresholds (start at month 1)
        "phases": [
            {
                "id": "acute",
                "label": "Acute Crisis",
                "month_start": 1,
                "month_end": 2,
                "income_reduction": 0.7,        # heavy MC / hospitalisation
                "extra_monthly_cost": 3500.0,   # hospital bills, medication
                "flexible_multiplier": 0.4,
                "description": "Hospitalisation + heavy medical bills",
            },
            {
                "id": "recovery",
                "label": "Recovery",
                "month_start": 3,
                "month_end": 9999,
                "income_reduction": 0.3,        # partial MC / part-time work
                "extra_monthly_cost": 600.0,    # ongoing medication, physio
                "flexible_multiplier": 0.7,
                "description": "Reduced work capacity + ongoing treatment",
            },
        ],
        "safety_nets": [
            {
                "name": "SOCSO Temp Disablement Benefit",
                "monthly_amount": 800.0,
                "note": "Up to 24 months; requires SOCSO contribution history",
            },
            {
                "name": "EPF Medical Withdrawal",
                "monthly_amount": 0.0,   # one-time, calculated dynamically
                "note": "Withdrawable for critical illness (Account 2)",
            },
        ],
        "survival_actions": [
            {
                "action": "Apply for SOCSO Temporary Disablement Benefit",
                "monthly_impact": 800.0,
                "type": "income",
                "description": "Claim ~RM800/mo from SOCSO during hospitalisation",
            },
            {
                "action": "Negotiate hospital instalment plan",
                "monthly_impact": 1500.0,
                "type": "expense_cut",
                "description": "Spread RM6k bill over 6 months instead of lump-sum",
            },
            {
                "action": "Cut discretionary to survival mode",
                "monthly_impact": 680.0,
                "type": "expense_cut",
                "description": "Eliminate dining-out, entertainment, non-essentials",
            },
        ],
    },

    "job_loss": {
        "label": "Job Loss",
        "icon": "briefcase",
        "description": "Complete income loss until re-employment",
        "risk_probability": "High — ~18% of Malaysian workforce faces layoff risk during downturns",
        "insurance_gap_note": "Income protection insurance costs ~RM80–150/mo",
        "phases": [
            {
                "id": "shock",
                "label": "Immediate Shock",
                "month_start": 1,
                "month_end": 1,
                "income_reduction": 1.0,
                "extra_monthly_cost": 200.0,   # job search, resume printing, transport
                "flexible_multiplier": 0.8,
                "description": "Zero income — job search begins",
            },
            {
                "id": "search",
                "label": "Job Search",
                "month_start": 2,
                "month_end": 4,
                "income_reduction": 1.0,
                "extra_monthly_cost": 0.0,
                "flexible_multiplier": 0.55,
                "description": "Tightening belt — active job hunting",
            },
            {
                "id": "partial_recovery",
                "label": "Partial Recovery",
                "month_start": 5,
                "month_end": 9999,
                "income_reduction": 0.3,       # part-time / freelance income
                "extra_monthly_cost": 0.0,
                "flexible_multiplier": 0.6,
                "description": "Part-time or freelance bridging income",
            },
        ],
        "safety_nets": [
            {
                "name": "SOCSO EIS (Employment Insurance)",
                "monthly_amount": 1200.0,
                "note": "Up to 6 months; ~60% of last salary capped at RM4k",
            },
            {
                "name": "EPF Account 2 Hardship Withdrawal",
                "monthly_amount": 0.0,
                "note": "One-time withdrawal for financial hardship (Account 2 balance ×30%)",
            },
        ],
        "survival_actions": [
            {
                "action": "Claim SOCSO EIS immediately",
                "monthly_impact": 1200.0,
                "type": "income",
                "description": "File within 60 days of termination for ~RM1200/mo",
            },
            {
                "action": "Cancel BNPL & credit card non-essentials",
                "monthly_impact": 400.0,
                "type": "expense_cut",
                "description": "Pause subscriptions and BNPL plans to reduce burn",
            },
            {
                "action": "Gig economy bridging income",
                "monthly_impact": 900.0,
                "type": "income",
                "description": "GrabFood, Lalamove, freelancing — RM30/day typical",
            },
            {
                "action": "Negotiate rent deferral with landlord",
                "monthly_impact": 700.0,
                "type": "expense_cut",
                "description": "Many landlords accommodate 1-2 month deferral with notice",
            },
        ],
    },

    "disaster": {
        "label": "Natural Disaster",
        "icon": "thunderstorm",
        "description": "Home damage + partial income disruption",
        "risk_probability": "Moderate — ~15% of peninsular Malaysia flood-prone (NADMA 2023)",
        "insurance_gap_note": "Houseowner insurance + flood rider costs ~RM500–800/year",
        "phases": [
            {
                "id": "emergency",
                "label": "Emergency",
                "month_start": 1,
                "month_end": 1,
                "income_reduction": 0.6,
                "extra_monthly_cost": 5000.0,  # emergency repairs, evacuation, replacement items
                "flexible_multiplier": 0.5,
                "description": "Evacuation + emergency repairs + replacement essentials",
            },
            {
                "id": "rebuilding",
                "label": "Rebuilding",
                "month_start": 2,
                "month_end": 3,
                "income_reduction": 0.2,
                "extra_monthly_cost": 1500.0,  # ongoing repairs, temporary accommodation
                "flexible_multiplier": 0.6,
                "description": "Contractor work + temporary housing costs",
            },
            {
                "id": "stabilisation",
                "label": "Stabilisation",
                "month_start": 4,
                "month_end": 9999,
                "income_reduction": 0.0,
                "extra_monthly_cost": 400.0,  # finishing touches, replaced items
                "flexible_multiplier": 0.8,
                "description": "Near-normal life, final repair costs",
            },
        ],
        "safety_nets": [
            {
                "name": "BENCANA Government Relief Fund",
                "monthly_amount": 500.0,
                "note": "One-off or monthly relief; varies by state — check JKM",
            },
            {
                "name": "Bank Negara Flood Moratorium",
                "monthly_amount": 600.0,
                "note": "Loan payment holiday up to 6 months; check your bank's scheme",
            },
        ],
        "survival_actions": [
            {
                "action": "Register with Jabatan Kebajikan Masyarakat (JKM)",
                "monthly_impact": 500.0,
                "type": "income",
                "description": "Access government disaster relief and household grants",
            },
            {
                "action": "Apply for bank moratorium on loans",
                "monthly_impact": 600.0,
                "type": "expense_cut",
                "description": "Pause car/home loan payments during rebuilding period",
            },
            {
                "action": "Community mutual aid & crowdfunding",
                "monthly_impact": 800.0,
                "type": "income",
                "description": "GoFundMe / Kitakita — Malaysians are generous in disasters",
            },
        ],
    },

    "war": {
        "label": "Civil Unrest / War",
        "icon": "shield",
        "description": "Evacuation costs + severe supply chain disruption",
        "risk_probability": "Low but non-zero — regional instability risk; historically rare in Malaysia",
        "insurance_gap_note": "War exclusions standard in most policies — requires specialist coverage",
        "phases": [
            {
                "id": "evacuation",
                "label": "Evacuation",
                "month_start": 1,
                "month_end": 1,
                "income_reduction": 1.0,
                "extra_monthly_cost": 6000.0,  # emergency relocation, transportation
                "flexible_multiplier": 1.5,     # panic buying, surge pricing
                "description": "Emergency relocation + panic-buying surge prices",
            },
            {
                "id": "displacement",
                "label": "Displacement",
                "month_start": 2,
                "month_end": 3,
                "income_reduction": 0.9,
                "extra_monthly_cost": 2500.0,  # temporary shelter, food insecurity
                "flexible_multiplier": 1.2,
                "description": "Temporary shelter + rationed essential supplies",
            },
            {
                "id": "adaptation",
                "label": "Adaptation",
                "month_start": 4,
                "month_end": 9999,
                "income_reduction": 0.7,
                "extra_monthly_cost": 1200.0,
                "flexible_multiplier": 0.9,
                "description": "Survival mode — some income channels resume",
            },
        ],
        "safety_nets": [
            {
                "name": "UNHCR / NGO Emergency Aid",
                "monthly_amount": 400.0,
                "note": "International aid agencies if displacement is severe",
            },
            {
                "name": "EPF Full Withdrawal (Age 50+) or Partial",
                "monthly_amount": 0.0,
                "note": "Extreme circumstances may qualify for special EPF withdrawal",
            },
        ],
        "survival_actions": [
            {
                "action": "Diversify savings to multi-currency / digital assets",
                "monthly_impact": 0.0,
                "type": "preparation",
                "description": "Pre-event: hold USD or gold equivalent to 2 months expenses",
            },
            {
                "action": "Maintain 6-month cash emergency fund off-grid",
                "monthly_impact": 0.0,
                "type": "preparation",
                "description": "Physical cash + digital wallet diversification",
            },
            {
                "action": "Register with Malaysian embassy if abroad",
                "monthly_impact": 200.0,
                "type": "income",
                "description": "Consular emergency assistance may be available",
            },
        ],
    },
}


async def _generate_scenario_config(profile, scenario: str) -> dict:
    """
    Ask Gemini to generate a personalised shock scenario config calibrated to this
    user's real financial numbers. Falls back to _SCENARIO_CONFIGS if AI fails.
    """
    base = _SCENARIO_CONFIGS.get(scenario, _SCENARIO_CONFIGS["job_loss"])

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        try:
            from app.core.config import Settings
            api_key = Settings().GEMINI_API_KEY
        except Exception:
            pass
    if not api_key:
        return base

    scenario_label = {
        "illness": "Medical emergency / hospitalisation",
        "job_loss": "Sudden job loss / retrenchment",
        "disaster": "Natural disaster (flood / fire)",
        "war": "Civil unrest / war / geopolitical crisis",
    }.get(scenario, scenario)

    prompt = f"""You are a Malaysian personal finance risk analyst.
Generate a realistic, personalised financial shock scenario config for this user facing: {scenario_label}.

User financial profile:
- Monthly income: RM{profile.monthly_income:.2f}
- Fixed expenses: RM{profile.fixed_expenses:.2f} (rent, loan, insurance)
- Flexible expenses: RM{profile.flexible_expenses:.2f} (food, transport, entertainment)
- Savings balance: RM{profile.savings_balance:.2f}
- BNPL debt: RM{profile.bnpl_debt:.2f}
- Credit card debt: RM{profile.credit_card_debt:.2f}
- Dependents: {profile.dependents}
- Risk profile: {profile.risk_profile}
- Emergency fund coverage: {profile.emergency_fund_months:.1f} months

Generate a JSON config with EXACTLY these fields, all RM amounts calibrated to this user:
{{
  "label": "Short 2-3 word scenario name",
  "icon": "one of: medkit | briefcase | thunderstorm | shield",
  "description": "1 sentence describing the shock",
  "risk_probability": "1 sentence on likelihood (Malaysian context, cite a stat)",
  "insurance_gap_note": "1 sentence on relevant gap coverage + estimated monthly cost",
  "phases": [
    {{
      "id": "snake_case_id",
      "label": "Phase Name",
      "month_start": 1,
      "month_end": 2,
      "income_reduction": 0.7,
      "extra_monthly_cost": 3500.0,
      "flexible_multiplier": 0.4,
      "description": "What happens in this phase"
    }}
  ],
  "safety_nets": [
    {{
      "name": "Scheme / benefit name",
      "monthly_amount": 800.0,
      "note": "Eligibility and how to access it"
    }}
  ],
  "survival_actions": [
    {{
      "action": "Concrete action name",
      "monthly_impact": 800.0,
      "type": "income | expense_cut | preparation",
      "description": "1 sentence — how to do it today"
    }}
  ]
}}

Rules:
- Phases must span months 1 through at least 6; set month_end=9999 for the last (open-ended) phase
- income_reduction: 0.0 = no loss, 1.0 = total income loss
- extra_monthly_cost: realistic RM amounts for Malaysian context
- flexible_multiplier: 0.3 = survival mode, 1.0 = normal, 1.5 = panic/surge pricing
- Include 2-3 phases, 2-3 safety nets (SOCSO / EPF / JKM / BPN relevant to this scenario), 3-5 survival actions
- Calibrate all RM amounts to this user's income of RM{profile.monthly_income:.0f}/mo and savings of RM{profile.savings_balance:.0f}
- Return ONLY valid JSON — no markdown fences, no explanation"""

    try:
        client = _genai.Client(api_key=api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash", contents=prompt
        )
        clean = response.text.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        generated = json.loads(clean)

        required = {"label", "icon", "description", "risk_probability",
                    "insurance_gap_note", "phases", "safety_nets", "survival_actions"}
        if not required.issubset(generated.keys()):
            print(f"[shock_tools] AI config missing keys for '{scenario}', using fallback")
            return base
        if len(generated["phases"]) < 2 or len(generated["survival_actions"]) < 2:
            print(f"[shock_tools] AI config too sparse for '{scenario}', using fallback")
            return base

        return generated

    except Exception as e:
        print(f"[shock_tools] Gemini scenario generation failed for '{scenario}': {e}")
        return base


def _run_phase_simulation(profile, cfg: dict, months: int) -> tuple[list, float, float]:
    """
    Run a phased month-by-month simulation.
    Returns (timeline, avg_monthly_burn, avg_reduced_income).
    """
    timeline = []
    savings = profile.savings_balance
    total_burn = 0.0
    total_income = 0.0

    for m in range(1, months + 1):
        # Determine which phase applies
        phase = cfg["phases"][-1]  # default to last phase
        for ph in cfg["phases"]:
            if ph["month_start"] <= m <= ph["month_end"]:
                phase = ph
                break

        reduced_income = profile.monthly_income * (1 - phase["income_reduction"])
        shock_expenses = profile.fixed_expenses + phase["extra_monthly_cost"]
        crisis_flexible = profile.flexible_expenses * phase["flexible_multiplier"]
        monthly_burn = shock_expenses + crisis_flexible
        monthly_net = reduced_income - monthly_burn

        total_burn += monthly_burn
        total_income += reduced_income

        savings += monthly_net

        if savings <= 0:
            timeline.append({
                "month": m,
                "savings_remaining": 0.0,
                "status": "depleted",
                "label": f"Month {m}",
                "phase": phase["id"],
            })
            for r in range(m + 1, months + 1):
                ph2 = cfg["phases"][-1]
                for ph in cfg["phases"]:
                    if ph["month_start"] <= r <= ph["month_end"]:
                        ph2 = ph
                        break
                timeline.append({
                    "month": r,
                    "savings_remaining": 0.0,
                    "status": "depleted",
                    "label": f"Month {r}",
                    "phase": ph2["id"],
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
                "phase": phase["id"],
            })

    avg_burn = round(total_burn / months, 0) if months > 0 else 0
    avg_income = round(total_income / months, 0) if months > 0 else 0
    return timeline, avg_burn, avg_income


def _calculate_safety_nets(profile, cfg: dict) -> list:
    """Compute safety net amounts, injecting dynamic EPF calculations."""
    nets = []
    epf_account2_estimate = round(profile.savings_balance * 0.3, 0)  # rough proxy
    for net in cfg["safety_nets"]:
        amt = net["monthly_amount"]
        if amt == 0.0 and "EPF" in net["name"]:
            amt = epf_account2_estimate
        nets.append({
            "name": net["name"],
            "available": amt,
            "note": net["note"],
        })
    return nets


def _compute_survival_with_actions(profile, cfg: dict, months: int) -> tuple[int | None, int | None]:
    """
    Return (depletes_without_actions, depletes_with_actions).
    With-actions = apply all income-type survival actions to the base simulation.
    """
    action_income_boost = sum(
        a["monthly_impact"] for a in cfg["survival_actions"] if a["type"] == "income"
    )
    action_expense_cut = sum(
        a["monthly_impact"] for a in cfg["survival_actions"] if a["type"] == "expense_cut"
    )

    timeline_base, _, _ = _run_phase_simulation(profile, cfg, months)
    depletes_base = next((t["month"] for t in timeline_base if t["status"] == "depleted"), None)

    # Build a boosted profile
    from dataclasses import replace as dc_replace
    boosted_income = profile.monthly_income  # income actions add on top of reduced income

    class BoostedProfile:
        def __init__(self):
            self.monthly_income = profile.monthly_income + action_income_boost
            self.fixed_expenses = max(0.0, profile.fixed_expenses - action_expense_cut * 0.5)
            self.flexible_expenses = profile.flexible_expenses * 0.5
            self.savings_balance = profile.savings_balance
            self.total_monthly_expenses = self.fixed_expenses + self.flexible_expenses
            self.total_debt = profile.total_debt

    boosted = BoostedProfile()
    timeline_boosted, _, _ = _run_phase_simulation(boosted, cfg, months)
    depletes_boosted = next((t["month"] for t in timeline_boosted if t["status"] == "depleted"), None)

    return depletes_base, depletes_boosted


@tool
async def simulate_shock(scenario: str, months: int, user_id: str) -> str:
    """
    Run a realistic multi-phase financial shock simulation for the user.

    scenario: one of 'illness', 'job_loss', 'disaster', 'war'
    months: simulation duration in months (1-12 recommended)
    user_id: the user to simulate for

    Returns a rich JSON payload with:
    - Month-by-month savings timeline with phase annotations
    - Phase breakdown (acute / sustained / recovery)
    - Safety nets available (SOCSO, EPF, government relief)
    - Survival actions with RM impact estimates
    - Survival comparison: without vs with actions taken
    - Risk probability and insurance gap
    """
    profile = await _ds.get_profile(user_id)
    cfg = await _generate_scenario_config(profile, scenario)

    timeline, avg_burn, avg_income = _run_phase_simulation(profile, cfg, months)

    depletes_at = next((t["month"] for t in timeline if t["status"] == "depleted"), None)
    survives = depletes_at is None

    safety_nets = _calculate_safety_nets(profile, cfg)

    # Survival actions enriched with impact labels
    enriched_actions = []
    for a in cfg["survival_actions"]:
        if a["monthly_impact"] > 0:
            extra_months = round(a["monthly_impact"] / max(avg_burn - avg_income, 1), 1)
            impact_label = f"+{extra_months} months runway"
        else:
            impact_label = "Pre-event preparation"
        enriched_actions.append({
            "action": a["action"],
            "monthly_impact": a["monthly_impact"],
            "type": a["type"],
            "impact_label": impact_label,
            "description": a["description"],
        })

    # Compare survival with vs without taking actions
    depletes_without, depletes_with = _compute_survival_with_actions(profile, cfg, months)

    # Phase summary for the card header
    phases_summary = [
        {
            "id": ph["id"],
            "label": ph["label"],
            "month_start": ph["month_start"],
            "month_end": ph["month_end"] if ph["month_end"] != 9999 else months,
            "description": ph["description"],
        }
        for ph in cfg["phases"]
        if ph["month_start"] <= months
    ]

    data = {
        "card": "shock",
        "scenario": scenario,
        "scenario_label": cfg["label"],
        "scenario_icon": cfg["icon"],
        "scenario_description": cfg["description"],
        "months_simulated": months,
        "monthly_burn": avg_burn,
        "reduced_income": avg_income,
        "starting_savings": round(profile.savings_balance, 0),
        "timeline": timeline,
        "depletes_at_month": depletes_at,
        "survives": survives,
        # ── New rich fields ──────────────────────────────────────────────
        "phases": phases_summary,
        "safety_nets": safety_nets,
        "survival_actions": enriched_actions,
        "survival_comparison": {
            "without_actions": depletes_without,
            "with_actions": depletes_with,
            "gain_months": (
                (depletes_without - depletes_with)
                if depletes_without is not None and depletes_with is not None
                else None
            ),
        },
        "risk_probability": cfg["risk_probability"],
        "insurance_gap_note": cfg["insurance_gap_note"],
    }
    return json.dumps(data)


@tool
async def stress_test_scenarios(months: int, user_id: str) -> str:
    """
    Run all four shock scenarios simultaneously and return a comparative summary.
    Use this to show the user which risks are most dangerous for their specific profile.

    months: duration to simulate for each scenario (3-6 recommended)
    user_id: the user to stress-test

    Returns a JSON summary with survival rates, fastest depletion, and safest scenario.
    """
    profile = await _ds.get_profile(user_id)

    # Generate all 4 scenario configs in parallel via Gemini
    scenario_ids = list(_SCENARIO_CONFIGS.keys())
    configs = await asyncio.gather(
        *[_generate_scenario_config(profile, sid) for sid in scenario_ids]
    )
    results = []

    for scenario_id, cfg in zip(scenario_ids, configs):
        timeline, avg_burn, avg_income = _run_phase_simulation(profile, cfg, months)
        depletes_at = next((t["month"] for t in timeline if t["status"] == "depleted"), None)
        survives = depletes_at is None

        results.append({
            "scenario": scenario_id,
            "label": cfg["label"],
            "icon": cfg["icon"],
            "monthly_burn": avg_burn,
            "depletes_at_month": depletes_at,
            "survives": survives,
            "risk_probability": cfg["risk_probability"],
        })

    # Sort by severity (depletes soonest = most dangerous)
    def severity_key(r):
        return r["depletes_at_month"] if r["depletes_at_month"] is not None else 9999

    results.sort(key=severity_key)

    most_dangerous = results[0]
    safest = results[-1]
    n_survive = sum(1 for r in results if r["survives"])

    return json.dumps({
        "card": "stress_test",
        "months_simulated": months,
        "starting_savings": round(profile.savings_balance, 0),
        "scenarios": results,
        "most_dangerous": most_dangerous["scenario"],
        "safest": safest["scenario"],
        "survival_count": n_survive,
        "verdict": (
            f"You survive {n_survive}/4 scenarios over {months} months. "
            f"Most dangerous: {most_dangerous['label']} (depletes Month {most_dangerous['depletes_at_month'] or 'N/A'}). "
            f"Safest: {safest['label']}."
        ),
    })
