# Spending Analysis Output Schema

## Overview

The LLM returns a structured JSON response that the backend validates and forwards to the frontend.

---

## Output JSON Schema

```json
{
  "summary": {
    "total_spending": 1234.56,
    "non_essential_share": 0.4,
    "fixed_share": 0.35,
    "flexible_share": 0.65,
    "bnpl_share": 0.12,
    "headline": "40% of your spending is non-essential."
  },
  "patterns_over_time": [
    "F&B spending grew 35% from Nov to Dec—typical holiday pattern.",
    "Loan payments remained stable at ~30% of monthly spending."
  ],
  "fixed_vs_flexible": {
    "fixed_amount": 420.5,
    "flexible_amount": 814.06,
    "key_fixed_categories": [
      {
        "category": "loan",
        "share": 0.3,
        "amount": 369.68
      },
      {
        "category": "utilities",
        "share": 0.05,
        "amount": 61.73
      }
    ],
    "key_flexible_categories": [
      {
        "category": "f&b",
        "share": 0.25,
        "amount": 308.65
      },
      {
        "category": "electronics",
        "share": 0.1,
        "amount": 123.46
      }
    ]
  },
  "risk_flags": [
    {
      "type": "bnpl_overuse",
      "severity": "medium",
      "evidence": "BNPL represents 12% of spending, concentrated in non-essential categories (80%)."
    },
    {
      "type": "discretionary_spike",
      "severity": "high",
      "evidence": "Electronics spending jumped 45% in Dec vs Nov—verify if planned upgrade or impulse."
    },
    {
      "type": "concentration_risk",
      "severity": "low",
      "evidence": "Loan payments are 30% of total spending. If loan is paid off, flexible spending capacity increases."
    }
  ],
  "recommendations": [
    "Set a monthly F&B budget of 250–300 MYR to match typical spending.",
    "Review BNPL commitments; if unclear on repayment timeline, prioritize early payoff.",
    "Consider cash-only day once a week to reduce impulse electronics purchases.",
    "Track when bonuses/extra income arrive to plan non-essential spending."
  ],
  "user_facing_message": "40% of your spending is non-essential. BNPL usage is rising—make sure you can repay on time.",
  "metadata": {
    "analysis_timestamp": "2025-03-06T10:30:00Z",
    "data_quality": "complete",
    "inferred_categories": [],
    "warnings": []
  }
}
```

---

## Field Reference

### summary Object

| Field                 | Type   | Notes                                                                        |
| --------------------- | ------ | ---------------------------------------------------------------------------- |
| `total_spending`      | number | Sum of all transaction amounts                                               |
| `non_essential_share` | number | Ratio [0–1]; non-essential total ÷ total spending                            |
| `fixed_share`         | number | Ratio [0–1]; fixed total ÷ total spending                                    |
| `flexible_share`      | number | Ratio [0–1]; flexible total ÷ total spending                                 |
| `bnpl_share`          | number | Ratio [0–1]; BNPL total ÷ total spending                                     |
| `headline`            | string | One-line user-facing summary; e.g., "40% of your spending is non-essential." |

### patterns_over_time Array

| Element | Type   | Notes                                                                             |
| ------- | ------ | --------------------------------------------------------------------------------- |
| string  | string | Each insight is 1–2 sentences describing a trend or pattern detected in the data. |

**Examples**:

- "F&B spending grew 35% from Nov to Dec—typical holiday pattern."
- "Loan payments remained stable at ~30% of monthly spending."
- "Peak spending occurred in Dec, driven by electronics and dining out."

### fixed_vs_flexible Object

| Field                     | Type   | Notes                                             |
| ------------------------- | ------ | ------------------------------------------------- |
| `fixed_amount`            | number | Total amount in fixed categories                  |
| `flexible_amount`         | number | Total amount in flexible categories               |
| `key_fixed_categories`    | array  | Top 2–3 fixed categories with share and amount    |
| `key_flexible_categories` | array  | Top 2–3 flexible categories with share and amount |

**Category Item Object**:

```json
{
  "category": "loan",
  "share": 0.3,
  "amount": 369.68
}
```

### risk_flags Array

| Element Type | Structure | Notes                                                       |
| ------------ | --------- | ----------------------------------------------------------- |
| object       | See below | Each flag has a detected risk type, severity, and evidence. |

**Risk Flag Object**:

```json
{
  "type": "bnpl_overuse | discretionary_spike | concentration_risk | other",
  "severity": "low | medium | high",
  "evidence": "string explanation with data"
}
```

**Risk Types**:

- `bnpl_overuse`: BNPL spending exceeds configured thresholds or is concentrated in non-essential categories.
- `discretionary_spike`: A flexible/non-essential category grew > threshold % in a period.
- `concentration_risk`: A single category represents > threshold % of total spending.
- `recurring_deficit`: (Future) Flexible spending consistently exceeds available income.
- `other`: Any other detected risk pattern.

**Severity Levels**:

- `low`: Observation; no immediate action needed.
- `medium`: Worth reviewing; may require behavior adjustment.
- `high`: Requires attention; adjust spending or payment strategy.

### recommendations Array

| Element | Type   | Notes                                                                 |
| ------- | ------ | --------------------------------------------------------------------- |
| string  | string | 2–4 concrete, non-judgmental action items based on detected patterns. |

**Example recommendations**:

- "Set a monthly F&B budget of 250–300 MYR to match typical spending."
- "Review BNPL commitments; if unclear on repayment timeline, prioritize early payoff."
- "Consider cash-only day once a week to reduce impulse electronics purchases."

### user_facing_message

| Field  | Type   | Notes                                                                                              |
| ------ | ------ | -------------------------------------------------------------------------------------------------- |
| string | string | Plain-language summary (1–2 sentences) suitable for direct display in app UI. Non-judgmental tone. |

**Example**:

- "40% of your spending is non-essential. BNPL usage is rising—make sure you can repay on time."

### metadata Object

| Field                 | Type   | Notes                                                          |
| --------------------- | ------ | -------------------------------------------------------------- |
| `analysis_timestamp`  | string | ISO 8601 timestamp of when analysis was performed              |
| `data_quality`        | string | "complete", "partial", or "insufficient"                       |
| `inferred_categories` | array  | List of categories not in `category_rules` but inferred by LLM |
| `warnings`            | array  | List of data quality or processing warnings                    |

**Example metadata**:

```json
{
  "analysis_timestamp": "2025-03-06T10:30:00Z",
  "data_quality": "complete",
  "inferred_categories": ["subscriptions"],
  "warnings": ["Category 'misc' inferred as flexible + non-essential."]
}
```

---

## Validation Rules (Backend)

1. **Structure**: Must match schema above (all required fields present).
2. **Numeric fields**: All percentages in [0, 1] range; amounts > 0.
3. **Arrays**: Non-empty (at least 1 pattern, recommendation, etc.).
4. **Timestamp**: Valid ISO 8601 format.
5. **Enums**: `data_quality`, `risk.severity`, `risk.type` must match allowed values.

---

## Error Response Format

If analysis fails or data is invalid, return:

```json
{
  "error": true,
  "error_code": "INSUFFICIENT_DATA | INVALID_INPUT | LLM_ERROR | VALIDATION_ERROR",
  "error_message": "Human-readable error description.",
  "details": {
    "field": "description of what went wrong"
  }
}
```

**Example**:

```json
{
  "error": true,
  "error_code": "INSUFFICIENT_DATA",
  "error_message": "Analysis requires at least 5 transactions over the specified period.",
  "details": {
    "transaction_count": 2,
    "period_days": 30
  }
}
```

---

## Display Guidelines for Frontend

1. **Headline**: Display prominently at top of analysis card.
2. **Summary metrics**: Show as gauges or progress bars (non-essential %, fixed/flexible ratio, BNPL share).
3. **Patterns**: List as bullet points in a collapsible section.
4. **Risk flags**: Highlight in color-coded alerts (red for high, orange for medium, yellow for low).
5. **Recommendations**: Display as actionable checklist items.
6. **User message**: Show in highlighted box or toast notification.

---

## Example Frontend Integration

```typescript
// Frontend receives this response
const analysis = {
  summary: {
    non_essential_share: 0.40,
    headline: "40% of your spending is non-essential."
  },
  risk_flags: [
    {
      type: "bnpl_overuse",
      severity: "medium",
      evidence: "BNPL represents 12% of spending..."
    }
  ],
  recommendations: [
    "Set a monthly F&B budget of 250–300 MYR..."
  ],
  user_facing_message: "40% of your spending is non-essential..."
};

// Display logic
<AnalysisSummary data={analysis.summary} />
<RiskAlerts flags={analysis.risk_flags} />
<Recommendations items={analysis.recommendations} />
<UserMessage text={analysis.user_facing_message} />
```
