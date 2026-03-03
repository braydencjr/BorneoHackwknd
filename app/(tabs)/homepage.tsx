import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DonutProgress from "../../components/donut_progress";

export default function HomePage() {
  const router = useRouter();
  
  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");

  const tabData = {
    A: { percentage: 78, color: "#7CB518", title: "Income vs Outcome" },
    B: { percentage: 60, color: "#4C8DAE", title: "Income" },
    C: { percentage: 46, color: "#F59E0B", title: "Outcome" },
    D: { percentage: 22, color: "#E4572E", title: "Transactions" },
  };

  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorPosition = useState(new Animated.Value(0))[0];

  const tabs = [
  { key: "A", label: "Overview", icon: "grid-outline" },
  { key: "B", label: "Income", icon: "arrow-down-circle-outline" },
  { key: "C", label: "Outcome", icon: "arrow-up-circle-outline" },
  { key: "D", label: "Transactions", icon: "receipt-outline" },
] as const;

const tabWidth = containerWidth / tabs.length;

  return (
    <ScrollView style={styles.container}>
      {/* Top Section */}
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

      {/* Savings + Tips Card */}
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

      {/* Expense + Floating Tabs Section */}
<View style={{ marginTop: 40 }}>

  <View style={styles.cardLarge}>

    {/* Floating Tabs */}
    <View
  style={styles.progressTabs}
  onLayout={(e) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }}
>


  {/* Sliding Indicator */}
  <Animated.View
  pointerEvents="none"
  style={[
    styles.indicator,
    {
      width: tabWidth * 0.5, // smaller underline
      left: tabWidth * 0.25, // center it
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

    <View style={styles.expenseRow}>
      <View style={{ marginRight: 15 }}>
        <DonutProgress
          percentage={tabData[selectedTab].percentage}
          color={tabData[selectedTab].color}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>
          {tabData[selectedTab].title}
        </Text>
        <Text>• Rent</Text>
        <Text>• Food</Text>
        <Text>• Transport</Text>
      </View>
    </View>

    <View style={styles.incomeBox}>
      <Text>Income : RM100.00</Text>
      <Text>Outcome : RM0.00</Text>
    </View>

  </View>
</View>

      {/* Resilience Card */}
      <View style={styles.card}>
        <View style={styles.resilienceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Survive Up To</Text>
            <Text style={styles.bigNumber}>8</Text>
            <Text style={styles.monthLabel}>months</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              Financial Resilience Score
            </Text>
            <Text style={styles.bigNumber}>100%</Text>
          </View>
        </View>
      </View>

      {/* Emergency Fund Progress */}
      <Text style={styles.sectionTitle}>
        Savings vs Suggested Emergency Fund Saving
      </Text>

      <View style={styles.progressBar}>
        <View style={styles.progressFill} />
      </View>

      <View style={{ height: 40 }} />
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

});