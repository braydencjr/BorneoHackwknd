import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import api from "../services/api";

const { width: SCREEN_W } = Dimensions.get("window");
// container paddingHorizontal:20 each side (40) + cardInner padding:16 each side (32) = 72
const INCIDENT_CARD_W = SCREEN_W - 72;

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

interface MonthProjection {
  month: number;
  income: number;
  expense: number;           // total projected expenses
  deficit: number;          // income - expense (negative = shortfall)
}
interface ShockReport {
  shock_type: string;
  severity_label: string;    // "moderate" | "severe" | "critical"
  duration_months: number;
  monthly_projected: MonthProjection[];
  total_shortfall: number;   // negative RM value (sum of deficits)
  months_until_broke: number | null;
  grand_total_impact: number;
  one_time_cost_estimate: number;
  baseline_monthly_income: number;
  baseline_monthly_expense: number;
  narrative: string;
  action_today: string;
  regional_risks: { event_title: string; severity: number; source_url: string }[];
}

// Map tab key → shock_type for the API
const TAB_SHOCK: Record<string, string> = {
  A: "illness",
  B: "job_loss",
  C: "disaster",
  D: "war",
};

// Indicators that are most relevant per tab
const TAB_RELEVANT: Record<string, string[]> = {
  A: ["health_exposure_high"],
  B: ["single_income_source", "irregular_income", "near_zero_surplus"],
  C: ["regional_risk_overlay", "high_fixed_costs"],
  D: ["near_zero_surplus", "high_fixed_costs", "irregular_income"],
};

const TAB_SCENARIO_TITLE = {
  A: "Financial Simulation with Recent Illness",
  B: "Financial Simulation with Job Market Risk",
  C: "Financial Simulation with Natural Disaster",
  D: "Financial Simulation with Geopolitical Conflict",
};

type PreparationRange = {
  label: string
  min: number
  max: number
}

type PreparationItem = {
  label: string
  value: string
  isTotal?: boolean
}

function getPreparationItems(shock:any): PreparationItem[] {

const monthly = shock.baseline_monthly_expense;
const duration = shock.duration_months;
const oneTime = shock.one_time_cost_estimate || 0;

let rows: PreparationRange[] = [];

switch(shock.shock_type){

case "illness":

rows = [
{
label:"Hospital treatment",
min: oneTime * 0.8,
max: oneTime * 1.5
},
{
label:"Medication & recovery",
min: monthly * 0.3,
max: monthly * 0.9
},
{
label:"Income disruption",
min: monthly * duration,
max: monthly * duration * 2
}
];

break;


case "job_loss":

rows = [
{
label:"Living expenses",
min: monthly * duration,
max: monthly * duration * 1.5
},
{
label:"Job search costs",
min: monthly * 0.05,
max: monthly * 0.15
},
{
label:"Skill upgrade",
min: monthly * 0.3,
max: monthly * 0.8
}
];

break;


case "disaster":

rows = [
{
label:"Home repair",
min: oneTime * 0.8,
max: oneTime * 1.6
},
{
label:"Temporary relocation",
min: monthly * 0.5,
max: monthly
},
{
label:"Emergency supplies",
min: monthly * 0.1,
max: monthly * 0.3
}
];

break;


case "war":

rows = [
{
label:"Food supply buffer",
min: monthly * 0.5,
max: monthly
},
{
label:"Fuel & transport",
min: monthly * 0.3,
max: monthly * 0.6
},
{
label:"Inflation buffer",
min: monthly * duration,
max: monthly * duration * 1.8
}
];

break;
}


// ── Calculate total range ──

const totalMin = rows.reduce((sum,r)=>sum+r.min,0);
const totalMax = rows.reduce((sum,r)=>sum+r.max,0);


// ── Format rows ──

const round100Down = (n: number) => Math.floor(n / 100) * 100;
const round100Up   = (n: number) => Math.ceil(n  / 100) * 100;
const fmtRange = (min: number, max: number) =>
  `RM ${round100Down(min).toLocaleString()} – RM ${round100Up(max).toLocaleString()}`;

const formatted: PreparationItem[] = rows.map(r=>({
label:r.label,
value: fmtRange(r.min, r.max)
}));


// ── Add TOTAL row ──

formatted.push({
  label:"Total estimated",
  value: fmtRange(totalMin, totalMax),
  isTotal:true
})

return formatted;
}

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
  const { width: screenWidth } = Dimensions.get("window");
  const [containerWidth, setContainerWidth] = useState(0);
  const [savingInput, setSavingInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [shockCache, setShockCache] = useState<Record<string, ShockReport>>({});
  const [shockLoading, setShockLoading] = useState(false);
  const [shockError, setShockError] = useState<string | null>(null);

  const tabs = [
    { key: "A", label: "Illness", icon: "medkit-outline" },
    { key: "B", label: "Job Loss", icon: "briefcase-outline" },
    { key: "C", label: "Nature Disaster", icon: "thunderstorm-outline" },
    { key: "D", label: "War", icon: "shield-outline" },
  ] as const;

  const tabWidth = containerWidth / tabs.length;

  useEffect(() => {
    api.get<Plan>("/contingency/")
      .then((data) => setPlan(data))
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch shock simulation for the active tab (cached per tab)
  useEffect(() => {
    const shockType = TAB_SHOCK[selectedTab];
    if (shockCache[selectedTab]) return;   // already loaded
    setShockLoading(true);
    setShockError(null);
    api.get<ShockReport>(`/contingency/shock/${shockType}`)
      .then((data) => setShockCache((prev) => ({ ...prev, [selectedTab]: data })))
      .catch((e) => setShockError(e.message ?? "Could not load simulation."))
      .finally(() => setShockLoading(false));
  }, [selectedTab]);

  const fmt = (n: number) =>
    n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── White card content per tab ────────────────────────────────────────────
  function renderWhiteCard() {
    // Plan still loading
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

    const shock = shockCache[selectedTab];

    // Shock still loading
    if (shockLoading && !shock) {
      return (
        <View style={styles.cardInner}>
          <ActivityIndicator size="small" color="#1E3A8A" />
          <Text style={styles.cardLoadingText}>Running scenario simulation…</Text>
        </View>
      );
    }

    // Shock error fallback — show static risk indicators
    if (shockError || !shock) {
      const relevant = TAB_RELEVANT[selectedTab];
      const fired = plan.active_indicators.filter((i) => relevant.includes(i.name));
      return (
        <View style={styles.cardInner}>
          <Text style={styles.cardContext}>{TAB_CONTEXT[selectedTab]}</Text>
          {shockError && (
            <Text style={[styles.riskDetail, { color: "#F59E0B", marginBottom: 8 }]}>
              ⚠ Live simulation unavailable — showing risk indicators
            </Text>
          )}
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
                    <Text style={styles.riskLabel}>{INDICATOR_LABEL[ind.name] ?? ind.name}</Text>
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
        </View>
      );
    }

    // ── Full shock simulation card ──────────────────────────────────────────
    const fundMonths = Math.min(shock.months_until_broke ?? shock.duration_months, shock.duration_months);
    const coveragePct = Math.min((fundMonths / shock.duration_months) * 100, 100);
    const coverageColor = coveragePct >= 80 ? "#10B981" : coveragePct >= 40 ? "#F59E0B" : "#EF4444";
    const prepItems = getPreparationItems(shock);
    return (
      <View style={styles.cardInner}>

        {/* 1 ── Severity badge */}
        <View style={styles.severityRow}>
          <View style={[styles.severityBadge, {
            backgroundColor: shock.severity_label === "critical" ? "#FEE2E2" : shock.severity_label === "severe" ? "#FEE2E2" : "#FEF3C7",
          }]}>
            <Text style={[styles.severityText, {
              color: shock.severity_label === "critical" ? "#7F1D1D" : shock.severity_label === "severe" ? "#DC2626" : "#92400E",
            }]}>
              {shock.severity_label === "critical" ? "🔴 Critical scenario" : shock.severity_label === "severe" ? "🔴 Severe scenario" : "🟡 Moderate scenario"}
            </Text>
          </View>
        </View>

        {/* 2 ── Fund coverage bar */}
        <Text style={styles.coverageLabel}>Fund coverage for this scenario</Text>
        <View style={styles.coverageBar}>
          <View style={[styles.coverageFill, {
            width: `${coveragePct}%` as any,
            backgroundColor: coverageColor,
          }]} />
        </View>
        <Text style={[styles.coverageSub, { color: coverageColor }]}>
          {fundMonths.toFixed(1)} / {shock.duration_months} months covered
          {(shock.months_until_broke !== null && shock.months_until_broke !== undefined && shock.months_until_broke < shock.duration_months)
            ? `  ·  fund depleted by month ${Math.ceil(shock.months_until_broke)}`
            : "  ·  fund fully covers this shock"}
        </Text>

        {/* 3 ── Incident cards (regional_risks) — moved above table */}
        {(shock.regional_risks ?? []).length > 0 && (
          <View style={styles.simulationSection}>
            <Text style={styles.simulationTitle}>{TAB_SCENARIO_TITLE[selectedTab]}</Text>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
            >
              {(shock.regional_risks ?? []).slice(0, 5).map((risk, i) => (
                <View key={i} style={styles.simulationCard}>
                  <View style={styles.simTopRow}>
                    <View style={styles.simLeft}>
                      <Text style={styles.simDisease}>{risk.event_title}</Text>
                      <Text style={styles.simLocation}>ASEAN Region</Text>
                      {risk.source_url && (
                        <Text
                          style={styles.simSource}
                          onPress={() => Linking.openURL(risk.source_url)}
                        >
                          {new URL(risk.source_url).hostname.replace("www.", "")}
                        </Text>
                      )}
                    </View>
                    <View style={styles.simDivider} />
                    <View style={styles.simRight}>
                      <Text style={styles.simSurvive}>Survive</Text>
                      <Text style={styles.simMonths}>
                        {shock.months_until_broke ?? shock.duration_months} Months
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 5 ── What you need to prepare */}
        <View style={styles.prepareCard}>
          <Text style={styles.prepareTitle}>💰 WHAT YOU NEED TO PREPARE</Text>
          {prepItems.map((item, index) => (
            <View
              key={index}
              style={[
                styles.prepareRow,
                item.isTotal && { borderTopWidth: 1, borderTopColor: "#D1D5DB", borderBottomWidth: 0, marginTop: 6, paddingTop: 12 },
              ]}
            >
              <Text style={[styles.prepareLabel, item.isTotal && { fontWeight: "700", color: "#111827" }]}>
                {item.label}
              </Text>
              <Text style={[styles.prepareValue, item.isTotal && { color: "#DC2626", fontSize: 15 }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* 6 ── Monthly projection — one card per month, no squishing */}
        <View style={styles.analysisCard}>
          <Text style={styles.analysisCardTitle}>Monthly Projection</Text>
          {(shock.monthly_projected ?? []).map((m) => {
            const analysis =
              m.month === 1 ? "Initial financial shock"
              : m.month === 2 ? "Savings buffer shrinking"
              : m.month === shock.duration_months ? "Pressure peaks here"
              : "Ongoing financial strain";
            const isShortfall = m.deficit < 0;
            return (
              <View key={m.month} style={styles.monthCard}>
                <View style={styles.monthCardHeader}>
                  <Text style={styles.monthCardMonth}>Month {m.month}</Text>
                  <Text style={styles.monthCardAnalysis}>{analysis}</Text>
                </View>
                <View style={styles.monthMoneyRow}>
                  <View style={styles.monthMoneyCol}>
                    <Text style={styles.monthMoneyLabel}>Income</Text>
                    <Text style={styles.monthMoneyValue}>RM{fmt(m.income)}</Text>
                  </View>
                  <View style={[styles.monthMoneyCol, styles.monthMoneyColMid]}>
                    <Text style={styles.monthMoneyLabel}>Expenses</Text>
                    <Text style={styles.monthMoneyValue}>RM{fmt(m.expense)}</Text>
                  </View>
                  <View style={styles.monthMoneyCol}>
                    <Text style={styles.monthMoneyLabel}>Net</Text>
                    <Text style={[styles.monthMoneyValue, { color: isShortfall ? "#EF4444" : "#10B981" }]}>
                      {isShortfall ? "−" : "+"}RM{fmt(Math.abs(m.deficit))}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* 7 ── Do this today */}
        {shock.action_today ? (
          <View style={styles.actionBox}>
            <Text style={styles.actionTitle}>✅ Do this today</Text>
            <Text style={styles.actionText}>{shock.action_today}</Text>
          </View>
        ) : null}

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
          
        {tabs.map((tab) => (
  <TouchableOpacity
    key={tab.key}
    style={[
      styles.tabButton,
      selectedTab === tab.key && styles.tabButtonActive
    ]}
    onPress={() => {
      setSelectedTab(tab.key);
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
        selectedTab === tab.key && { color: "#1E3A8A" }
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
  minHeight: 320,
  backgroundColor: "#FFFFFF",
  borderRadius: 25,
  elevation: 8,
  overflow: "hidden",
},

  progressTabs: {
    position: "absolute",
    alignContent: "center",
    paddingBottom : 6,
    top: -25,   // makes it float into card
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1E3A8A",
    padding: 4,
    borderRadius: 25,
    elevation: 6,
    zIndex: 10,
  },

  tabBox: {
    width: 50,
    height: 50,
    backgroundColor: "#C4C4C4",
    borderRadius: 12,
  },


  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    color: "#BFDBFE",
    textAlign: "center",
  },

  tabLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },

indicator: {
  position: "absolute",
  bottom: 6,
  backgroundColor: "#FFFFFF",
  borderRadius: 2,
},

// ── White card inner styles ────────────────────────────────────────────────
cardInner: {
  padding: 16,
  paddingTop: 52,   // leaves room below the floating tab bar (~35px tall + 17px gap)
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
riskUrl: {
  fontSize: 10,
  color: "#3B82F6",
  marginTop: 2,
  textDecorationLine: "underline",
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
    marginTop: 24,
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

  // ── Shock simulation card styles ─────────────────────────────────────────
  severityRow: {
    marginTop:15,
    marginBottom: 10,
  },
  severityBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  severityText: {
    fontSize: 12,
    fontWeight: "600",
  },
  coverageLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  coverageBar: {
    height: 10,
    backgroundColor: "#E5E7EB",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 4,
  },
  coverageFill: {
    height: "100%",
    borderRadius: 5,
  },
  coverageSub: {
    fontSize: 11,
    marginBottom: 10,
  },

  tableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  tableRowRed: {
    backgroundColor: "#FFF5F5",
  },
  tableCell: {
    fontSize: 11,
    color: "#374151",
    flex: 1,
    textAlign: "center",
  },
  narrativeBox: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  narrativeTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E3A8A",
    marginBottom: 6,
  },
  narrativeText: {
    fontSize: 12,
    color: "#374151",
    lineHeight: 18,
  },
  actionBox: {
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    padding: 12,
    marginTop: 2,
    borderLeftWidth: 3,
    borderLeftColor: "#10B981",
  },
  actionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#065F46",
    marginBottom: 4,
  },
  actionText: {
    fontSize: 12,
    color: "#065F46",
    lineHeight: 17,
  },

  tabButton: {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 10,
  paddingVertical: 6,   // ← same padding for all tabs
  borderRadius: 20,
},

tabButtonActive: {
  backgroundColor: "#FFFFFF",
},

simulationRow:{
flexDirection:"row",
alignItems:"center",
paddingVertical:12
},

simulationDivider:{
  height:1,
  backgroundColor:"#E5E7EB",
  marginVertical:10
},

simulationSurviveText:{
fontSize:12,
color:"#6B7280"
},

simulationSurviveMonth:{
fontSize:16,
fontWeight:"700",
color:"#111827"
},

tableMonth:{
flex:0.6,
fontSize:11,
textAlign:"center"
},

tableMoney:{
flex:1,
fontSize:11,
textAlign:"center"
},

tableAnalysis:{
flex:2,
fontSize:11,
color:"#6B7280"
},

  analysisCard:{
    backgroundColor:"#FFFFFF",
    borderRadius:16,
    padding:16,
    marginTop:12,
    marginBottom:18,
    shadowColor:"#000",
    shadowOpacity:0.05,
    shadowRadius:8,
    elevation:3
  },

  analysisCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 12,
    letterSpacing: 0.3,
  },

  monthCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },

  monthCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  monthCardMonth: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
  },

  monthCardAnalysis: {
    fontSize: 11,
    color: "#6B7280",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },

  monthMoneyRow: {
    flexDirection: "row",
  },

  monthMoneyCol: {
    flex: 1,
    alignItems: "flex-start",
  },

  monthMoneyColMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 8,
    marginHorizontal: 4,
  },

  monthMoneyLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  monthMoneyValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },

simulationEvent:{
  fontSize:16,
  fontWeight:"600",
  lineHeight:22,
  marginBottom:6
},

simulationUrl:{
  fontSize:12,
  color:"#3B82F6",
  marginBottom:10
},

simulationSurvive:{
  alignItems:"center"
},

simviveLabel:{
  fontSize:13,
  color:"#6B7280"
},

simulationMonths:{
  fontSize:22,
  fontWeight:"700",
  color:"#1E3A8A"
},

/* ───────── Simulation Section ───────── */

simulationSection:{
  marginTop:26
},

simulationTitle:{
  fontSize:18,
  fontWeight:"700",
  marginBottom:16,
  color:"#111827"
},

/* ───────── Swipe Card ───────── */

simulationCard:{
  width: INCIDENT_CARD_W,
  backgroundColor:"#ebf0f7",
  borderRadius:20,
  padding:20,

  shadowColor:"#000",
  shadowOpacity:0.05,
  shadowRadius:12,
  elevation:4
},

/* ───────── Top Row Layout ───────── */

simTopRow:{
  flexDirection:"row",
  alignItems:"center",
  marginBottom:16
},

simLeft:{
  flex:1
},

simRight:{
  width:110,
  alignItems:"center"
},

simDivider:{
  width:1,
  height:60,
  backgroundColor:"#E5E7EB",
  marginHorizontal:16
},

/* ───────── Left Column Text ───────── */

simDisease:{
  fontSize:18,
  fontWeight:"600",
  color:"#111827",
  marginBottom:4
},

simLocation:{
  fontSize:14,
  color:"#6B7280"
},

simSource:{
  fontSize:12,
  color:"#2563EB",
  marginTop:4
},

/* ───────── Right Column (Survival) ───────── */

simSurvive:{
  fontSize:13,
  color:"#6B7280"
},

simMonths:{
  fontSize:24,
  fontWeight:"700",
  color:"#1E3A8A",
  marginTop:2
},

/* ───────── Preparation Table ───────── */

prepareCard:{
  marginTop:10,
  backgroundColor:"#F9FAFB",
  borderRadius:14,
  padding:14
},

prepareTitle:{
  fontSize:12,
  fontWeight:"700",
  color:"#6B7280",
  marginBottom:10,
  letterSpacing:0.5
},

prepareRow:{
    flexDirection:"row",
    justifyContent:"space-between",
    alignItems:"flex-start",
    paddingVertical:10,
    borderBottomWidth:1,
    borderBottomColor:"#E5E7EB"
  },

  prepareLabel:{
    fontSize:13,
    color:"#374151",
    flex:1,
    paddingRight: 8,
  },

  prepareValue:{
    fontSize:13,
    fontWeight:"600",
    color:"#111827",
    textAlign:"right",
    flexShrink:1,
    maxWidth:"58%",
  },

prepareTotal:{
  flexDirection:"row",
  justifyContent:"space-between",
  marginTop:12
},

prepareTotalLabel:{
  fontSize:15,
  fontWeight:"700",
  color:"#111827"
},

prepareTotalValue:{
  fontSize:15,
  fontWeight:"700",
  color:"#DC2626"
},

});
