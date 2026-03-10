── Raw transactions (92-day window, all 3 months) ───────────────────
Income:
  Month 3 ago (85d):  RM 3,800
  Month 2 ago (60d):  RM 2,900
  Month 1 ago (30d):  RM 3,200
  Total income     =  RM 9,900

Expenses (all 3 months):
  Food:           820 + 750 + 800  = RM 2,370
  Health:         480 + 520 + 410  = RM 1,410
  Utilities:      280 + 280 + 280  =   RM 840
  Transport:      220 + 210 + 230  =   RM 660
  Shopping:       350 +   0 + 200  =   RM 550
  Entertainment:  150 + 120 +  90  =   RM 360
  Total expense                    = RM 6,190

period_months = 92 ÷ 30 = 3.067

avg_monthly_income  = 9,900  ÷ 3.067 = RM 3,228
avg_monthly_expense = 6,190  ÷ 3.067 = RM 2,018
surplus             = 3,228 - 2,018  = RM 1,210  ← healthy now

── Indicators ───────────────────────────────────────────────────────
health_exposure_high:
  Health / total expense = 1,410 / 6,190 = 22.8% > 10%
  score = min(22.8/10, 1.0) = 1.0  →  extra = 1.0 × 2.0 = 2.00 months

high_fixed_costs:
  (Health+Utilities+Transport) / expense = 2,910 / 6,190 = 47% > 40%
  score = min(47/40, 1.0) = 1.0  →  extra = 1.0 × 1.0 = 1.00 months

single_income_source: ✗  (3/3 months covered = 100% ≥ 80% threshold)
near_zero_surplus:    ✗  (surplus ratio 37% ≥ 5% threshold)
irregular_income:     ✗  (std_dev/mean = 15% < 30% threshold)

── Fund target ──────────────────────────────────────────────────────
total_extra  = 2.00 + 1.00         = 3.00
target_months = min(3.0 + 3.0, 12) = 6.00
target_amount = 6.00 × 2,018       = RM 12,110.87

── Saving plan (normal tier — surplus RM1,210) ──────────────────────
monthly = max(1,210 × 0.20, 50.0)  = RM 242.00
weekly  = 242.00 ÷ 4.33            = RM 55.89

one_time: income spikes above 1.3 × 3,228 = RM 4,196
  3,800 < 4,196 → no spike
  3,200 < 4,196 → no spike
  one_time_suggestion = RM 0  (no spike months)

── Progress scenarios ───────────────────────────────────────────────
If current_progress = RM 0:
  progress_pct  = 0%
  milestone     = "starter"
  months_to_goal = ceil(12,110.87 / 242) = 51 months

If current_progress = RM 4,000:
  progress_pct  = (4,000 / 12,110.87) × 100 = 33.0%
  milestone     = "stable"  (≥ 33% threshold)
  months_to_goal = ceil((12,110.87 - 4,000) / 242) = 34 months

If current_progress = RM 8,000:
  progress_pct  = (8,000 / 12,110.87) × 100 = 66.1%
  milestone     = "resilient"  (≥ 66% threshold)
  months_to_goal = ceil(4,110.87 / 242) = 17 months

If current_progress = RM 12,111:
  progress_pct  = 100%
  milestone     = "ready"
  months_to_goal = null  ← goal reached