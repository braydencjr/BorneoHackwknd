import { BASE_URL } from "@/services/api";
import { authService } from "@/services/authService";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import CategoryDonut from "../../components/category_donut";
import DonutProgress from "../../components/donut_progress";

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<
    {
      title: string;
      body: string;
      isPositive: boolean;
    }[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      const fetchUser = async () => {
        try {
//           const token = await SecureStore.getItemAsync("accessToken");
//           if (!token) return;

//           const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
//             headers: { Authorization: `Bearer ${token}` },
//           });

//           const data = await res.json();
          
          // TODO: Determine which works, currently default to the code from the main branch

          const data = await authService.me();
          if (!data) {
            router.replace("/loginpage");
            return;
          }
          setUser(data);
        } catch (error) {
          console.error("Failed to fetch user:", error);
        }
      };

      fetchUser();
    }, []),
  );

  const router = useRouter();

  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");
  const [income, setIncome] = useState(0);
  const [outcome, setOutcome] = useState(0);
const [percentage, setPercentage] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [incomePercentage, setIncomePercentage] = useState(0);
  const [outcomePercentage, setOutcomePercentage] = useState(0);

  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorPosition = useState(new Animated.Value(0))[0];

  const [fundPlan, setFundPlan] = useState<{
    current_progress: number;
    target_amount: number;
    progress_percentage: number;
    months_to_goal: number | null;
    monthly_savings_target: number;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) return;

          const res = await fetch(`${BASE_URL}/api/v1/summary/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();

          const income = Number(data.income) || 0;
          const outcome = Number(data.outcome) || 0;

          setIncome(income);
          setOutcome(outcome);

          const total = income + outcome;
          const incomePercentage = total > 0 ? (income / total) * 100 : 0;
          const outcomePercentage = total > 0 ? (outcome / total) * 100 : 0;

          setIncomePercentage(incomePercentage);
          setOutcomePercentage(outcomePercentage);
          console.log("Summary:", data);
        } catch (error) {
          console.error("Failed to fetch summary:", error);
        }
      };

      fetchData();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      const fetchTransactions = async () => {
        try {
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) return;

          const res = await fetch(`${BASE_URL}/api/v1/transactions/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          setTransactions(data);
        } catch (error) {
          console.error("Failed to fetch transactions:", error);
        }
      };

      fetchTransactions();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const fetchAiInsight = async () => {
        try {
          setAiInsightsLoading(true);
          setAiInsights([]);
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) {
            setAiInsightsLoading(false);
            return;
          }
          const res = await fetch(`${BASE_URL}/api/v1/summary/suggestions`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            setAiInsights([]);
            return;
          }
          const data = await res.json();
          const cards = (data?.cards || [])
            .filter((card: any) => card?.body)
            .slice(0, 3)
            .map((card: any) => ({
              title: card.title || "AI Spending Insight",
              body: String(card.body),
              isPositive: Boolean(card.isPositive),
            }));
          setAiInsights(cards);
        } catch (error) {
          console.error("Failed to fetch AI insight:", error);
          setAiInsights([]);
        } finally {
          setAiInsightsLoading(false);
        }
      };

      const fetchFundPlan = async () => {
        try {
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) return;
          const res = await fetch(`${BASE_URL}/api/v1/contingency/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          setFundPlan(data);
        } catch (error) {
          console.error("Failed to fetch fund plan:", error);
        }
      };

      fetchAiInsight();
      fetchFundPlan();
    }, [])
  );

  const tabData = {
    A: { percentage: percentage, color: "#7CB518", title: "Income vs Outcome" },
    B: { percentage: 60, color: "#4C8DAE", title: "Income" },
    C: { percentage: 46, color: "#F59E0B", title: "Outcome" },
    D: { percentage: 22, color: "#E4572E", title: "Transactions" },
  };

  const tabs = [
    { key: "A", label: "Overview", icon: "grid-outline" },
    { key: "B", label: "Income", icon: "arrow-down-circle-outline" },
    { key: "C", label: "Expenses", icon: "arrow-up-circle-outline" },
    { key: "D", label: "Transactions", icon: "receipt-outline" },
  ] as const;

  const TABS_SIDE_PADDING = 15;
  const tabWidth =
    Math.max(containerWidth - TABS_SIDE_PADDING * 2, 0) / tabs.length;
  const indicatorWidth = tabWidth * 0.5;
  const indicatorBaseLeft = TABS_SIDE_PADDING + (tabWidth - indicatorWidth) / 2;

  function getMerchantCode(name: string) {
    if (!name) return "TXN";
    const words = name.split(" ");
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  const FIXED_CATEGORIES = [
    "Rent",
    "Utilities",
    "Subscription",
    "Insurance",
    "Loan",
    "Installment",
    "Bill",
    "Mortgage",
  ];
  const BNPL_KEYWORDS = [
    "bnpl",
    "installment",
    "spaylater",
    "atome",
    "split",
    "hoolah",
    "paylater",
    "grab paylater",
    "shopee paylater",
    "akulaku",
    "kredivo",
  ];

  function isFixed(category: string): boolean {
    return FIXED_CATEGORIES.some((c) =>
      category?.toLowerCase().includes(c.toLowerCase()),
    );
  }

  function isBNPL(category: string, merchant: string): boolean {
    const haystack = `${category ?? ""} ${merchant ?? ""}`.toLowerCase();
    return BNPL_KEYWORDS.some((k) => haystack.includes(k));
  }

  function getHealthLabel(rate: number): string {
    if (rate < 50) return "Excellent";
    if (rate < 75) return "Good";
    if (rate < 100) return "Moderate";
    return "Critical";
  }

  function getHealthColor(rate: number): string {
    if (rate < 50) return "#16A34A";
    if (rate < 75) return "#D97706";
    if (rate < 100) return "#F97316";
    return "#DC2626";
  }

  const incomeTransactions = transactions.filter((t) => t.type === "income");

  const incomeTotal = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

  const incomeCategories = Object.values(
    incomeTransactions.reduce((acc: any, t) => {
      if (!acc[t.category]) {
        acc[t.category] = {
          category: t.category,
          amount: 0,
        };
      }

      acc[t.category].amount += t.amount;

      return acc;
    }, {}),
  )
    .map((c: any) => ({
      ...c,
      percentage: incomeTotal > 0 ? (c.amount / incomeTotal) * 100 : 0,
    }))
    .sort((a: any, b: any) => b.amount - a.amount);

  const outcomeTransactions = transactions.filter((t) => t.type === "expense");

  const outcomeTotal = outcomeTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0,
  );

  const outcomeCategories = Object.values(
    outcomeTransactions.reduce((acc: any, t) => {
      if (!acc[t.category]) {
        acc[t.category] = {
          category: t.category,
          amount: 0,
        };
      }

      acc[t.category].amount += Math.abs(t.amount);

      return acc;
    }, {}),
  )
    .map((c: any) => ({
      ...c,
      percentage: outcomeTotal > 0 ? (c.amount / outcomeTotal) * 100 : 0,
    }))
    .sort((a: any, b: any) => b.amount - a.amount);

  const rankedTopExpenses = [...outcomeCategories]
    .sort((a: any, b: any) => b.amount - a.amount)
    .slice(0, 3);

  const spendRate =
    income > 0 ? (outcome / income) * 100 : outcome > 0 ? 100 : 0;
  const healthLabel = getHealthLabel(spendRate);
  const healthColor = getHealthColor(spendRate);
  const savings = income - outcome;

  const fixedExpenseTotal = outcomeTransactions
    .filter((t) => isFixed(t.category))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const flexibleExpenseTotal = outcomeTransactions
    .filter((t) => !isFixed(t.category))
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const fixedPct =
    outcomeTotal > 0 ? (fixedExpenseTotal / outcomeTotal) * 100 : 0;
  const flexiblePct = 100 - fixedPct;

  const bnplTransactions = transactions.filter((t) =>
    isBNPL(t.category, t.merchant_name || ""),
  );
  const bnplTotal = bnplTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0,
  );
  const bnplPct = outcomeTotal > 0 ? (bnplTotal / outcomeTotal) * 100 : 0;

  const monthlySpending: Record<string, number> = transactions
    .filter((t) => t.type === "expense")
    .reduce(
      (acc, t) => {
        const key = new Date(t.created_at).toLocaleString("default", {
          month: "short",
          year: "2-digit",
        });
        acc[key] = (acc[key] || 0) + Math.abs(t.amount);
        return acc;
      },
      {} as Record<string, number>,
    );

  const monthlyEntries = Object.entries(monthlySpending).slice(-4);
  const maxMonthlySpend = Math.max(...monthlyEntries.map(([, v]) => v), 1);

  const currentMonth = new Date().toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  function renderTabContent() {
    // INCOME TAB
    if (selectedTab === "B") {
      return (
        <View style={styles.donutGrid}>
          {incomeCategories.map((c, index) => (
            <View key={index} style={styles.donutItem}>
              <CategoryDonut
                percentage={Math.round(c.percentage)}
                color="#22C55E"
              />
              <Text style={styles.categoryLabel}>{c.category}</Text>

              <Text style={styles.categoryAmount}>RM{c.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      );
    }

    // OUTCOME TAB
    if (selectedTab === "C") {
      return (
        <View style={styles.donutGrid}>
          {outcomeCategories.map((c, index) => (
            <View key={index} style={styles.donutItem}>
              <CategoryDonut
                percentage={Math.round(c.percentage)}
                color="#EF4444"
              />

              <Text style={styles.categoryLabel}>{c.category}</Text>

              <Text style={styles.categoryAmount}>RM{c.amount.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      );
    }

    // TRANSACTIONS TAB
    if (selectedTab === "D") {
      return (
        <View>
          {transactions.map((t) => {
            const isIncome = t.type == "income";
            const isSavings = t.type == "savings";

            return (
              <View key={t.id} style={styles.transactionRow}>
                <View style={styles.transactionLeft}>
                  <View
                    style={[
                      styles.transactionIcon,
                      { backgroundColor: isIncome ? "#E6F9F0" : "#FFECEC" },
                    ]}
                  >
                    <Ionicons
                      name={isSavings ? "shield-checkmark-outline" : isIncome ? "arrow-down" : "arrow-up"}
                      size={16}
                      color={isSavings ? "#1E3A8A" : isIncome ? "#16A34A" : "#DC2626"}
                    />
                  </View>

                  <View>
                    <Text style={styles.categoryText}>{t.category}</Text>

                    <Text style={styles.merchantName}>
                      {getMerchantCode(t.merchant_name)}
                    </Text>

                    <Text style={styles.transactionDate}>
                      {new Date(t.created_at).toDateString()}
                    </Text>
                  </View>
                </View>

                <View style={styles.transactionRight}>
                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: isIncome ? "#16A34A" : "#DC2626" },
                    ]}
                  >
                    {isSavings ? "\u2192 Fund" : isIncome ? "+" : "-"} RM{Math.abs(t.amount).toFixed(2)}
                  </Text>

                  {!isSavings && (
                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() =>
                      router.push({
                        pathname: "/receipt",
                        params: { image: t.receipt_image },
                      })
                    }
                  >
                    <Text style={styles.receiptText}>View</Text>
                  </TouchableOpacity>
                  )}

                </View>
              </View>
            );
          })}
        </View>
      );
    }

    // OVERVIEW TAB (DEFAULT)
    return (
      <>
        {/* Income vs Expenses */}
        <View style={styles.expenseRow}>
          <View style={{ marginRight: 15 }}>
            <DonutProgress
              income={incomePercentage}
              outcome={outcomePercentage}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Income vs Expenses</Text>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: "#22C55E" }]} />
              <Text style={styles.legendValue}>
                Income: RM{income.toFixed(2)}
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.legendValue}>
                Expenses: RM{outcome.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* AI Insight Chips (Gemini via backend endpoint) */}
        {aiInsightsLoading && (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisSectionTitle}>
              AI Spending Analysis
            </Text>
            <View style={styles.aiLoadingRow}>
              <ActivityIndicator size="small" color="#1E3A8A" />
              <Text style={styles.aiLoadingText}>Generating analysis...</Text>
            </View>
          </View>
        )}

        {!aiInsightsLoading && aiInsights.length > 0 && (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisSectionTitle}>
              AI Spending Analysis
            </Text>
            {aiInsights.map((insight, index) => (
              <View
                key={`${insight.title}-${index}`}
                style={styles.insightCard}
              >
                <Ionicons
                  name={
                    insight.isPositive ? "checkmark-circle" : "close-circle"
                  }
                  size={18}
                  color={insight.isPositive ? "#16A34A" : "#DC2626"}
                />
                <Text style={styles.insightText}>
                  {insight.title}: {insight.body}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Fixed vs Flexible */}
        {outcomeTotal > 0 && (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisSectionTitle}>
              Fixed vs Flexible Expenses
            </Text>
            <View style={styles.splitBar}>
              <View
                style={[
                  styles.splitBarFixed,
                  { flex: Math.max(fixedPct, 0.1) },
                ]}
              />
              <View
                style={[
                  styles.splitBarFlex,
                  { flex: Math.max(flexiblePct, 0.1) },
                ]}
              />
            </View>
            <View style={styles.splitLegend}>
              <View style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: "#1E3A8A" }]} />
                <Text style={styles.splitLabel}>
                  Fixed {fixedPct.toFixed(0)}% — RM
                  {fixedExpenseTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: "#93C5FD" }]} />
                <Text style={styles.splitLabel}>
                  Flexible {flexiblePct.toFixed(0)}% — RM
                  {flexibleExpenseTotal.toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* BNPL / High-Risk Alert */}
        {bnplTransactions.length > 0 && (
          <View style={styles.riskCard}>
            <Text style={styles.riskIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.riskTitle}>
                High-Risk: BNPL / Deferred Payments
              </Text>
              <Text style={styles.riskBody}>
                {bnplTransactions.length} deferred payment
                {bnplTransactions.length > 1 ? "s" : ""} totalling RM
                {bnplTotal.toFixed(2)} ({bnplPct.toFixed(0)}% of spend).
                Excessive BNPL usage can mask overspending and lead to debt
                accumulation.
              </Text>
            </View>
          </View>
        )}

        {/* Spending Trend */}
        {monthlyEntries.length > 1 && (
          <View style={styles.analysisCard}>
            <Text style={styles.analysisSectionTitle}>
              Monthly Spending Trend
            </Text>
            {monthlyEntries.map(([month, amount]) => (
              <View key={month} style={styles.trendRow}>
                <Text style={styles.trendMonth}>{month}</Text>
                <View style={styles.trendBarTrack}>
                  <View
                    style={[
                      styles.trendBarFill,
                      {
                        width: `${Math.round((amount / maxMonthlySpend) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.trendAmount}>RM{amount.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Top */}
      <View style={styles.topRow}>
        <Image
          source={{
            uri: user?.profile_photo
              ? `${BASE_URL}/${user.profile_photo}`
              : "https://cdn-icons-png.flaticon.com/512/847/847969.png",
          }}
          style={styles.profileCircle}
        />

        <Text style={[styles.healthText, { color: healthColor }]}>
          Financial Health: {healthLabel}
        </Text>

        <TouchableOpacity
          style={styles.scanBox}
          onPress={() => router.push("/scanpage")}
        >
          <Ionicons name="scan-outline" size={26} color="#1E3A8A" />
        </TouchableOpacity>
      </View>

      {/* Savings Card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Net Savings</Text>
            <Text
              style={[
                styles.amount,
                { color: savings >= 0 ? "#1E3A8A" : "#DC2626" },
              ]}
            >
              {savings >= 0 ? "+" : "-"}RM {Math.abs(savings).toFixed(2)}
            </Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Top Expenses</Text>
            {rankedTopExpenses.map((c: any, i: number) => (
              <Text key={i} style={styles.tip}>
                {i + 1}. {c.category}
              </Text>
            ))}
            {rankedTopExpenses.length === 0 && (
              <Text style={styles.tip}>No expenses yet</Text>
            )}
          </View>
        </View>
      </View>


      {/* Main Card */}
      {fundPlan && (
        <View style={styles.fundWidget}>
          <View style={styles.fundWidgetHeader}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#1E3A8A" />
            <Text style={styles.fundWidgetTitle}>Emergency Fund</Text>
            {fundPlan.months_to_goal !== null && (
              <View style={styles.fundBadge}>
                <Text style={styles.fundBadgeText}>~{fundPlan.months_to_goal} mo to goal</Text>
              </View>
            )}
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(fundPlan.progress_percentage, 100)}%` },
              ]}
            />
          </View>
          <View style={styles.fundWidgetFooter}>
            <Text style={styles.fundWidgetSaved}>
              RM{fundPlan.current_progress.toFixed(2)} saved
            </Text>
            <Text style={styles.fundWidgetTarget}>
              of RM{fundPlan.target_amount.toFixed(2)} · {fundPlan.progress_percentage.toFixed(0)}%
            </Text>
          </View>
          <Text style={styles.fundWidgetHint}>
            Monthly saving goal: RM{fundPlan.monthly_savings_target.toFixed(2)}
          </Text>
        </View>
      )}

      {/* Main Card */}
      <View style={{ marginTop: 40 }}>
        <View style={styles.cardLarge}>
          {/* Tabs */}
          <View
            style={styles.progressTabs}
            onLayout={(e) => {
              setContainerWidth(e.nativeEvent.layout.width);
            }}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                {
                  width: indicatorWidth,
                  left: indicatorBaseLeft,
                  transform: [{ translateX: indicatorPosition }],
                },
              ]}
            />

            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, { width: `${100 / tabs.length}%` }]}
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
                  color={selectedTab === tab.key ? "#FFFFFF" : "#BFDBFE"}
                />

                <Text
                  style={[
                    styles.tabLabel,
                    selectedTab === tab.key && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.monthText}>{currentMonth}</Text>

          {renderTabContent()}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    padding: 20,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  profileCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: "#000",
  },

  healthText: {
    flex: 1,
    textAlign: "center",
  },

  scanBox: {
    width: 60,
    height: 60,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    elevation: 4,
  },

  cardLarge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 25,
    marginBottom: 20,
    elevation: 4,
  },

  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  resilienceRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardTitle: {
    fontSize: 16,
    marginBottom: 5,
  },

  amount: {
    fontSize: 22,
    color: "#1E3A8A",
    fontWeight: "600",
  },

  tip: {
    fontSize: 14,
  },

  verticalDivider: {
    width: 1,
    height: 60,
    backgroundColor: "#ccc",
    marginHorizontal: 10,
  },

  progressTabs: {
    position: "absolute",
    top: -25, // makes it float into card
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#1E3A8A",
    padding: 15,
    borderRadius: 25,
    elevation: 6,
    zIndex: 10,
  },

  tabBox: {
    width: 40,
    height: 40,
    backgroundColor: "#ccc",
    borderRadius: 6,
  },

  activeTab: {
    backgroundColor: "#FFFFFF",
  },

  monthText: {
    textAlign: "center",
    marginBottom: 15,
  },

  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  incomeBox: {
    backgroundColor: "#F2F2F2",
    padding: 10,
    borderRadius: 15,
    alignSelf: "flex-start",
  },

  bigNumber: {
    fontSize: 40,
    fontWeight: "bold",
    color: "#1E3A8A",
  },

  monthLabel: {
    fontSize: 14,
  },

  sectionTitle: {
    marginBottom: 10,
    fontSize: 14,
  },

  progressBar: {
    height: 20,
    backgroundColor: "#E0E0E0",
    borderRadius: 10,
    overflow: "hidden",
  },

  progressFill: {
    width: "60%",
    height: "100%",
    backgroundColor: "#1E3A8A",
  },

  indicator: {
    position: "absolute",
    bottom: 6, // sit near bottom
    height: 2,
    backgroundColor: "#FDE68A",
    borderRadius: 2,
  },

  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    zIndex: 2,
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

  activeTabLabel: {
    color: "#1E3A8A",
    fontWeight: "600",
  },

  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  transactionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  transactionRight: {
    alignItems: "flex-end",
  },

  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  merchantCode: {
    fontWeight: "600",
    fontSize: 15,
  },

  transactionAmount: {
    fontWeight: "700",
  },

  receiptButton: {
    marginTop: 4,
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  receiptText: {
    fontSize: 10,
    color: "#fff",
  },

  categoryText: {
    fontSize: 16,
    fontWeight: "600",
  },

  merchantName: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },

  transactionDate: {
    fontSize: 12,
    color: "#999",
  },

  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },

  donutGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 10,
  },

  donutItem: {
    width: "30%",
    alignItems: "center",
    marginBottom: 20,
  },

  categoryLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "600",
  },

  categoryAmount: {
    fontSize: 11,
    color: "#666",
  },

  legendValue: {
    fontSize: 13,
    color: "#374151",
  },

  insightCard: {
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },

  insightIcon: {
    fontSize: 20,
  },

  insightText: {
    flex: 1,
    fontSize: 13,
    color: "#1E3A8A",
    fontWeight: "500",
    lineHeight: 19,
  },

  analysisCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  analysisSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
    color: "#0F172A",
  },

  splitBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 8,
  },

  splitBarFixed: {
    backgroundColor: "#1E3A8A",
  },

  splitBarFlex: {
    backgroundColor: "#93C5FD",
  },

  splitLegend: {
    gap: 4,
  },

  splitLabel: {
    fontSize: 12,
    color: "#475569",
  },

  riskCard: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#F97316",
    gap: 8,
  },

  riskIcon: {
    fontSize: 18,
    marginTop: 1,
  },

  riskTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 3,
  },

  riskBody: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 17,
  },

  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },

  trendMonth: {
    width: 52,
    fontSize: 12,
    color: "#475569",
  },

  trendBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
  },

  trendBarFill: {
    height: "100%",
    backgroundColor: "#1E3A8A",
    borderRadius: 4,
  },

  trendAmount: {
    width: 62,
    fontSize: 12,
    color: "#0F172A",
    textAlign: "right",
  },

  aiLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },

  aiLoadingText: {
    fontSize: 13,
    color: "#334155",
  },
  fundWidget: {
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },

  fundWidgetHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },

  fundWidgetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
    flex: 1,
  },

  fundBadge: {
    backgroundColor: "#1E3A8A",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  fundBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },

  fundWidgetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },

  fundWidgetSaved: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E3A8A",
  },

  fundWidgetTarget: {
    fontSize: 12,
    color: "#64748B",
  },

  fundWidgetHint: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
  },

});
