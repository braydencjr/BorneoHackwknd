import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ContingencyPage() {

  const screenWidth = Dimensions.get("window").width;
  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorPosition = useState(new Animated.Value(0))[0];

  const [selectedTab, setSelectedTab] = useState<"A" | "B" | "C" | "D">("A");

  const tabs = [
  { key: "A", label: "Illness", icon: "medkit-outline" },
  { key: "B", label: "Job Loss", icon: "briefcase-outline" },
  { key: "C", label: "Nature Disaster", icon: "thunderstorm-outline" },
  { key: "D", label: "War", icon: "shield-outline" },
] as const;

 const tabWidth = containerWidth / tabs.length;

  return (
    <ScrollView style={styles.container}>

       <Text style={styles.title}>Contingency Planning</Text>
            <Text style={styles.subtitle}>
              Prepare for unexpected financial challenges with a solid backup plan.
            </Text>

<View style={styles.cardWrapper}>

  {/* White Card */}
  <View style={styles.mainCard} />

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

</View>
  <View style={{ height: 20 }} />


      {/* Target Emergency Fund */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Target Emergency Fund</Text>
        <Text style={styles.amount}>RM1000.00</Text>

        {/* Progress Bar */}
        <View style={styles.progressBar}>
          <View style={styles.progressFill} />
        </View>
      </View>

      {/* Suggested Plan */}
      <Text style={styles.planTitle}>
        Suggested Emergency Fund Savings Plan
      </Text>

      <View style={styles.planCard}>

        <View style={styles.planRow}>
          <Text>Save </Text>
          <Text style={styles.bold}>RM 300</Text>
          <Text> / month</Text>
          <View style={styles.tagBlue}>
            <Text style={styles.tagText}>12 months</Text>
          </View>
        </View>

        <View style={styles.planRow}>
          <Text>Save </Text>
          <Text style={styles.bold}>RM 75</Text>
          <Text> / week</Text>
          <View style={styles.tagLight}>
            <Text style={styles.tagText}>Auto-transfer</Text>
          </View>
        </View>

        <View style={styles.planRow}>
          <Text>Extra </Text>
          <Text style={styles.bold}>RM 500</Text>
          <Text> by Dec</Text>
          <View style={styles.tagGold}>
            <Text style={styles.tagText}>One-time</Text>
          </View>
        </View>

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
  bottom: 6,        // sit near bottom
  height: 1,        // thin underline
  backgroundColor: "#FFFFFF",
  borderRadius: 2,
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

});