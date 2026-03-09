import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import api from "../../services/api";

interface Indicator {
  name: string;
  score: number;
  extra_months: number;
  detail?: string;
}
interface Plan {
  target_months: number;
  target_amount: number;
  current_progress: number;
  progress_percentage: number;
  monthly_savings_target: number;
  milestone_level: string;
  months_to_goal: number | null;
  active_indicators: Indicator[];
  regional_risk_level: string;
  avg_monthly_expense: number;
  surplus: number;
}

const MILESTONE_MSG: Record<string, string> = {
  starter:   "Just getting started — every RM counts.",
  stable:    "About 1 month covered. Keep going!",
  resilient: "Over halfway there. Great progress.",
  ready:     "Fully funded. You are financially resilient.",
};

const INDICATOR_LABEL: Record<string, string> = {
  health_exposure_high: "High health spending",
  single_income_source: "Single income source",
  high_fixed_costs:     "High fixed costs",
  near_zero_surplus:    "Very low monthly surplus",
  irregular_income:     "Irregular income",
  regional_risk_overlay:"Active regional risk event",
};

export default function ResiliencePage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Plan>("/contingency/")
      .then(setPlan)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const regionColor =
    plan?.regional_risk_level === "high"   ? "#EF4444" :
    plan?.regional_risk_level === "medium" ? "#F59E0B" : "#10B981";

  const topIndicator = plan?.active_indicators?.[0];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Financial Resilience</Text>
      <Text style={styles.subtitle}>Stay prepared for unexpected expenses.</Text>

      {loading && (
        <ActivityIndicator size="large" color="#1E3A8A" style={{ marginTop: 32 }} />
      )}

      {/* Card 1 — Emergency Fund */}
      <View style={styles.card}>
        <Ionicons name="wallet-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Emergency Fund</Text>
          <Text style={styles.cardDesc}>
            {plan
              ? `Saved RM${fmt(plan.current_progress)} of RM${fmt(plan.target_amount)} (${plan.progress_percentage.toFixed(1)}% · ${plan.target_months.toFixed(1)}-month target)`
              : "No plan yet — add some transactions first."}
          </Text>
          {plan && (
            <Text style={[styles.cardDesc, { marginTop: 4, fontStyle: "italic" }]}>
              {MILESTONE_MSG[plan.milestone_level] ?? ""}
            </Text>
          )}
        </View>
      </View>

      {/* Card 2 — Biggest Risk Factor */}
      <View style={styles.card}>
        <Ionicons name="alert-circle-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Biggest Risk Factor</Text>
          <Text style={styles.cardDesc}>
            {topIndicator
              ? `${INDICATOR_LABEL[topIndicator.name] ?? topIndicator.name}${topIndicator.extra_months > 0 ? ` — adds +${(topIndicator.score * topIndicator.extra_months).toFixed(1)} months to your target` : " — triggers micro-savings plan"}.`
              : plan
              ? "No significant risk factors detected. You look well-prepared."
              : "Add transactions to detect risk factors."}
          </Text>
        </View>
      </View>

      {/* Card 3 — Saving Pace */}
      <View style={styles.card}>
        <Ionicons name="trending-up-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>
            {plan ? `Saving RM${fmt(plan.monthly_savings_target)}/month` : "Saving Pace"}
          </Text>
          <Text style={styles.cardDesc}>
            {plan
              ? plan.months_to_goal
                ? `At this pace you'll reach your goal in ${plan.months_to_goal} month${plan.months_to_goal === 1 ? "" : "s"}.`
                : "You've reached your goal — keep it funded!"
              : "Add transactions to see your saving pace."}
          </Text>
        </View>
      </View>

      {/* Card 4 — Regional Risk */}
      <View style={styles.card}>
        <Ionicons
          name={
            plan?.regional_risk_level === "high"   ? "warning-outline" :
            plan?.regional_risk_level === "medium" ? "alert-outline"   : "shield-checkmark-outline"
          }
          size={28}
          color={regionColor}
        />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>
            Regional Risk:{" "}
            <Text style={{ color: regionColor, textTransform: "capitalize" }}>
              {plan?.regional_risk_level ?? "—"}
            </Text>
          </Text>
          <Text style={styles.cardDesc}>
            {plan?.regional_risk_level === "high"
              ? "High regional risk detected. Prioritise building your fund now."
              : plan?.regional_risk_level === "medium"
              ? "Moderate risk in your region. Your fund target includes a buffer."
              : "No significant regional risk events currently detected."}
          </Text>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FB",
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },

  textBox: {
    marginLeft: 12,
    flex: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },

  cardDesc: {
    fontSize: 13,
    color: "#666",
    marginTop: 3,
  },
});