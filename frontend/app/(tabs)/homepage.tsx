import { useOverviewScan } from "@/hooks/use-overview-scan";
import { ScoreData } from "@/hooks/use-resilience-stream";
import { BASE_URL } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import CategoryDonut from "../../components/category_donut";
import DonutProgress from "../../components/donut_progress";

const SCREEN_WIDTH = Dimensions.get("window").width;

function ResilienceCard({ scoreData }: { scoreData: ScoreData | null }) {

  if (!scoreData) {
    return (
      <View style={styles.resilienceCard}>
        <ActivityIndicator size="small" color="#1E3A8A" />
      </View>
    );
  }

  const tierColor =
    scoreData.tier === "strong"
      ? "#16A34A"
      : scoreData.tier === "moderate"
      ? "#D97706"
      : "#DC2626";

  const tierLabel =
    scoreData.tier === "strong"
      ? "RESILIENT"
      : scoreData.tier === "moderate"
      ? "AT RISK"
      : "CRITICAL";

  return (
    <View style={[styles.resilienceCard, { borderColor: tierColor + "40" }]}>

      <View style={styles.resilienceRow}>

        {/* Ring */}
        <View style={[styles.resilienceRing, { borderColor: tierColor }]}>
          <Text style={[styles.resilienceScore, { color: tierColor }]}>
            {Math.round(scoreData.score)}
          </Text>
          <Text style={styles.resilienceMax}>/100</Text>
        </View>

        {/* Right side */}
        <View style={styles.resilienceRight}>
  <View
    style={[
      styles.resilienceTierBadge,
      { backgroundColor: tierColor + "18", borderColor: tierColor + "44" }
    ]}
  >
    <Text style={[styles.resilienceTierText, { color: tierColor }]}>
      {tierLabel}
    </Text>
  </View>

  {/* Verdict text */}
  {scoreData.verdict && (
    <Text style={styles.resilienceVerdict}>
      {scoreData.verdict}
    </Text>
  )}
</View>

      </View>
    </View>
  );
}

export default function HomePage() {

  const [user, setUser] = useState<any>(null);

  useFocusEffect(
  useCallback(() => {
    const fetchUser = async () => {
      try {
        const token = await SecureStore.getItemAsync("accessToken");
        if (!token) return;

        const res = await fetch(`${BASE_URL}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        console.log("Transactions API:", data);
        console.log("INSIGHTS API:", data);
        setTransactions(data.transactions ?? []);

        setUser(data);

      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    };

    fetchUser();
  }, [])
);

  const router = useRouter();

  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");
  const [income, setIncome] = useState(0);
  const [outcome, setOutcome] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [incomePercentage, setIncomePercentage] = useState(0);
  const [outcomePercentage, setOutcomePercentage] = useState(0);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorPosition = useState(new Animated.Value(0))[0];

  const overview = useOverviewScan();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showYearList, setShowYearList] = useState(false);
  const years = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);

  const months = [
  "Jan","Feb","Mar",
  "Apr","May","Jun",
  "Jul","Aug","Sep",
  "Oct","Nov","Dec"
  ];

  const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Others"
];

  const OUTCOME_CATEGORIES = [
  "Shopping",
  "Food & Dining",
  "Entertainment",
  "Groceries",
  "Utilities",
  "Transport",
  "BNPL",
  "Health",
  "Others"
];



  const fetchInsights = async () => {
  try {
    const token = await SecureStore.getItemAsync("accessToken");
    if (!token) return;

    const res = await fetch(`${BASE_URL}/api/v1/summary/suggestions`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();

    console.log("INSIGHTS API:", data);

    setInsights(data.insights || []);

  } catch (error) {
    console.error("Failed to fetch insights:", error);
  }
};

useFocusEffect(
  useCallback(() => {
    fetchInsights();
  },[])
);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        try {
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) return;

          const res = await fetch(`${BASE_URL}/api/v1/summary/`, {
            headers: { Authorization: `Bearer ${token}` }
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
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const fetchTransactions = async () => {
        try {
          const token = await SecureStore.getItemAsync("accessToken");
          if (!token) return;

          const res = await fetch(`${BASE_URL}/api/v1/transactions/`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();

          if (!Array.isArray(data)) {
  console.log("Invalid transactions response:", data);
  setTransactions([]);
  return;
}
          setTransactions(data);
        } catch (error) {
          console.error("Failed to fetch transactions:", error);
        }
      };

      fetchTransactions();
    }, [])
  );


  interface InsightCard {
  type: "praise" | "warning" | "consequence" | "tip";
  icon: string;
  title: string;
  body: string;
}

const INSIGHT_THEME: Record<InsightCard["type"], { bg: string; accent: string; icon_bg: string }> = {
  praise: { bg: "#F0FDF4", accent: "#16A34A", icon_bg: "#DCFCE7" },
  warning: { bg: "#FFFBEB", accent: "#D97706", icon_bg: "#FEF3C7" },
  consequence: { bg: "#FFF1F2", accent: "#E11D48", icon_bg: "#FFE4E6" },
  tip: { bg: "#EFF6FF", accent: "#1D4ED8", icon_bg: "#DBEAFE" },
};

interface InsightCard {
  type: "praise" | "warning" | "consequence" | "tip";
  icon: string;
  title: string;
  body: string;
}

  function InsightCardView({ item }: { item: InsightCard }) {
    const theme = INSIGHT_THEME[item.type];
    const label = { praise: "Great news", warning: "Heads up", consequence: "Watch out", tip: "Tip" }[item.type];
    return (
      <View style={[styles.insightCard, { borderLeftColor: theme.accent }]}>
        <View style={[styles.insightIconBox, { backgroundColor: theme.icon_bg }]}>
          <Text style={styles.insightIconText}>{item.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.insightLabel, { color: theme.accent }]}>{label.toUpperCase()}</Text>
          <Text style={styles.insightTitle}>{item.title}</Text>
          <Text style={styles.insightBody}>{item.body}</Text>
        </View>
      </View>
    );
  }



  const tabData = {
    A: { percentage: percentage, color: "#7CB518", title: "Income vs Outcome" },
    B: { percentage: 60, color: "#4C8DAE", title: "Income" },
    C: { percentage: 46, color: "#F59E0B", title: "Outcome" },
    D: { percentage: 22, color: "#E4572E", title: "Transactions" },
  };

  const tabs = [
    { key: "A", label: "Overview", icon: "grid-outline" },
    { key: "B", label: "Income", icon: "arrow-down-circle-outline" },
    { key: "C", label: "Outcome", icon: "arrow-up-circle-outline" },
    { key: "D", label: "Transactions", icon: "receipt-outline" },
  ] as const;

  const tabWidth = containerWidth / tabs.length;

  function getMerchantCode(name: string) {
    if (!name) return "TXN";
    const words = name.split(" ");
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map(w => w[0]).join("").slice(0, 3).toUpperCase();
  }

  const incomeTransactions = transactions.filter(
    t => t.type === "income"
  );

  const incomeTotal = incomeTransactions.reduce(
    (sum, t) => sum + t.amount,
    0
  );

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

    }, {})
  ).map((c: any) => ({
    ...c,
    percentage: incomeTotal > 0 ? (c.amount / incomeTotal) * 100 : 0
  }));

  const income_categoryMap = new Map(
  incomeCategories.map(c => [c.category, c])
);

const displayIncomeCategories = INCOME_CATEGORIES.map(cat => {
  const data = income_categoryMap.get(cat);

  return {
    category: cat,
    amount: data?.amount ?? 0,
    percentage: data?.percentage ?? 0
  };
});

  const outcomeTransactions = transactions.filter(
    t => t.type === "expense"
  );

  const outcomeTotal = outcomeTransactions.reduce(
    (sum, t) => sum + Math.abs(t.amount),
    0
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

    }, {})
  ).map((c: any) => ({
    ...c,
    percentage: outcomeTotal > 0 ? (c.amount / outcomeTotal) * 100 : 0
  }));

  const outcome_categoryMap = new Map(
  outcomeCategories.map(c => [c.category, c])
);

const displayOutcomeCategories = OUTCOME_CATEGORIES.map(cat => {
  const data = outcome_categoryMap.get(cat);

  return {
    category: cat,
    amount: data?.amount ?? 0,
    percentage: data?.percentage ?? 0
  };
});

  function renderTabContent() {

    // INCOME TAB
    if (selectedTab === "B") {
      return (
        <View style={styles.donutGrid}>
          {displayIncomeCategories.map((c, index) => (
            <View key={index} style={styles.donutItem}>
              <CategoryDonut
                percentage={Math.round(c.percentage)}
                color="#22C55E"
              />
              <Text style={styles.categoryLabel}>{c.category}</Text>

              <Text style={styles.categoryAmount}>
                RM{c.amount.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      );
    }

    // OUTCOME TAB
    if (selectedTab === "C") {
      return (
        <View style={styles.donutGrid}>
          {displayOutcomeCategories.map((c, index) => (
  <View key={index} style={styles.donutItem}>
    <CategoryDonut
      percentage={Math.round(c.percentage)}
      color="#EF4444"
    />

    <Text style={styles.categoryLabel}>{c.category}</Text>

    <Text style={styles.categoryAmount}>
      RM{c.amount.toFixed(2)}
    </Text>
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

            return (
              <View key={t.id} style={styles.transactionRow}>

                <View style={styles.transactionLeft}>

                  <View
                    style={[
                      styles.transactionIcon,
                      { backgroundColor: isIncome ? "#E6F9F0" : "#FFECEC" }
                    ]}
                  >
                    <Ionicons
                      name={isIncome ? "arrow-down" : "arrow-up"}
                      size={16}
                      color={isIncome ? "#16A34A" : "#DC2626"}
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
                      { color: isIncome ? "#16A34A" : "#DC2626" }
                    ]}
                  >
                    {isIncome ? "+" : "-"} RM{Math.abs(t.amount).toFixed(2)}
                  </Text>

                  <TouchableOpacity
                    style={styles.receiptButton}
                    onPress={() =>
                      router.push({
                        pathname: "/receipt",
                        params: { image: t.receipt_image }
                      })
                    }
                  >
                    <Text style={styles.receiptText}>View</Text>
                  </TouchableOpacity>

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
        <View style={styles.expenseRow}>
          <View style={{ marginRight: 15 }}>
            <DonutProgress
              income={incomePercentage}
              outcome={outcomePercentage}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Income vs Outcome</Text>

            <Text>• Rent</Text>
            <Text>• Food</Text>
            <Text>• Transport</Text>
          </View>
        </View>

        <View style={styles.incomeBox}>

          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: "#22C55E" }]} />
            <Text>Income : RM{income.toFixed(2)}</Text>
          </View>

          <View style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: "#EF4444" }]} />
            <Text>Outcome : RM{outcome.toFixed(2)}</Text>
          </View>

        </View>
      </>
    );
  }

  return (
    <ScrollView style={styles.container}>

      {/* Top */}
      <View style={styles.topRow}>

        <TouchableOpacity
    style={styles.scanBox}
    onPress={() => router.push("/scanpage")}
  >
    <Ionicons name="scan-outline" size={47} color="#1E3A8A" />
  </TouchableOpacity>

  <ResilienceCard scoreData={overview.score} />

</View>

      {/* Financial Insights */}
{insights.length > 0 && (
  <View style={{ marginBottom: 20 }}>
    <Text style={styles.sectionTitle}>Financial Insights</Text>
    <Text style={styles.sectionSub}>Based on your last 30 days</Text>

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {insights.map((item, i) => (
        <View key={i} style={{ marginRight: 14 , marginTop : 10,}}>
          <InsightCardView item={item} />
        </View>
      ))}
    </ScrollView>
  </View>
)}

      {/* Main Card */}
      <View style={{ marginTop: 25 }}>

        <View style={styles.cardLarge}>

          {/* Tabs */}
          <View
            style={styles.progressTabs}
            onLayout={(e) => {
              setContainerWidth(e.nativeEvent.layout.width);
            }}
          >

          

            {tabs.map((tab) => (
  <TouchableOpacity
    key={tab.key}
    style={[
      styles.tabButton,
      selectedTab === tab.key && styles.tabButtonActive  // ← add this
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
    <Text style={[styles.tabLabel, selectedTab === tab.key && { color: "#1E3A8A" }]}>
      {tab.label}
    </Text>
  </TouchableOpacity>
))}


          </View>


        <View
  style={{
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15
  }}
>

{/* LEFT ARROW */}
<TouchableOpacity
  onPress={() =>
    setSelectedMonth((prev) => (prev === 0 ? 11 : prev - 1))
  }
>
  <Ionicons name="chevron-back" size={22} />
</TouchableOpacity>

{/* MONTH SELECTOR */}
<TouchableOpacity
  style={styles.monthSelector}
  onPress={() => setShowMonthModal(true)}
>
  <Text style={styles.monthText}>
    {months[selectedMonth]} {selectedYear}
  </Text>

  <Ionicons name="chevron-down" size={18} />
</TouchableOpacity>

{/* RIGHT ARROW */}
<TouchableOpacity
  onPress={() =>
    setSelectedMonth((prev) => (prev === 11 ? 0 : prev + 1))
  }
>
  <Ionicons name="chevron-forward" size={22} />
</TouchableOpacity>

</View>

<Modal
visible={showMonthModal}
transparent
animationType="fade"
>
<View style={styles.modalOverlay}>

<View style={styles.monthModal}>

<Text style={styles.modalTitle}>Select Month</Text>

<View style={styles.monthGrid}>
{months.map((m, index) => (
<TouchableOpacity
key={index}
style={[
styles.monthItem,
selectedMonth === index && styles.monthItemActive
]}
onPress={() => setSelectedMonth(index)}
>

<Text
style={[
styles.monthTextItem,
selectedMonth === index && { color:"#fff" }
]}
>
{m}
</Text>

</TouchableOpacity>
))}
</View>

<View style={{ marginTop: 15 }}>

<TouchableOpacity
style={styles.yearSelector}
onPress={() => setShowYearList(!showYearList)}
>
<Text style={styles.yearText}>{selectedYear}</Text>
<Ionicons name="chevron-down" size={18} />
</TouchableOpacity>

{showYearList && (
<View style={styles.yearList}>
<ScrollView showsVerticalScrollIndicator={false}>
{years.map((y) => (
<TouchableOpacity
key={y}
style={styles.yearItem}
onPress={() => {
setSelectedYear(y);
setShowYearList(false);
}}
>
<Text style={styles.yearItemText}>{y}</Text>
</TouchableOpacity>
))}
</ScrollView>
</View>
)}

</View>

<TouchableOpacity
style={styles.doneButton}
onPress={()=>setShowMonthModal(false)}
>
<Text style={{color:"#fff"}}>Done</Text>
</TouchableOpacity>

</View>

</View>
</Modal>

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
marginBottom: 16,
},

  profileCircle:{
width:52,
height:52,
borderRadius:26,
borderWidth:1,
borderColor:"#E5E7EB",
},

  healthText: {
    flex: 1,
    textAlign: "center",
  },

  scanBox:{
width:75,
height:75,
borderRadius:18,

backgroundColor:"#FFFFFF",

alignItems:"center",
justifyContent:"center",

shadowColor:"#000000",
shadowOffset:{width:0,height:6},
shadowOpacity:0.2,
shadowRadius:5,
elevation:4
},

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    elevation: 4,
  },

  cardLarge: {
    paddingTop: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 15,
    marginBottom: 20,
    elevation: 4,
  },

  cardRow: {
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
    width: 40,
    height: 40,
    backgroundColor: "#ccc",
    borderRadius: 6,
  },

  activeTab: {
    backgroundColor: "#FFFFFF",
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
    fontSize: 20,
    fontWeight: "bold",
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
  bottom: 6,
  height: 2,
  backgroundColor: "#FFFFFF",
  borderRadius: 2,
},

  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    zIndex: 2,
  },

  tabLabel: {
    fontSize: 11,

    color: "#FFFFFF",
    textAlign: "center",
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
    paddingTop:18,
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

  sectionSub: { 
  fontSize: 13, color: "#94A3B8", marginBottom: 12 },

  insightCard: {
  width: SCREEN_WIDTH * 0.85,
  flexDirection: "row",
  alignItems: "flex-start",
  borderRadius: 16,
  padding: 16,
  backgroundColor: "#FFFFFF",
  borderLeftWidth: 4,

  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 6,
  elevation: 4,
},

  insightIconBox: { 
    width: 42, 
    height: 42, 
    borderRadius: 21, 
    justifyContent: "center", 
    alignItems: "center" 
  },

  insightIconText: { 
    fontSize: 20 
  },

  insightLabel: { 
    fontSize: 10, 
    fontWeight: "700", 
    letterSpacing: 1, 
    marginBottom: 2 
  },

  insightTitle: { 
    fontSize: 14, 
    fontWeight: "700", 
    color: "#0F172A", 
    marginBottom: 3 
  },

  insightBody: {
  fontSize: 13,
  color: "#475569",
  lineHeight: 18,
  flexShrink: 1
},

tabButtonActive: {
  backgroundColor: "#FFFFFF",
  borderRadius: 20,
  paddingHorizontal: 10,
  paddingVertical: 6,
},

monthDropdown: {
  backgroundColor: "#FFFFFF",
  borderRadius: 10,
  paddingVertical: 8,
  elevation: 4,
  marginBottom: 15,
},

monthItemText: {
  fontSize: 15,
},

monthSelector:{
flexDirection:"row",
alignItems:"center",
backgroundColor:"#F1F5F9",
paddingHorizontal:14,
paddingVertical:6,
borderRadius:14,
marginHorizontal:8
},

monthText:{
fontSize:16,
fontWeight:"600",
marginRight:6
},

modalOverlay:{
position:"absolute",
top:0,
left:0,
right:0,
bottom:0,
backgroundColor:"rgba(0,0,0,0.3)",
justifyContent:"center",
alignItems:"center",
zIndex:1000
},

monthModal:{
width:"85%",
backgroundColor:"#fff",
borderRadius:20,
padding:20
},

modalTitle:{
fontSize:18,
fontWeight:"600",
marginBottom:15,
textAlign:"center"
},

monthGrid:{
flexDirection:"row",
flexWrap:"wrap",
justifyContent:"space-between"
},

monthItem:{
width:"30%",
padding:10,
borderRadius:10,
alignItems:"center",
marginBottom:10
},

monthItemActive:{
backgroundColor:"#1E3A8A"
},

monthTextItem:{
fontSize:14
},

yearRow:{
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
marginTop:10
},

yearText:{
fontSize:18,
marginHorizontal:20
},

doneButton:{
backgroundColor:"#1E3A8A",
padding:12,
borderRadius:10,
marginTop:15,
alignItems:"center"
},

yearSelector:{
flexDirection:"row",
justifyContent:"center",
alignItems:"center",
backgroundColor:"#F1F5F9",
paddingVertical:8,
borderRadius:12
},

yearList:{
marginTop:8,
maxHeight:150,
backgroundColor:"#fff",
borderRadius:12,
paddingVertical:5,
elevation:3
},

yearItem:{
paddingVertical:8,
alignItems:"center"
},

yearItemText:{
fontSize:16
},

resilienceCard:{
  flexDirection:"row",
  alignItems:"center",
  backgroundColor:"#FFFFFF",
  borderRadius:20,
  paddingHorizontal:14,
  paddingVertical:10,
  borderWidth:1,
  borderColor:"#FECACA",
  flex:1,
  marginHorizontal:10,
  shadowColor:"#000000",
  shadowOffset:{width:0,height:6},
  shadowOpacity:0.2,
  shadowRadius:5,
  elevation:4
},

resilienceRow:{
flexDirection:"row",
alignItems:"center",
gap:10
},

resilienceRing:{
width:50,
height:50,
borderRadius:22,
borderWidth:3,
alignItems:"center",
justifyContent:"center",
marginRight:10
},

resilienceScore:{
fontSize:18,
fontWeight:"800",
lineHeight:20
},

resilienceMax:{
fontSize:9,
color:"#94A3B8"
},

resilienceRight:{
flex:1
},

resilienceTierBadge:{
alignSelf:"flex-start",
paddingHorizontal:8,
paddingVertical:2,
borderRadius:12,
borderWidth:1
},

resilienceTierText:{
fontSize:9,
fontWeight:"800",
letterSpacing:1
},

resilienceVerdict:{
fontSize:12,
color:"#475569",
marginTop:4,
lineHeight:16,
flexShrink:1
},

});