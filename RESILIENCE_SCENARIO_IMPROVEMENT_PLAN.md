# Resilience Scenario Improvement Plan
> Illness · Job Loss · Natural Disaster · War  
> Goal: Replace verbose AI paragraph essays with concise, structured, scannable cards that show **recent ASEAN context** + **clear user financial assessment**

---

## 1. Problem Analysis

| Current Issue | Description |
|---|---|
| **Paragraph essays** | AI analysis is 3 dense paragraphs, hard to digest at a glance |
| **Squished & hard to read** | No visual hierarchy — text blobs with no structure |
| **No recent ASEAN data** | Hard-coded 2023 stats; no live/recent incident context |
| **No clear "can user withstand?" answer** | User must read and infer; no direct verdict |
| **Job loss misses survival timeline** | Doesn't show "with RM0 income, you last X months" |
| **Natural disaster lacks recent incidents** | No concrete recent ASEAN floods/quakes cited |
| **War is vague** | No recent regional conflict cited with financial cost |

---

## 2. What Stays (Keep — Don't Transform UI)

- **Tab structure**: Illness / Job Loss / Nature Disaster / War tabs — untouched
- **Fund coverage bar** (progress bar showing months covered) — keep
- **Monthly mini-table** (income / expense / net per month) — keep, but condense to fewer rows
- **Regional signals section** (Tavily-sourced regional news) — keep
- **"Do this today" action callout** — keep
- **Overall layout** of contingencypage.tsx — same scroll structure

---

## 3. What Changes

### 3A. AI Analysis Section (the BIG change)

**Before:** Paragraph prose block  
```
📊 AI Analysis
[A serious illness can spike health costs 3-5x and reduce your income at 
the same time. Based on your RM3,200 income and RM2,800 monthly expenses, 
a hospitalisation event in Month 1 would leave you with a RM1,450 deficit... 
(continues for 150+ words)]
```

**After:** 3 structured sub-sections replacing the paragraph:

#### Section 1 — Recent [Scenario] in ASEAN *(compact chip list)*
```
🏥 Common Illnesses in ASEAN (2024–2025)
  • Dengue Fever        ~RM 3,000–12,000 total cost
  • Heart Attack        ~RM 15,000–60,000 total cost  
  • Stroke              ~RM 20,000–80,000 total cost
  • HFMD (children)    ~RM 1,500–5,000 total cost
  • Tuberculosis        ~RM 5,000–25,000 total cost
```

#### Section 2 — Contingency Fund Needed *(2-column cost grid)*
```
💰 Estimated Costs for This Scenario
  Hospital bills      RM 3,500–15,000
  Lost income (2mo)   RM 6,400
  Medication (3mo)    RM 1,800
  ─────────────────────────────────
  Total needed        RM 11,700–23,200
```

#### Section 3 — Can You Withstand? *(clear verdict badge + 2-line max)*
```
[ ✓ CAN WITHSTAND ]  (green) or  [ ⚠ BORDERLINE ]  (amber) or  [ ✗ AT RISK ]  (red)

"Your RM 8,200 savings covers ~3.4 months of this scenario.
 You fall short by RM 3,000 if hospitalisation exceeds 2 months."
```

#### Section 4 — Job Loss Only: Survival Runway
```
🕐 On Zero Income You Can Survive
  [████████░░░░]  3.2 months
  Current savings RM 8,200 · Monthly burn RM 2,567
```

---

## 4. Backend Changes

### File: `backend/app/services/shock_narrative_service.py`

**Change:** Replace prose prompt + parsing with a structured JSON output prompt that uses **Gemini Google Search grounding** for real-time ASEAN context.

#### New prompt schema output:
```json
{
  "asean_incidents": [
    {"name": "Dengue Fever", "cost_rm_range": "RM 3,000–12,000", "year": "2024"},
    {"name": "Heart Attack", "cost_rm_range": "RM 15,000–60,000", "year": "2024"},
    {"name": "COVID-19 complications", "cost_rm_range": "RM 8,000–35,000", "year": "2025"}
  ],
  "contingency_costs": [
    {"item": "Hospital bills (private)", "min_rm": 3500, "max_rm": 15000},
    {"item": "Income lost (2 months)", "min_rm": 6400, "max_rm": 6400},
    {"item": "Ongoing medication (3 months)", "min_rm": 600, "max_rm": 1800}
  ],
  "total_contingency_min": 10500,
  "total_contingency_max": 23200,
  "withstand_verdict": "BORDERLINE",
  "withstand_summary": "Your RM 8,200 savings covers ~3.4 months. You fall short if hospitalisation is private and exceeds 2 months.",
  "months_can_survive": 3.2,
  "action_today": "Transfer RM 200 to a dedicated emergency fund — that's 5 extra days of runway."
}
```

#### Use Gemini Google Search grounding (no Tavily key needed):
```python
from google import genai as gai
from google.genai import types

client = gai.Client(api_key=api_key)
response = await client.aio.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())]
    )
)
```

**Why grounding?** Forces Gemini to search Google for recent ASEAN illness/disaster/conflict news before answering — gives us 2024-2025 accurate data, not training-data knowledge.

#### Scenario-specific ASEAN search queries injected into prompt:
| Scenario | Grounding Query Hint |
|---|---|
| illness | "most common hospitalised illnesses ASEAN Malaysia 2024 2025 cost" |
| job_loss | "Malaysia job loss unemployment retrenchment 2024 2025 industry sectors" |
| disaster | "recent natural disasters ASEAN Malaysia 2024 2025 flood damage cost" |
| war | "ASEAN geopolitical conflict instability 2024 2025 financial impact" |

#### Fallback (if grounding or Gemini fails):
- Pre-baked static JSON per scenario with year="2024" hardcoded data
- Graceful — frontend renders same structure either way

---

### File: `backend/app/routes/contingency.py`

**Change:** Update the response to pass through new structured fields.

```python
# ── 5. Structured AI analysis (replaces prose narrative) ──────────────────
ai_analysis = await generate_shock_analysis(simulation, profile, shock_type)

return {
    **simulation,
    # Old: narrative, action_today
    # New: structured JSON fields
    "asean_incidents":        ai_analysis.get("asean_incidents", []),
    "contingency_costs":      ai_analysis.get("contingency_costs", []),
    "total_contingency_min":  ai_analysis.get("total_contingency_min", 0),
    "total_contingency_max":  ai_analysis.get("total_contingency_max", 0),
    "withstand_verdict":      ai_analysis.get("withstand_verdict", "BORDERLINE"),
    "withstand_summary":      ai_analysis.get("withstand_summary", ""),
    "months_can_survive":     ai_analysis.get("months_can_survive", None),
    "action_today":           ai_analysis.get("action_today", ""),
    "regional_risks":         regional_risks[:3],
}
```

> **Note:** Keep `narrative` as `None`/`""` for backward compatibility during transition.

---

## 5. Frontend Changes

### File: `frontend/app/contingencypage.tsx`

#### 5A. Update `ShockReport` TypeScript Interface

```typescript
interface AseanIncident {
  name: string;
  cost_rm_range: string;
  year: string;
}

interface ContingencyCost {
  item: string;
  min_rm: number;
  max_rm: number;
}

interface ShockReport {
  // ... existing fields ...
  // NEW structured analysis fields
  asean_incidents:       AseanIncident[];
  contingency_costs:     ContingencyCost[];
  total_contingency_min: number;
  total_contingency_max: number;
  withstand_verdict:     'YES' | 'BORDERLINE' | 'NO';
  withstand_summary:     string;
  months_can_survive:    number | null;
  action_today:          string;
  // narrative kept for backward compat, no longer rendered
  narrative:             string;
}
```

#### 5B. Replace Narrative Rendering with 3 Structured Components

Instead of:
```tsx
{shock.narrative ? (
  <View style={styles.narrativeBox}>
    <Text style={styles.narrativeTitle}>📊 AI Analysis</Text>
    <Text style={styles.narrativeText}>{shock.narrative}</Text>
  </View>
) : null}
```

Replace with:
```tsx
{/* 1. ASEAN Incidents */}
<AseanIncidentsSection incidents={shock.asean_incidents} scenario={selectedTab} />

{/* 2. Cost Breakdown */}
<ContingencyCostSection
  costs={shock.contingency_costs}
  totalMin={shock.total_contingency_min}
  totalMax={shock.total_contingency_max}
/>

{/* 3. Withstand Verdict */}
<WithstandVerdict
  verdict={shock.withstand_verdict}
  summary={shock.withstand_summary}
  monthsCanSurvive={shock.months_can_survive}
  scenario={TAB_SHOCK[selectedTab]}
/>
```

#### 5C. New Sub-components (inline in contingencypage.tsx)

**`AseanIncidentsSection`**
```tsx
// Compact list of 3-5 incidents with cost chips
// Design: icon + name on left, cost range chip on right
// Similar to how financial suggestion detail cards show bullet points
```

**`ContingencyCostSection`**
```tsx
// 2-column grid showing cost items
// Total row at bottom with bold highlight
// Design reference: personalizedsuggestionpage insight cards
```

**`WithstandVerdict`**
```tsx
// Large badge: green "✓ CAN WITHSTAND" / amber "⚠ BORDERLINE" / red "✗ AT RISK"
// 2-line max summary below badge
// For job_loss only: Progress bar showing "survival months on RM0 income"
```

---

## 6. Design Reference: Financial Suggestions Style

From `personalizedsuggestionpage.tsx`, we borrow:
- **Chip/badge style**: coloured background pill with bold text
- **Row layout**: icon on left, text in middle, value/badge on right
- **Section titles**: small ALL-CAPS label above content
- **Visual hierarchy**: clear separation between sections (subtle divider or `marginTop`)
- **Colour palette**: same green/amber/red used in `INSIGHT_THEME`

Applied to resilience cards:
- ASEAN incidents → rows with `🔴/🟡/🟢` severity dot + name + cost chip
- Cost grid → compact rows matching the financial sum-up style
- Withstand badge → full-width coloured pill (largest element in section)

---

## 7. Scenario-Specific Implementation Notes

### Illness
- **ASEAN incidents:** dengue, heart attack, stroke, cancer (common), HFMD, TB — with typical Malaysian cost (govt vs private hospital)
- **Cost breakdown:** hospital, medication, income loss, physio/rehab
- **Withstand logic:** savings ÷ (monthly deficit during illness) = months covered; compare to `duration_months`

### Job Loss
- **ASEAN incidents:** retrenchment sectors in Malaysia 2024-2025 (tech, manufacturing, retail)
- **Cost breakdown:** just living expenses — user's actual monthly spend
- **Survival runway:** `savings_balance ÷ avg_monthly_expense` → displayed as months
- **Withstand verdict:** green if ≥ 6 months, amber if 3-6, red if < 3

### Natural Disaster
- **ASEAN incidents:** recent ASEAN floods 2024-2025 (Thailand, Malaysia, Philippines), with reported property damage RM equivalents
- **Cost breakdown:** emergency repairs, temporary shelter, replacement items, income loss
- **Withstand logic:** savings vs total one-time + 3-month deficit

### War / Civil Unrest
- **ASEAN incidents:** South China Sea tensions, recent geopolitical events 2024-2025 impacting MYR/imports
- **Cost breakdown:** evacuation, relocation, food inflation (RM effect), import cost surge
- **Withstand logic:** whether user has 6-month reserve + any foreign-currency assets

---

## 8. Implementation Order

| Step | File | Change | Priority |
|---|---|---|---|
| 1 | `shock_narrative_service.py` | New `generate_shock_analysis()` with Gemini grounding + structured JSON output | **High** |
| 2 | `contingency.py` | Update route to return new structured fields | **High** |
| 3 | `contingencypage.tsx` | Update `ShockReport` interface + new sub-components | **High** |
| 4 | `contingencypage.tsx` | Add `WithstandVerdict` with job loss survival bar | **High** |
| 5 | `contingencypage.tsx` | Style polish — match financial suggestions card design | **Medium** |
| 6 | `contingencypage.tsx` | Condense monthly table (show max 3 rows, collapse rest behind "Show all") | **Low** |

---

## 9. Fallback Strategy

All three new sections must gracefully degrade:
- If `asean_incidents` is `[]` → hide section entirely (don't show empty container)
- If `contingency_costs` is `[]` → hide cost section
- If `withstand_verdict` is missing → don't show verdict badge
- If Gemini grounding fails → use static pre-baked incidents (defined per-scenario in service)

---

## 10. Example Final Output (Illness Tab)

```
┌─────────────────────────────────────────────┐
│  🔴 Severe scenario                         │
│  Fund coverage: ████████░░░  2.1 / 3 months │
│  RM 19,450 total impact · RM 3,500 one-off  │
├─────────────────────────────────────────────┤
│  Mo. │ Income   │ Expenses  │  Net          │
│   1  │ RM 960   │ RM 6,370  │  -RM 5,410   │
│   2  │ RM 960   │ RM 5,120  │  -RM 4,160   │
│   3  │ RM 2,240 │ RM 3,620  │  -RM 1,380   │
├─────────────────────────────────────────────┤
│  🏥 COMMON ILLNESSES IN ASEAN (2024-2025)   │
│  Dengue Fever        RM 3,000–12,000        │
│  Heart Attack        RM 15,000–60,000       │
│  Stroke              RM 20,000–80,000       │
│  HFMD                RM 1,500–5,000         │
├─────────────────────────────────────────────┤
│  💰 WHAT YOU NEED TO PREPARE                │
│  Hospital bills       RM 3,500–15,000       │
│  Lost income (2mo)    RM 6,400              │
│  Medication (3mo)     RM 600–1,800          │
│  ─────────────────────────────────────      │
│  Total needed        RM 10,500–23,200       │
├─────────────────────────────────────────────┤
│        [ ⚠ BORDERLINE ]                    │
│  Your RM 8,200 savings covers ~3.2 months.  │
│  Gap of ~RM 3,250 if illness runs 3 months. │
├─────────────────────────────────────────────┤
│  ✅ Do this today                           │
│  Transfer RM 200/mo to emergency fund.      │
├─────────────────────────────────────────────┤
│  📡 Regional signals                        │
│   • Malaysia Dengue alert 2025...           │
└─────────────────────────────────────────────┘
```

---

## 11. Example Final Output (Job Loss Tab)

```
┌─────────────────────────────────────────────┐
│  🔴 Severe scenario                         │
│  Fund coverage: ██████░░░░  2.0 / 6 months  │
│  RM 15,402 total impact · RM 0 one-off      │
├─────────────────────────────────────────────┤
│  Monthly table (3 rows)...                  │
├─────────────────────────────────────────────┤
│  💼 RECENT RETRENCHMENTS IN MALAYSIA (2025) │
│  Tech sector (Grab, e-commerce) — 2,000+   │
│  Manufacturing layoffs — Jan 2025           │
│  Retail closures — 2024-2025               │
├─────────────────────────────────────────────┤
│  ⏱ ON ZERO INCOME, YOU CAN SURVIVE          │
│  [████████████░░░]  3.2 months              │
│  Savings RM 8,200 · Burn RM 2,567/mo        │
├─────────────────────────────────────────────┤
│        [ ✗ AT RISK ]                       │
│  You have only 3.2 months of runway.        │
│  A 3-month emergency fund minimum = RM 7,7k │
├─────────────────────────────────────────────┤
│  ✅ Do this today                           │
│  Register on MYFutureJobs + claim SOCSO EIS │
└─────────────────────────────────────────────┘
```

---

## 12. Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| AI search tool | Gemini Google Search grounding | Already have Gemini key; no Tavily key needed; real-time |
| Output format | Structured JSON (not prose) | Predictable parsing; no regex hacks |
| Parsing safety | `json.loads` + try/except + static fallback | Robust to Gemini hallucination |
| months_can_survive | Computed server-side (savings ÷ burn) | Deterministic; doesn't depend on AI |
| UI components | Inline in contingencypage.tsx | No new files; keep scope tight |
| Monthly table | Collapse to 3 rows + "Show all" toggle | Reduce visual density; key data still visible |

---

## 13. Gemini Prompt Template (New)

```python
PROMPT = """
You are a Malaysia financial resilience analyst. Use Google Search to find
the MOST RECENT (2024-2025) ASEAN incidents related to: {scenario_label}.

Search for: {search_query_hint}

Then output ONLY this JSON — no prose, no markdown fences:
{{
  "asean_incidents": [
    {{"name": "...", "cost_rm_range": "RM X–Y", "year": "2024 or 2025"}}
  ],
  "contingency_costs": [
    {{"item": "...", "min_rm": number, "max_rm": number}}
  ],
  "total_contingency_min": number,
  "total_contingency_max": number,
  "withstand_verdict": "YES" or "BORDERLINE" or "NO",
  "withstand_summary": "max 2 sentences. Use their real RM numbers: savings RM{savings}, monthly burn RM{monthly_burn}",
  "months_can_survive": number or null,
  "action_today": "1 specific action with a RM figure"
}}

Rules:
- asean_incidents: 3-5 items, use real 2024-2025 Malaysian/ASEAN data from search
- contingency_costs: 3-5 cost line items calibrated to RM{monthly_income}/mo income
- withstand_verdict: YES if savings > total_contingency_max; NO if savings < total_contingency_min; else BORDERLINE
- months_can_survive: savings ÷ monthly_burn (for all scenarios, especially job_loss)
- withstand_summary: max 30 words, cite their real RM numbers
- action_today: max 15 words, specific and actionable
"""
```

---

*Generated: March 2026 | For: BorneoHackwknd resilience module*
