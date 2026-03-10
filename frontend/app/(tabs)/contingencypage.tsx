import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import api from "../../services/api";

// ── Types ──────────────────────────────────────────────────────────────────
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
  weekly_savings_target: number;
  one_time_suggestion: number;
  milestone_level: string;
  months_to_goal: number | null;
  active_indicators: Indicator[];
  regional_risk_level: string;
  avg_monthly_expense: number;
  surplus: number;
}

// Indicators that are most relevant per tab
const TAB_RELEVANT: Record<string, string[]> = {
  A: ["health_exposure_high"],
  B: ["single_income_source", "irregular_income", "near_zero_surplus"],
  C: ["regional_risk_overlay", "high_fixed_costs"],
  D: ["near_zero_surplus", "high_fixed_costs", "irregular_income"],
};

const INDICATOR_LABEL: Record<string, string> = {
  health_exposure_high: "High health spending",
  single_income_source: "Single income source",
  high_fixed_costs: "High fixed costs",
  near_zero_surplus: "Very low monthly surplus",
  irregular_income: "Irregular income",
  regional_risk_overlay: "Active regional risk",
};

const TAB_CONTEXT: Record<string, string> = {
  A: "A serious illness can spike health costs 3–5× and reduce your income at the same time.",
  B: "Job loss means zero income while fixed costs keep running. A buffer is critical.",
  C: "Natural disasters create sudden repair costs and supply disruptions.",
  D: "Currency instability raises all expense categories — especially fixed ones.",
};

export default function ContingencyPage() {

  const [containerWidth, setContainerWidth] = useState(0);
  const [savingInput, setSavingInput] = useState("");
  const [saving, setSaving] = useState(false);
  const indicatorPosition = useState(new Animated.Value(0))[0];
  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const tabs = [
    { key: "A", label: "Illness",        icon: "medkit-outline"      },
    { key: "B", label: "Job Loss",       icon: "briefcase-outline"   },
    { key: "C", label: "Nature Disaster",icon: "thunderstorm-outline"},
    { key: "D", label: "War",            icon: "shield-outline"      },
  ] as const;

  const tabWidth = containerWidth / tabs.length;

  useEffect(() => {
    api.get<Plan>("/contingency/")
      .then((data) => setPlan(data))
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── White card content per tab ────────────────────────────────────────────
  function renderWhiteCard() {
    if (loading) {
      return (
        <View style={styles.cardInner}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.cardLoadingText}>Analysing your finances…</Text>
        </View>
      );
    }
    if (fetchError || !plan) {
      return (
        <View style={styles.cardInner}>
          <Ionicons name="cloud-offline-outline" size={32} color="#999" />
          <Text style={styles.cardErrorText}>{fetchError ?? "Could not load plan."}</Text>
        </View>
      );
    }

    const relevant = TAB_RELEVANT[selectedTab];
    const fired = plan.active_indicators.filter((i) => relevant.includes(i.name));

    return (
      <View style={styles.cardInner}>
        <Text style={styles.cardContext}>{TAB_CONTEXT[selectedTab]}</Text>

        {/* Fund runway */}
        <View style={styles.runwayRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#1E3A8A" />
          <Text style={styles.runwayText}>
            Your fund targets{" "}
            <Text style={styles.runwayBold}>{plan.target_months.toFixed(1)} months</Text>
            {" "}of expenses
          </Text>
        </View>

        {fired.length > 0 ? (
          <>
            <Text style={styles.riskHeader}>⚠ Risk factors for this scenario:</Text>
            {fired.map((ind) => (
              <View key={ind.name} style={styles.riskRow}>
                <View style={[
                  styles.riskDot,
                  { backgroundColor: ind.score >= 0.7 ? "#EF4444" : ind.score >= 0.4 ? "#F59E0B" : "#10B981" },
                ]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.riskLabel}>
                    {INDICATOR_LABEL[ind.name] ?? ind.name}
                  </Text>
                  {ind.detail ? (
                    <Text style={styles.riskDetail} numberOfLines={2}>{ind.detail}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        ) : (
          <View style={styles.allClearRow}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#10B981" />
            <Text style={styles.allClearText}>No major risk factors for this scenario.</Text>
          </View>
        )}

        {selectedTab === "C" && (
          <View style={[styles.riskBadge, {
            backgroundColor:
              plan.regional_risk_level === "high" ? "#FEE2E2" :
              plan.regional_risk_level === "medium" ? "#FEF3C7" : "#D1FAE5",
          }]}>
            <Text style={styles.riskBadgeText}>
              Regional risk level:{" "}
              <Text style={{ fontWeight: "700", textTransform: "capitalize" }}>
                {plan.regional_risk_level}
              </Text>
            </Text>
          </View>
        )}
      </View>
    );
  }

  async function handleSaveToFund() {
    const amount = parseFloat(savingInput);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Please enter a valid amount greater than 0.");
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<Plan & { warning?: string; transaction_id?: number }>(
        "/contingency/save-to-fund",
        { amount }
      );
      // Strip non-Plan keys before storing
      const { warning, transaction_id, ...planData } = result;
      setPlan(planData as Plan);
      setSavingInput("");
      if (warning) {
        Alert.alert(
          "Saved with a note \u26a0\ufe0f",
          `RM ${amount.toFixed(2)} added to your fund.\n\n${warning}`
        );
      } else {
        Alert.alert("Saved! \ud83c\udf89", `RM ${amount.toFixed(2)} added to your emergency fund.`);
      }
    } catch (err: any) {
      Alert.alert("Error", err.message ?? "Could not save to fund.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Contingency Planning</Text>
      <Text style={styles.subtitle}>
        Prepare for unexpected financial challenges with a solid backup plan.
      </Text>

      <View style={styles.cardWrapper}>
        {/* White Card */}
        <View style={styles.mainCard}>{renderWhiteCard()}</View>

        {/* Floating Tabs */}
        <View
          style={styles.progressTabs}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth * 0.5,
                left: tabWidth * 0.25,
                transform: [{ translateX: indicatorPosition }],
              },
            ]}
          />
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabButton}
              onPress={() => {
                setSelectedTab(tab.key);
                const index = tabs.findIndex((t) => t.key === tab.key);
                Animated.spring(indicatorPosition, {
                  toValue: index * tabWidth,
                  useNativeDriver: true,
                }).start();
              }}
            >
              <Ionicons
                name={tab.icon as any}
                size={22}
                color={selectedTab === tab.key ? "#1E3A8A" : "#FFFFFF"}
              />
              <Text
                style={[
                  styles.tabLabel,
                  selectedTab === tab.key && { color: "#1E3A8A" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ height: 20 }} />

      {/* Target Emergency Fund */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Target Emergency Fund</Text>
        <Text style={styles.amount}>
          RM{loading ? "…" : fmt(plan?.target_amount ?? 0)}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(plan?.progress_percentage ?? 0, 100)}%` },
            ]}
          />
        </View>
        {!loading && plan && (
          <Text style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            RM{fmt(plan.current_progress)} saved · {plan.progress_percentage.toFixed(1)}% complete
            {plan.months_to_goal ? ` · ~${plan.months_to_goal} months to goal` : ""}
          </Text>
        )}

        {/* ── Save to Fund ── */}
        {!loading && plan && (
          <View style={styles.saveRow}>
            <TextInput
              style={styles.saveInput}
              placeholder="RM amount to save"
              keyboardType="numeric"
              value={savingInput}
              onChangeText={setSavingInput}
              editable={!saving}
            />
            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.6 }]}
              onPress={handleSaveToFund}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.saveButtonText}>+ Save to Fund</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Suggested Plan */}
      <Text style={styles.planTitle}>Suggested Emergency Fund Savings Plan</Text>

      <View style={styles.planCard}>
        <View style={styles.planRow}>
          <Text>Save </Text>
          <Text style={styles.bold}>RM {loading ? "…" : fmt(plan?.monthly_savings_target ?? 0)}</Text>
          <Text> / month</Text>
          <View style={styles.tagBlue}>
            <Text style={styles.tagText}>
              {plan?.months_to_goal ? `${plan.months_to_goal} months` : "Monthly"}
            </Text>
          </View>
        </View>

        <View style={styles.planRow}>
          <Text>Save </Text>
          <Text style={styles.bold}>RM {loading ? "…" : fmt(plan?.weekly_savings_target ?? 0)}</Text>
          <Text> / week</Text>
          <View style={styles.tagLight}>
            <Text style={styles.tagText}>Auto-transfer</Text>
          </View>
        </View>

        {!loading && plan && plan.one_time_suggestion > 0 && (
          <View style={styles.planRow}>
            <Text>One-time boost </Text>
            <Text style={styles.bold}>RM {fmt(plan.one_time_suggestion)}</Text>
            <View style={styles.tagGold}>
              <Text style={styles.tagText}>Bonus month</Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
  },


  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    marginBottom: 25,
  },

  shockText: {
    fontSize: 22,
  },

  section: {
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 14,
    marginBottom: 5,
  },

  amount: {
    fontSize: 28,
    fontWeight: "600",
    color: "#1E3A8A",
    marginBottom: 10,
  },

  progressBar: {
    height: 20,
    backgroundColor: "#E0E0E0",
    borderRadius: 12,
    overflow: "hidden",
  },

  progressFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#243B82",
  },

  planTitle: {
    fontSize: 14,
    marginBottom: 10,
  },

  planCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    elevation: 4,
  },

  planRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },

  bold: {
    fontWeight: "600",
  },

  tagBlue: {
    backgroundColor: "#D6E4FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  tagLight: {
    backgroundColor: "#E6F0FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  tagGold: {
    backgroundColor: "#FBE7C6",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },

  tagText: {
    fontSize: 12,
  },

  cardWrapper: {
  marginTop: 40,
  alignItems: "center",
  position: "relative",
},

mainCard: {
  width: "100%",
  height: 300,
  backgroundColor: "#FFFFFF",
  borderRadius: 25,
  elevation: 8,
},

progressTabs: {
  position: "absolute",
  top: -35,
  flexDirection: "row",
  justifyContent: "space-around",
  alignItems: "center",
  width: "85%",
  backgroundColor: "#1E3A8A",
  borderRadius: 30,
  paddingVertical: 18,
  elevation: 10,
  overflow: "hidden",
},

tabBox: {
  width: 50,
  height: 50,
  backgroundColor: "#C4C4C4",
  borderRadius: 12,
},

tabButton: {
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 8,
  zIndex: 2,
},

tabLabel: {
  fontSize: 11,
  marginTop: 4,
  color: "#FFFFFF",
  textAlign: "center",
},

activeTabLabel: {
  color: "#1E3A8A",
  fontWeight: "600",
},

indicator: {
  position: "absolute",
  bottom: 6,
  height: 1,
  backgroundColor: "#FFFFFF",
  borderRadius: 2,
},

// ── White card inner styles ────────────────────────────────────────────────
cardInner: {
  flex: 1,
  padding: 20,
  justifyContent: "center",
},
cardLoadingText: {
  textAlign: "center",
  marginTop: 12,
  color: "#666",
  fontSize: 13,
},
cardErrorText: {
  textAlign: "center",
  marginTop: 10,
  color: "#999",
  fontSize: 13,
},
cardContext: {
  fontSize: 13,
  color: "#444",
  marginBottom: 12,
  lineHeight: 18,
},
runwayRow: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#EFF6FF",
  borderRadius: 8,
  padding: 8,
  marginBottom: 12,
  gap: 6,
},
runwayText: {
  fontSize: 13,
  color: "#374151",
  flex: 1,
},
runwayBold: {
  fontWeight: "700",
  color: "#1E3A8A",
},
riskHeader: {
  fontSize: 12,
  fontWeight: "600",
  color: "#92400E",
  marginBottom: 8,
},
riskRow: {
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: 8,
  gap: 8,
},
riskDot: {
  width: 10,
  height: 10,
  borderRadius: 5,
  marginTop: 3,
},
riskLabel: {
  fontSize: 13,
  fontWeight: "600",
  color: "#1F2937",
},
riskDetail: {
  fontSize: 11,
  color: "#6B7280",
  marginTop: 2,
},
allClearRow: {
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginTop: 8,
},
allClearText: {
  fontSize: 13,
  color: "#065F46",
  flex: 1,
},
riskBadge: {
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 6,
  marginTop: 10,
},
riskBadgeText: {
  fontSize: 12,
  color: "#374151",
},

title: {
    marginTop : 24,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },

  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },

  saveInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },

  saveButton: {
    backgroundColor: "#1E3A8A",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },

});