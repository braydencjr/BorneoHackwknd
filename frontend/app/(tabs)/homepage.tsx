import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import CategoryDonut from "../../components/category_donut";
import DonutProgress from "../../components/donut_progress";

export default function HomePage() {

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

  useEffect(() => {
  fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/summary/`)
    .then(res => res.json())
    .then(data => {

      const income = Number(data.income) || 0;
      const outcome = Number(data.outcome) || 0;

      setIncome(income);
      setOutcome(outcome);

      const total = income + outcome;

      const incomePercentage =
        total > 0 ? (income / total) * 100 : 0;

      const outcomePercentage =
        total > 0 ? (outcome / total) * 100 : 0;

      setIncomePercentage(incomePercentage);
      setOutcomePercentage(outcomePercentage);

      console.log("Summary:", data);
    });
}, []);

  useEffect(() => {
    fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/transactions/`)
      .then(res => res.json())
      .then(data => {
        setTransactions(data);
      });
  }, []);

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
        {outcomeCategories.map((c, index) => (
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

          const isIncome = t.amount > 0;

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
        <View style={styles.profileCircle} />

        <Text style={styles.healthText}>
          Your Financial Health is Moderate
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
            <Text style={styles.cardTitle}>Current Savings</Text>
            <Text style={styles.amount}>RM 1000.00</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Tips for Savings</Text>
            <Text style={styles.tip}>• Reduce dining out</Text>
            <Text style={styles.tip}>• Track subscriptions</Text>
          </View>

        </View>
      </View>


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

                  const index = tabs.findIndex(t => t.key === tab.key);

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


          <Text style={styles.monthText}>{"< March 2026 >"}</Text>

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
    padding: 15,
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
  top: -25,   // makes it float into card
  left: 40,
  right: 40,
  flexDirection: "row",
  justifyContent: "space-between",
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
  bottom: 6,        // sit near bottom
  height: 1,        // thin underline
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
  marginTop: 4,
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

});