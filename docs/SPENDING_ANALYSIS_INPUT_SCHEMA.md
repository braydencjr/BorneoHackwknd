# Spending Analysis Input Schema

## Overview

The frontend collects spending transactions and sends them to the backend. The backend validates the input, queries the LLM, and returns structured analysis results.

---

## Input JSON Schema

```json
{
  "currency": "MYR",
  "period": {
    "start": "2025-11-01",
    "end": "2025-12-31",
    "granularity": "monthly"
  },
  "spending": [
    {
      "date": "2025-11-05",
      "category": "f&b",
      "amount": 45.5,
      "payment_method": "cash",
      "is_recurring": false,
      "description": "Lunch at local restaurant (optional)"
    },
    {
      "date": "2025-11-10",
      "category": "loan",
      "amount": 500.0,
      "payment_method": "transfer",
      "is_recurring": true,
      "description": "Monthly loan repayment"
    },
    {
      "date": "2025-12-01",
      "category": "electronics",
      "amount": 899.99,
      "payment_method": "bnpl",
      "is_recurring": false,
      "description": "Laptop purchase (3-month installment)"
    }
  ],
  "category_rules": {
    "fixed_categories": [
      "loan",
      "rent",
      "insurance",
      "utilities",
      "subscriptions"
    ],
    "flexible_categories": [
      "f&b",
      "electronics",
      "entertainment",
      "shopping",
      "stationeries",
      "transport",
      "dining_out",
      "groceries"
    ],
    "essential_categories": [
      "loan",
      "rent",
      "utilities",
      "groceries",
      "transport",
      "insurance"
    ],
    "non_essential_categories": [
      "electronics",
      "entertainment",
      "shopping",
      "dining_out",
      "stationeries"
    ]
  },
  "risk_thresholds": {
    "bnpl_share_warning": 0.15,
    "bnpl_share_high": 0.25,
    "category_spike_pct": 0.3,
    "single_category_concentration_warning": 0.4
  }
}
```

---

## Field Descriptions

### Root Level

| Field             | Type   | Required | Notes                                                 |
| ----------------- | ------ | -------- | ----------------------------------------------------- |
| `currency`        | string | Yes      | ISO 4217 code (e.g., "MYR", "USD", "SGD")             |
| `period`          | object | Yes      | Analysis time window                                  |
| `spending`        | array  | Yes      | List of transactions (≥1 required for analysis)       |
| `category_rules`  | object | No       | Category classification; system will infer if missing |
| `risk_thresholds` | object | No       | Configurable risk detection thresholds                |

### period Object

| Field         | Type   | Required | Notes                                               |
| ------------- | ------ | -------- | --------------------------------------------------- |
| `start`       | string | Yes      | ISO 8601 date (YYYY-MM-DD)                          |
| `end`         | string | Yes      | ISO 8601 date (YYYY-MM-DD); must be ≥ start         |
| `granularity` | string | Yes      | "daily", "weekly", or "monthly" for trend detection |

### spending Array (Transaction Object)

| Field            | Type    | Required | Notes                                                          |
| ---------------- | ------- | -------- | -------------------------------------------------------------- |
| `date`           | string  | Yes      | ISO 8601 date (YYYY-MM-DD)                                     |
| `category`       | string  | Yes      | Must be lowercase, snake_case (e.g., "f&b", "dining_out")      |
| `amount`         | number  | Yes      | Positive number; currency in root-level `currency` field       |
| `payment_method` | string  | Yes      | One of: "cash", "debit", "credit", "bnpl", "transfer", "other" |
| `is_recurring`   | boolean | Yes      | True if payment repeats monthly/regularly                      |
| `description`    | string  | No       | User-provided note or merchant name                            |

### category_rules Object

| Field                      | Type  | Required | Notes                                                          |
| -------------------------- | ----- | -------- | -------------------------------------------------------------- |
| `fixed_categories`         | array | No       | Categories with predictable, regular amounts; e.g., rent, loan |
| `flexible_categories`      | array | No       | Categories with variable spending; e.g., f&b, shopping         |
| `essential_categories`     | array | No       | Necessary for basic living; e.g., utilities, groceries         |
| `non_essential_categories` | array | No       | Discretionary spending; e.g., entertainment, dining out        |

**Note**: Categories can overlap (e.g., "utilities" is both fixed and essential).

### risk_thresholds Object

| Field                                   | Type   | Default | Notes                                        |
| --------------------------------------- | ------ | ------- | -------------------------------------------- |
| `bnpl_share_warning`                    | number | 0.15    | Flag warning if BNPL is 15% of spending      |
| `bnpl_share_high`                       | number | 0.25    | Flag high risk if BNPL is 25% of spending    |
| `category_spike_pct`                    | number | 0.30    | Flag if category grows >30% month-over-month |
| `single_category_concentration_warning` | number | 0.40    | Flag if single category is >40% of total     |

---

## Validation Rules (Backend)

1. **Date range**: `start` < `end`, both valid ISO 8601 dates
2. **Transactions**: At least 1 transaction required
3. **Amounts**: All amounts > 0
4. **Categories**: Lowercase, snake_case format
5. **Payment methods**: One of enum values
6. **Thresholds**: All between 0 and 1 (percentage format)

---

## Example Valid Request

```json
{
  "currency": "MYR",
  "period": {
    "start": "2025-10-01",
    "end": "2025-12-31",
    "granularity": "monthly"
  },
  "spending": [
    {
      "date": "2025-10-05",
      "category": "f&b",
      "amount": 120.5,
      "payment_method": "cash",
      "is_recurring": false
    },
    {
      "date": "2025-10-01",
      "category": "rent",
      "amount": 1200.0,
      "payment_method": "transfer",
      "is_recurring": true
    }
  ]
}
```

---

## Example Invalid Request (and why)

```json
{
  "currency": "MYR",
  "period": {
    "start": "2025-12-31",
    "end": "2025-10-01" // ERROR: end < start
  },
  "spending": [] // ERROR: no transactions
}
```
