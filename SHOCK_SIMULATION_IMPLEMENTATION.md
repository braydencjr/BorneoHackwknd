# Shock Scenario Simulation — Implementation Plan
## Features 5 & 6: Shock Simulation + Contingency Fund Guidance

---

## Architecture Recap

```
[ Tavily API ]  ──────────►  [ Regional Risk Collector ]
                                        │
                                        ▼
[ User Transactions DB ] ──►  [ Vulnerability Profiler ]
                                        │
                                        ▼
                            [ Shock Simulation Engine ]
                                        │
                              ┌─────────┴────────────┐
                              ▼                      ▼
                   [ Impact Calculator ]    [ Gemini Narrative Generator ]
                              │                      │
                              └──────────┬───────────┘
                                         ▼
                              [ Shock Report JSON ]
                                         │
                                         ▼
                       [ contingencypage.tsx — white card area ]
```

---

## Existing Assets to Reuse

| Asset | File | Reused In |
|---|---|---|
| `Transaction` ORM model | `app/models/transactions.py` | All DB queries — no changes needed |
| `User` ORM model | `app/models/user.py` | Auth dependency — no changes needed |
| `_build_spending_summary()` | `app/routes/summary.py` | Copy into contingency service |
| `get_current_user` dependency | `app/dependencies.py` | Protect all new routes |
| `get_db` dependency | `app/core/database.py` | All new routes |
| `Base` declarative base | `app/core/database.py` | New ORM models inherit from this |
| `create_tables()` lifespan | `app/main.py` | Auto-creates new tables on startup |
| `genai` Gemini pattern | `app/services/receipt_ai.py` | Copy async executor pattern |
| Tabs UI skeleton | `frontend/app/(tabs)/contingencypage.tsx` | Wire to new API |

---

## Phase Overview

| Phase | What Gets Built | Deliverable |
|---|---|---|
| **Phase 1** | DB models + migrations | 2 new tables in MySQL |
| **Phase 2** | Vulnerability Profiler | Python service reading existing transactions |
| **Phase 3** | Regional Risk Collector | Tavily integration + caching |
| **Phase 4** | Shock Simulation Engine | Impact calculator |
| **Phase 5** | Gemini Narrative Generator | AI story per shock tab |
| **Phase 6** | Contingency Fund Calculator | Saving plan logic |
| **Phase 7** | Backend Routes | REST API endpoints |
| **Phase 8** | Frontend — Contingency Page | Wire white card to real data |
| **Phase 9** | Frontend — Resilience Page | Wire progress/milestones |
| **Phase 10** | `.env` + config additions | Tavily key, refresh interval |

---

## Phase 1 — Database Models

### Files to Create
- `backend/app/models/regional_risk.py`
- `backend/app/models/contingency_plan.py`

### Files to Edit
- `backend/app/models/__init__.py` — import new models so `create_tables()` sees them
- `backend/app/main.py` — nothing to change, `create_tables()` already auto-runs on startup

---

### Model 1: `RegionalRiskCache`

**Table name:** `regional_risk_cache`

**Purpose:** Stores parsed Tavily results. Shared across all users. Refreshed every 24h.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | auto-increment |
| `query_type` | String(50) | `"illness"`, `"flood"`, `"economic"`, `"war"` |
| `country` | String(100) | e.g. `"Malaysia"`, `"ASEAN"` |
| `event_title` | String(500) | Tavily result title |
| `event_summary` | Text | Tavily result content snippet |
| `severity` | int | 1–5, extracted by Gemini |
| `financial_impact_category` | String(100) | `"medical"`, `"income"`, `"property"`, `"food"` |
| `time_horizon` | String(50) | `"immediate"`, `"3_months"`, `"6_months"` |
| `source_url` | String(1000) | Original article URL |
| `fetched_at` | DateTime | When Tavily returned this — TTL check uses this |

---

### Model 2: `ContingencyPlan`

**Table name:** `contingency_plans`

**Purpose:** One row per user. Stores the computed personalised plan. Recalculated on demand or after new transactions.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | auto-increment |
| `user_id` | int FK → `users.id` | UNIQUE — one plan per user |
| `target_months` | Float | Computed months of expenses to save (3.0–12.0) |
| `target_amount` | Float | `target_months × avg_monthly_expense` in RM |
| `current_progress` | Float | User-reported or 0.0 default |
| `monthly_savings_target` | Float | Recommended RM/month |
| `weekly_savings_target` | Float | `monthly / 4.33` |
| `active_indicators` | JSON | List of fired indicator names e.g. `["health_high", "single_income"]` |
| `regional_risk_level` | String(20) | `"low"`, `"medium"`, `"high"` derived from Tavily severity |
| `avg_monthly_expense` | Float | Cached from last calculation |
| `surplus` | Float | `income - expenses` at last calculation |
| `last_calculated_at` | DateTime | Freshness — recalculate if > 24h old |

---

## Phase 2 — Vulnerability Profiler

### File to Create
- `backend/app/services/vulnerability_profiler.py`

### Reads From (existing DB)
- `transactions` table — via raw SQLAlchemy `select()`, same pattern as `_build_spending_summary()` in `summary.py`
- No new queries needed beyond what summary.py already demonstrates

### Logic — 6 Indicators

Each indicator function takes the aggregated summary dict (same shape as `_build_spending_summary()` output) and returns a score `0.0–1.0` plus a human-readable label.

---

#### Indicator 1: `health_exposure`
```
Input:  by_category dict
Rule:   Health category spend / total outcome > 0.10
Score:  min((health_spend / outcome) / 0.10, 1.0)
Label:  "health_exposure_high"
Extra months added to fund target: 2.0
```

#### Indicator 2: `single_income_source`
```
Input:  list of income transactions
Rule:   Only 1 distinct income transaction per month AND variance < 10%
Score:  1.0 if true, 0.0 if multiple income sources detected
Label:  "single_income_source"
Extra months: 2.0
```

#### Indicator 3: `high_fixed_cost_ratio`
```
Input:  by_category dict
Fixed categories: ["Utilities", "Health"] (proxy — adjust as categories grow)
Rule:   fixed_costs / outcome > 0.40
Score:  min((fixed_ratio / 0.40), 1.0)
Label:  "high_fixed_costs"
Extra months: 1.0
```

#### Indicator 4: `near_zero_surplus`
```
Input:  income, outcome
Rule:   (income - outcome) / income < 0.05
Score:  1.0 - ((income - outcome) / income / 0.05)  clamped 0–1
Label:  "near_zero_surplus"
Extra months: 0  (changes saving plan tier, not fund size)
Effect: Triggers micro-savings plan instead of lump-sum plan
```

#### Indicator 5: `irregular_income`
```
Input:  monthly income amounts (last 3 months from transactions)
Rule:   standard deviation of income > 30% of mean income
Score:  min(std_dev / (0.30 * mean), 1.0)
Label:  "irregular_income"
Extra months: 2.0
```

#### Indicator 6: `regional_risk_overlay`
```
Input:  max severity from RegionalRiskCache for matching shock_type
Rule:   severity >= 3
Score:  (severity - 2) / 3  → maps 3→0.33, 4→0.67, 5→1.0
Label:  "regional_risk_{shock_type}"
Extra months: score * 1.5  (max +1.5 months)
```

### Output Shape
```python
{
    "indicators": [
        {"name": "health_exposure_high", "score": 0.8, "extra_months": 2.0},
        {"name": "single_income_source", "score": 1.0, "extra_months": 2.0},
    ],
    "total_extra_months": 4.0,
    "income": 3500.0,
    "outcome": 2800.0,
    "surplus": 700.0,
    "avg_monthly_expense": 2800.0,
    "by_category": {"Food": 800, "Health": 450, ...},
    "transaction_count": 24,
}
```

---

## Phase 3 — Regional Risk Collector (Tavily)

### Files to Create
- `backend/app/services/regional_risk_service.py`

### Files to Edit
- `backend/app/core/config.py` — add `TAVILY_API_KEY: str | None = None`
- `backend/.env` — add `TAVILY_API_KEY=your_key_here`
- `backend/requirements.txt` — add `tavily-python>=0.3.0`

### Install
```
pip install tavily-python
```

### Query Map (one query per shock type)

| Shock Type Tab | Tavily Query | financial_impact_category |
|---|---|---|
| `illness` | `"Malaysia disease outbreak health crisis 2026"` | `"medical"` |
| `job_loss` | `"Malaysia economic recession unemployment layoffs 2026"` | `"income"` |
| `disaster` | `"Southeast Asia ASEAN flood disaster 2026"` | `"property"` |
| `war` | `"ASEAN political instability conflict currency 2026"` | `"income"` |

### Pipeline per query
1. Call `tavily_client.search(query, max_results=5)`
2. For each result, send `title + content` to Gemini with structured extraction prompt
3. Gemini returns: `{ severity: int, financial_impact_category: str, time_horizon: str }`
4. Write row to `regional_risk_cache` table with `fetched_at = now()`

### Cache Strategy
- Before querying Tavily, check DB: `SELECT * FROM regional_risk_cache WHERE query_type = ? AND fetched_at > NOW() - INTERVAL 24 HOUR`
- If rows exist → return cached, skip Tavily
- If no rows or all expired → run Tavily + Gemini → write to DB → return fresh data

### Severity Extraction Prompt (to Gemini)
```
Given this news article about a potential crisis event in Southeast Asia/Malaysia, 
extract ONLY valid JSON:
{
  "severity": <1-5 integer, 5 = catastrophic>,
  "financial_impact_category": <"medical"|"income"|"property"|"food"|"other">,
  "time_horizon": <"immediate"|"3_months"|"6_months">
}
Article: {title}. {content}
```

---

## Phase 4 — Shock Simulation Engine (Impact Calculator)

### File to Create
- `backend/app/services/shock_simulation_service.py`

### Reads From (existing DB)
- Uses vulnerability profiler output (Phase 2) — already has all aggregated data
- Uses regional risk cache (Phase 3)
- No additional DB queries in this file

### Shock Templates

Each template defines multipliers applied to the user's **real RM figures**.

#### Template: `illness`
```python
ILLNESS = {
    "income_multipliers":   [1.0, 0.7, 0.5],   # months 1, 2, 3 (salary may stop)
    "expense_multipliers":  {
        "Health":      4.0,   # medical bills spike
        "Transport":   1.3,   # hospital trips
        "Food":        1.1,   # delivery, hospital food
        "default":     1.0,   # everything else unchanged
    },
    "one_time_costs":       {"min": 2000, "max": 15000},  # RM hospitalisation range
    "duration_options":     [1, 3, 6],   # months
}
```

#### Template: `job_loss`
```python
JOB_LOSS = {
    "income_multipliers":   [0.0, 0.0, 0.0],   # total income loss
    "expense_multipliers":  {
        "Entertainment": 0.2,  # user cuts discretionary
        "Shopping":      0.2,
        "default":       1.0,  # fixed costs remain
    },
    "one_time_costs":       {"min": 0, "max": 0},
    "duration_options":     [1, 3, 6],
}
```

#### Template: `disaster`
```python
DISASTER = {
    "income_multipliers":   [0.7, 0.8, 0.9],   # partial disruption
    "expense_multipliers":  {
        "Food":        1.5,
        "Transport":   1.3,
        "default":     1.0,
    },
    "one_time_costs":       {"min": 5000, "max": 20000},  # property repair
    "duration_options":     [1, 3, 6],
}
```

#### Template: `war`
```python
WAR = {
    "income_multipliers":   [0.8, 0.7, 0.6],   # currency devaluation
    "expense_multipliers":  {
        "default":     1.35,   # inflation multiplier on all categories
    },
    "one_time_costs":       {"min": 3000, "max": 10000},  # relocation
    "duration_options":     [1, 3],
}
```

### Calculation Steps
1. Take user's `avg_monthly_expense` and `by_category` breakdown from vulnerability profiler
2. Apply `expense_multipliers` per category → `projected_expense[month]`
3. Apply `income_multipliers` to `avg_monthly_income` → `projected_income[month]`
4. `deficit[month] = projected_income[month] - projected_expense[month]`
5. `total_shortfall = sum(deficit for month where deficit < 0)`
6. `months_until_broke = current_contingency_fund / avg_monthly_deficit` (if fund exists)
7. Add regional risk severity modifier: multiply one-time cost estimate by `(1 + severity * 0.1)`

### Output Shape
```python
{
    "shock_type": "illness",
    "severity_label": "moderate",
    "duration_months": 3,
    "baseline_monthly_expense": 2800.0,
    "baseline_monthly_income": 3500.0,
    "monthly_projected": [
        {"month": 1, "income": 3500.0, "expense": 4200.0, "deficit": -700.0},
        {"month": 2, "income": 2450.0, "expense": 3900.0, "deficit": -1450.0},
        {"month": 3, "income": 1750.0, "expense": 3800.0, "deficit": -2050.0},
    ],
    "total_shortfall": 4200.0,
    "one_time_cost_estimate": 8500.0,
    "grand_total_impact": 12700.0,
    "months_until_broke": 1.4,
    "regional_severity": 3,
    "trigger_indicators": ["health_exposure_high", "near_zero_surplus"],
}
```

---

## Phase 5 — Gemini Narrative Generator

### File to Create
- `backend/app/services/shock_narrative_service.py`

### Pattern
Same async executor pattern as `receipt_ai.py` and `suggestion_ai.py`.

### Prompt Template
```
You are a personal finance advisor in Malaysia. Write a 3-paragraph financial story 
in second person ("you") for a user facing [shock_type] for [duration] months.

Their baseline:
- Monthly income: RM[income]
- Monthly expenses: RM[expense]
- Biggest spending category: [top_category] (RM[top_amount])

What will happen:
- Month 1: projected deficit of RM[deficit_1]
- Month 2: projected deficit of RM[deficit_2]
- Month 3: projected deficit of RM[deficit_3]
- Estimated one-time cost: RM[one_time]

Paragraph 1: Describe month 1 — what it feels like financially, specific to their numbers.
Paragraph 2: Describe the situation by month 3 if nothing changes. Use RM amounts.
Paragraph 3: One specific, actionable thing they can do TODAY to reduce the impact.

Be empathetic, not alarming. Do not use bullet points. Use their real RM numbers.
Max 150 words total.
```

### Output Shape
```python
{
    "narrative": "In the first month of a serious illness, you would feel...",
    "action_today": "Open your bank app and move RM200 into a separate savings account today.",
}
```

---

## Phase 6 — Contingency Fund Calculator

### File to Create
- `backend/app/services/contingency_service.py`

### Reads/Writes (DB)
- **Reads:** `transactions` table (via existing `transaction_repository` pattern)
- **Reads:** `regional_risk_cache` table
- **Writes:** `contingency_plans` table (upsert — create or update)

### Fund Target Formula

```
base_months = 3.0
extra_months = sum(indicator.extra_months * indicator.score for each indicator)
target_months = min(base_months + extra_months, 12.0)
target_amount = target_months × avg_monthly_expense
```

### Saving Plan Tiers

Determined by `near_zero_surplus` indicator score:

**Normal tier** (surplus ≥ 5% of income):
```
monthly = max(surplus * 0.20, 50.0)
weekly  = monthly / 4.33
```

**Micro-savings tier** (near_zero_surplus triggered):
```
monthly = max(surplus * 0.10, 20.0)   ← 10% of tiny surplus
weekly  = monthly / 4.33
```

**One-time boost** (if income spike detected — any month where income > avg_income * 1.3):
```
one_time_suggestion = (spike_amount - avg_income) * 0.50
```

### Upsert Logic
```
1. Query contingency_plans WHERE user_id = ?
2. If exists AND last_calculated_at > NOW() - 24h → return cached plan
3. Else → recalculate → UPDATE or INSERT
```

### Output Shape
```python
{
    "target_months": 7.0,
    "target_amount": 19600.0,
    "current_progress": 0.0,
    "progress_percentage": 0.0,
    "monthly_savings_target": 140.0,
    "weekly_savings_target": 32.33,
    "one_time_suggestion": 350.0,
    "milestone_level": "starter",   # starter|stable|resilient|ready
    "active_indicators": [
        {"name": "health_exposure_high", "score": 0.8, "extra_months": 2.0},
        {"name": "single_income_source", "score": 1.0, "extra_months": 2.0},
    ],
    "regional_risk_level": "medium",
    "avg_monthly_expense": 2800.0,
    "surplus": 700.0,
    "last_calculated_at": "2026-03-09T10:00:00",
}
```

---

## Phase 7 — Backend Routes

### File to Create
- `backend/app/routes/contingency.py`

### File to Edit
- `backend/app/main.py` — add `from app.routes import contingency` and `app.include_router(...)`

### Endpoints

#### `GET /api/v1/contingency/`
- Auth: required
- Action: Returns the user's contingency plan (recalculates if stale)
- Response: ContingencyPlan shape (Phase 6 output)
- DB reads: `transactions`, `regional_risk_cache`, `contingency_plans`
- DB writes: `contingency_plans` (upsert)

#### `GET /api/v1/contingency/shock/{shock_type}`
- Auth: required
- Path param: `shock_type` — one of `illness | job_loss | disaster | war`
- Query params: `duration_months` (int, default 3), `severity` (str, default `"moderate"`)
- Action: Run full simulation → generate Gemini narrative → return shock report
- DB reads: `transactions`, `regional_risk_cache`
- DB writes: none (simulation is stateless)
- Response: Shock simulation output (Phase 4) + narrative (Phase 5)

#### `GET /api/v1/contingency/regional-risks`
- Auth: required
- Action: Returns all current cached Tavily risk events
- DB reads: `regional_risk_cache` WHERE `fetched_at > NOW() - 24h`
- Response: List of risk events grouped by `query_type`

#### `PATCH /api/v1/contingency/progress`
- Auth: required
- Body: `{ "current_progress": float }`
- Action: User manually updates how much they've saved toward the fund
- DB writes: UPDATE `contingency_plans.current_progress`

---

## Phase 8 — Frontend: Contingency Page

### File to Edit
- `frontend/app/(tabs)/contingencypage.tsx`

### What Changes
The page currently has:
1. Static white card area — replace with shock simulation data per tab
2. Static `RM1000.00` target — replace with API response `target_amount`
3. Static 60% progress bar — replace with `(current_progress / target_amount) * 100`
4. Static `RM 300/month` plan rows — replace with `monthly_savings_target`, `weekly_savings_target`

### API Calls Needed
1. On mount: `GET /api/v1/contingency/` → populate target, progress bar, saving plan
2. On tab switch: `GET /api/v1/contingency/shock/{tab_shock_type}` → populate white card narrative
3. Tab key → shock_type mapping:
   ```
   A (Illness)        → "illness"
   B (Job Loss)       → "job_loss"
   C (Nature Disaster) → "disaster"
   D (War)            → "war"
   ```

### White Card Content Per Tab
```
┌─────────────────────────────────┐
│  🏥  Illness Scenario           │
│  Duration: 3 months             │
│  Total Impact: RM 12,700        │
│                                 │
│  [Narrative paragraph 1]        │
│  [Narrative paragraph 2]        │
│                                 │
│  💡 Action Today:               │
│  [action_today text]            │
│                                 │
│  Monthly deficit:  -RM 1,400    │
│  Runway remaining: 1.4 months   │
└─────────────────────────────────┘
```

### Loading State
Show a skeleton/spinner in the white card while the shock API call is in flight (Gemini takes 2–5s).

---

## Phase 9 — Frontend: Resilience Page

### File to Edit
- `frontend/app/(tabs)/resiliencepage.tsx`

### What Changes
Replace all 4 static cards with live data from `GET /api/v1/contingency/`.

### Milestone Levels
```
starter    → current_progress >= 0            (just starting)
stable     → current_progress >= target * 0.33  (1 month covered)
resilient  → current_progress >= target * 0.66  (2/3 covered)
ready      → current_progress >= target          (fully funded)
```

### Card 1 — Emergency Fund Status
```
Icon: wallet
Title: "Emergency Fund"
Body:  "You have saved RM[current_progress] of your RM[target_amount] goal 
        ([progress_percentage]% complete — [target_months] months of expenses)"
```

### Card 2 — Top Risk Indicator
```
Icon: alert-circle
Title: "Your Biggest Risk Factor"
Body:  First item from active_indicators → human readable label
```

### Card 3 — Saving Pace
```
Icon: trending-up
Title: "Saving RM[monthly_savings_target]/month"
Body:  "At this pace you'll reach your goal in 
        [ceil(remaining / monthly_savings_target)] months."
```

### Card 4 — Regional Risk Level
```
Icon: shield-checkmark  (green) | warning (orange) | alert (red)
Title: "Regional Risk: [regional_risk_level]"
Body:  Show top Tavily event title if medium/high, reassurance if low
```

---

## Phase 10 — Config & Environment

### File to Edit: `backend/app/core/config.py`
Add:
```python
TAVILY_API_KEY: str | None = None
RISK_CACHE_TTL_HOURS: int = 24
```

### File to Edit: `backend/.env`
Add:
```
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxx
```

### File to Edit: `backend/requirements.txt`
Add:
```
tavily-python>=0.3.0
```

### Get Tavily API Key
1. Go to https://app.tavily.com
2. Sign up (free tier: 1,000 searches/month — sufficient for a hackathon)
3. Copy API key → paste into `.env`

---

## Implementation Order (Recommended)

```
Phase 1  →  Phase 2  →  Phase 6  →  Phase 7 (GET / only)  →  Phase 8 (fund section only)
                                                                         ↓
Phase 3  →  Phase 4  →  Phase 5  →  Phase 7 (GET /shock)  →  Phase 8 (white card)
                                                                         ↓
                                                              Phase 9 (resilience page)
```

Start with Phase 1–2–6–7(partial)–8(partial) first. This gets the contingency fund and progress bar working with ZERO external API dependencies. Only then add Tavily (Phase 3) and the shock simulation (Phase 4–5).

---

## File Creation Checklist

### Backend (new files)
- [ ] `backend/app/models/regional_risk.py`
- [ ] `backend/app/models/contingency_plan.py`
- [ ] `backend/app/services/vulnerability_profiler.py`
- [ ] `backend/app/services/regional_risk_service.py`
- [ ] `backend/app/services/shock_simulation_service.py`
- [ ] `backend/app/services/shock_narrative_service.py`
- [ ] `backend/app/services/contingency_service.py`
- [ ] `backend/app/routes/contingency.py`

### Backend (edit existing)
- [ ] `backend/app/models/__init__.py` — import new models
- [ ] `backend/app/main.py` — register contingency router
- [ ] `backend/app/core/config.py` — add `TAVILY_API_KEY`, `RISK_CACHE_TTL_HOURS`
- [ ] `backend/.env` — add `TAVILY_API_KEY`
- [ ] `backend/requirements.txt` — add `tavily-python`

### Frontend (edit existing)
- [ ] `frontend/app/(tabs)/contingencypage.tsx` — wire to API
- [ ] `frontend/app/(tabs)/resiliencepage.tsx` — wire to API
