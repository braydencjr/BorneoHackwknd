import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
    PaymentMethod,
    SpendingAnalysisResponse,
    SpendingTransactionIn,
    spendingService,
} from "../../services/spendingService";

// ── Spending categories & payment methods ──────────────────────────────────
const CATEGORIES = [
  "f&b",
  "electronics",
  "loan",
  "stationeries",
  "rent",
  "utilities",
  "groceries",
  "transport",
  "entertainment",
  "shopping",
  "insurance",
  "subscriptions",
];

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "debit",
  "credit",
  "bnpl",
  "transfer",
  "other",
];

// ── Default category rules ─────────────────────────────────────────────────
const DEFAULT_CATEGORY_RULES = {
  fixed_categories: ["loan", "rent", "insurance", "utilities", "subscriptions"],
  flexible_categories: [
    "f&b",
    "electronics",
    "entertainment",
    "shopping",
    "stationeries",
    "transport",
    "groceries",
  ],
  essential_categories: [
    "loan",
    "rent",
    "utilities",
    "groceries",
    "transport",
    "insurance",
  ],
  non_essential_categories: [
    "electronics",
    "entertainment",
    "shopping",
    "stationeries",
    "f&b",
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function severityColor(s: string) {
  if (s === "high") return "#DC2626";
  if (s === "medium") return "#F59E0B";
  return "#FBBF24";
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SuggestionPage() {
  // ── Transaction form state ────────────────────────────────────────────
  const [transactions, setTransactions] = useState<SpendingTransactionIn[]>([]);
  const [showForm, setShowForm] = useState(false);

  // new row temp state
  const [newDate, setNewDate] = useState(todayISO());
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newAmount, setNewAmount] = useState("");
  const [newMethod, setNewMethod] = useState<PaymentMethod>("cash");
  const [newRecurring, setNewRecurring] = useState(false);
  const [newDesc, setNewDesc] = useState("");

  // picker modals
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  // ── Analysis state ────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<SpendingAnalysisResponse | null>(
    null,
  );

  // ── Handlers ──────────────────────────────────────────────────────────
  const addTransaction = () => {
    const amt = parseFloat(newAmount);
    if (!amt || amt <= 0) {
      Alert.alert("Invalid amount", "Please enter a positive number.");
      return;
    }
    setTransactions((prev) => [
      ...prev,
      {
        date: newDate,
        category: newCategory,
        amount: amt,
        payment_method: newMethod,
        is_recurring: newRecurring,
        description: newDesc || undefined,
      },
    ]);
    // reset
    setNewAmount("");
    setNewDesc("");
    setShowForm(false);
  };

  const removeTransaction = (idx: number) => {
    setTransactions((prev) => prev.filter((_, i) => i !== idx));
  };

  const runAnalysis = async () => {
    if (transactions.length === 0) {
      Alert.alert("No data", "Add at least one transaction first.");
      return;
    }
    setLoading(true);
    try {
      const result = await spendingService.analyze({
        currency: "MYR",
        period: {
          start: monthAgoISO(),
          end: todayISO(),
          granularity: "monthly",
        },
        spending: transactions,
        category_rules: DEFAULT_CATEGORY_RULES,
      });
      setAnalysis(result);
    } catch (err: any) {
      Alert.alert("Analysis failed", err.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // ── Render: Analysis results ──────────────────────────────────────────
  if (analysis) {
    return (
      <ScrollView style={styles.container}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setAnalysis(null)}
        >
          <Ionicons name="arrow-back" size={20} color="#1E3A8A" />
          <Text style={styles.backText}>Back to Input</Text>
        </TouchableOpacity>

        {/* Headline */}
        <View style={styles.headlineCard}>
          <Text style={styles.headlineText}>
            {analysis.user_facing_message}
          </Text>
        </View>

        {/* Summary metrics */}
        <View style={styles.card}>
          <Text style={styles.title}>Summary</Text>
          <Text style={styles.headline}>{analysis.summary.headline}</Text>
          <View style={styles.metricsRow}>
            <MetricBadge
              label="Total"
              value={`RM ${analysis.summary.total_spending.toFixed(2)}`}
            />
            <MetricBadge
              label="Non-Essential"
              value={`${(analysis.summary.non_essential_share * 100).toFixed(1)}%`}
            />
            <MetricBadge
              label="BNPL"
              value={`${(analysis.summary.bnpl_share * 100).toFixed(1)}%`}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricBadge
              label="Fixed"
              value={`${(analysis.summary.fixed_share * 100).toFixed(1)}%`}
            />
            <MetricBadge
              label="Flexible"
              value={`${(analysis.summary.flexible_share * 100).toFixed(1)}%`}
            />
          </View>
        </View>

        {/* Risk Flags */}
        {analysis.risk_flags.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Risk Alerts</Text>
            {analysis.risk_flags.map((flag, idx) => (
              <View
                key={idx}
                style={[
                  styles.riskCard,
                  { borderLeftColor: severityColor(flag.severity) },
                ]}
              >
                <View style={styles.riskHeader}>
                  <Text style={styles.riskType}>
                    {flag.type.replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Text
                    style={[
                      styles.riskSeverity,
                      { color: severityColor(flag.severity) },
                    ]}
                  >
                    {flag.severity.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.riskEvidence}>{flag.evidence}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Patterns */}
        <View style={styles.card}>
          <Text style={styles.title}>Spending Patterns</Text>
          {analysis.patterns_over_time.map((p, i) => (
            <Text key={i} style={styles.bullet}>
              • {p}
            </Text>
          ))}
        </View>

        {/* Fixed vs Flexible */}
        <View style={styles.card}>
          <Text style={styles.title}>Fixed vs Flexible</Text>
          <Text style={styles.bullet}>
            Fixed: RM {analysis.fixed_vs_flexible.fixed_amount.toFixed(2)}
          </Text>
          <Text style={styles.bullet}>
            Flexible: RM {analysis.fixed_vs_flexible.flexible_amount.toFixed(2)}
          </Text>
        </View>

        {/* Recommendations */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.title}>Recommendations</Text>
          {analysis.recommendations.map((rec, i) => (
            <Text key={i} style={styles.bullet}>
              • {rec}
            </Text>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ── Render: Transaction input ─────────────────────────────────────────
  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Add Spending Transactions</Text>
        <Text style={styles.subtitle}>
          Enter your spending items, then tap Analyze to get AI insights.
        </Text>

        {/* Current transaction list */}
        {transactions.map((tx, idx) => (
          <View key={idx} style={styles.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.txCategory}>
                {tx.category} — {tx.payment_method}
                {tx.is_recurring ? " (recurring)" : ""}
              </Text>
              <Text style={styles.txAmount}>
                RM {tx.amount.toFixed(2)} · {tx.date}
              </Text>
              {tx.description ? (
                <Text style={styles.txDesc}>{tx.description}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => removeTransaction(idx)}>
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add button */}
        {!showForm && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="add-circle-outline" size={22} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Add Transaction</Text>
          </TouchableOpacity>
        )}

        {/* Inline form */}
        {showForm && (
          <View style={styles.formBox}>
            {/* Date */}
            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={newDate}
              onChangeText={setNewDate}
              placeholder="2026-03-06"
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowCategoryPicker(true)}
            >
              <Text>{newCategory}</Text>
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>

            {/* Amount */}
            <Text style={styles.label}>Amount (RM)</Text>
            <TextInput
              style={styles.input}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
            />

            {/* Payment method */}
            <Text style={styles.label}>Payment Method</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowMethodPicker(true)}
            >
              <Text>{newMethod}</Text>
              <Ionicons name="chevron-down" size={16} color="#666" />
            </TouchableOpacity>

            {/* Recurring toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setNewRecurring(!newRecurring)}
            >
              <Ionicons
                name={newRecurring ? "checkbox" : "square-outline"}
                size={22}
                color="#1E3A8A"
              />
              <Text style={styles.toggleLabel}>Recurring</Text>
            </TouchableOpacity>

            {/* Description */}
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={styles.input}
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="e.g. lunch at cafe"
            />

            {/* Form buttons */}
            <View style={styles.formBtns}>
              <TouchableOpacity
                style={[styles.formActionBtn, { backgroundColor: "#E5E7EB" }]}
                onPress={() => setShowForm(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formActionBtn, { backgroundColor: "#1E3A8A" }]}
                onPress={addTransaction}
              >
                <Text style={{ color: "#FFF" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Analyze button */}
      {transactions.length > 0 && (
        <TouchableOpacity
          style={[styles.analyzeBtn, loading && { opacity: 0.6 }]}
          onPress={runAnalysis}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="analytics-outline" size={22} color="#FFF" />
              <Text style={styles.analyzeBtnText}>
                Analyze Spending ({transactions.length} item
                {transactions.length > 1 ? "s" : ""})
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Category picker modal */}
      <PickerModal
        visible={showCategoryPicker}
        options={CATEGORIES}
        selected={newCategory}
        onSelect={(v) => {
          setNewCategory(v);
          setShowCategoryPicker(false);
        }}
        onClose={() => setShowCategoryPicker(false)}
        title="Select Category"
      />

      {/* Payment method picker modal */}
      <PickerModal
        visible={showMethodPicker}
        options={PAYMENT_METHODS}
        selected={newMethod}
        onSelect={(v) => {
          setNewMethod(v as PaymentMethod);
          setShowMethodPicker(false);
        }}
        onClose={() => setShowMethodPicker(false)}
        title="Select Payment Method"
      />
    </ScrollView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricBadge}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PickerModal({
  visible,
  options,
  selected,
  onSelect,
  onClose,
  title,
}: {
  visible: boolean;
  options: string[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  title: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  styles.modalOption,
                  opt === selected && styles.modalOptionSelected,
                ]}
                onPress={() => onSelect(opt)}
              >
                <Text
                  style={
                    opt === selected
                      ? { color: "#1E3A8A", fontWeight: "600" }
                      : {}
                  }
                >
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={{ color: "#1E3A8A", fontWeight: "600" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
    padding: 20,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backText: { fontSize: 14, color: "#1E3A8A", marginLeft: 4 },

  headlineCard: {
    backgroundColor: "#1E3A8A",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  headlineText: { color: "#FFF", fontSize: 16, fontWeight: "600" },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    elevation: 4,
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 12 },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 16 },
  headline: { fontSize: 14, color: "#333", marginBottom: 12 },

  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  metricBadge: {
    alignItems: "center",
    backgroundColor: "#F0F4FF",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 90,
  },
  metricValue: { fontSize: 16, fontWeight: "700", color: "#1E3A8A" },
  metricLabel: { fontSize: 11, color: "#666", marginTop: 2 },

  riskCard: {
    borderLeftWidth: 4,
    backgroundColor: "#FFF7ED",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  riskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  riskType: { fontWeight: "600", fontSize: 13 },
  riskSeverity: { fontWeight: "700", fontSize: 12 },
  riskEvidence: { fontSize: 12, color: "#555" },

  bullet: { fontSize: 14, marginBottom: 6, lineHeight: 20 },

  // ── Transaction list
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  txCategory: { fontWeight: "600", fontSize: 13 },
  txAmount: { fontSize: 12, color: "#555", marginTop: 2 },
  txDesc: { fontSize: 11, color: "#888", marginTop: 2 },

  // ── Add button
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  addBtnText: { color: "#FFF", marginLeft: 6, fontWeight: "600" },

  // ── Form
  formBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  label: { fontSize: 12, fontWeight: "600", color: "#333", marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    backgroundColor: "#FFF",
  },
  pickerBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    backgroundColor: "#FFF",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  toggleLabel: { marginLeft: 8, fontSize: 14 },
  formBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  formActionBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },

  // ── Analyze button
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    borderRadius: 16,
    padding: 16,
    marginBottom: 40,
  },
  analyzeBtnText: {
    color: "#FFF",
    marginLeft: 8,
    fontWeight: "700",
    fontSize: 16,
  },

  // ── Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: 400,
  },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 12 },
  modalOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  modalOptionSelected: { backgroundColor: "#EFF6FF" },
  modalCloseBtn: { alignItems: "center", marginTop: 12, padding: 10 },
});
