/**
 * spendingService.ts
 * Typed wrapper around spending-analysis API calls.
 */

import api from "./api";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PaymentMethod =
  | "cash"
  | "debit"
  | "credit"
  | "bnpl"
  | "transfer"
  | "other";
export type Granularity = "daily" | "weekly" | "monthly";

export interface SpendingTransactionIn {
  date: string; // ISO 8601 YYYY-MM-DD
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  is_recurring?: boolean;
  description?: string;
}

export interface AnalysisPeriod {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  granularity: Granularity;
}

export interface CategoryRules {
  fixed_categories?: string[];
  flexible_categories?: string[];
  essential_categories?: string[];
  non_essential_categories?: string[];
}

export interface RiskThresholds {
  bnpl_share_warning?: number;
  bnpl_share_high?: number;
  category_spike_pct?: number;
  single_category_concentration_warning?: number;
}

export interface SpendingAnalysisRequest {
  currency?: string;
  period: AnalysisPeriod;
  spending: SpendingTransactionIn[];
  category_rules?: CategoryRules;
  risk_thresholds?: RiskThresholds;
}

// ─── Response types ────────────────────────────────────────────────────────

export interface CategoryShare {
  category: string;
  share: number;
  amount?: number;
}

export interface Summary {
  total_spending: number;
  non_essential_share: number;
  fixed_share: number;
  flexible_share: number;
  bnpl_share: number;
  headline: string;
}

export interface FixedVsFlexible {
  fixed_amount: number;
  flexible_amount: number;
  key_fixed_categories: CategoryShare[];
  key_flexible_categories: CategoryShare[];
}

export interface RiskFlag {
  type: string;
  severity: "low" | "medium" | "high";
  evidence: string;
}

export interface AnalysisMetadata {
  analysis_timestamp: string;
  data_quality: string;
  inferred_categories: string[];
  warnings: string[];
}

export interface SpendingAnalysisResponse {
  summary: Summary;
  patterns_over_time: string[];
  fixed_vs_flexible: FixedVsFlexible;
  risk_flags: RiskFlag[];
  recommendations: string[];
  user_facing_message: string;
  metadata: AnalysisMetadata;
}

export interface SpendingTransactionOut {
  id: number;
  date: string;
  category: string;
  amount: number;
  currency: string;
  payment_method: string;
  is_recurring: boolean;
  description?: string;
}

export interface SpendingAnalysisHistoryItem {
  id: number;
  period_start: string;
  period_end: string;
  analysis_result: SpendingAnalysisResponse;
  created_at: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export const spendingService = {
  /** Bulk-create spending transactions. */
  async createTransactions(
    items: SpendingTransactionIn[],
  ): Promise<SpendingTransactionOut[]> {
    return api.post<SpendingTransactionOut[]>("/spending/transactions", items);
  },

  /** List spending transactions (optional date filter). */
  async listTransactions(
    start?: string,
    end?: string,
  ): Promise<SpendingTransactionOut[]> {
    const params = new URLSearchParams();
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    const qs = params.toString();
    return api.get<SpendingTransactionOut[]>(
      `/spending/transactions${qs ? `?${qs}` : ""}`,
    );
  },

  /** Delete a single spending transaction. */
  async deleteTransaction(id: number): Promise<void> {
    return api.delete(`/spending/transactions/${id}`);
  },

  /** Run AI spending analysis on the provided data. */
  async analyze(
    request: SpendingAnalysisRequest,
  ): Promise<SpendingAnalysisResponse> {
    return api.post<SpendingAnalysisResponse>("/spending/analyze", request);
  },

  /** Get past spending analysis results. */
  async getHistory(limit = 10): Promise<SpendingAnalysisHistoryItem[]> {
    return api.get<SpendingAnalysisHistoryItem[]>(
      `/spending/history?limit=${limit}`,
    );
  },
};
