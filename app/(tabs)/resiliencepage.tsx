import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function ResiliencePage() {
  return (
    <ScrollView style={styles.container}>

      <Text style={styles.title}>Financial Resilience</Text>
      <Text style={styles.subtitle}>
        Stay prepared for unexpected expenses.
      </Text>

      <View style={styles.card}>
        <Ionicons name="wallet-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Emergency Fund</Text>
          <Text style={styles.cardDesc}>
            You have saved 3 months of expenses.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Ionicons name="alert-circle-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Unexpected Expenses</Text>
          <Text style={styles.cardDesc}>
            Track sudden expenses to stay prepared.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Ionicons name="trending-up-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Savings Growth</Text>
          <Text style={styles.cardDesc}>
            Increase your monthly savings to build resilience.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Ionicons name="shield-checkmark-outline" size={28} color="#1E3A8A" />
        <View style={styles.textBox}>
          <Text style={styles.cardTitle}>Financial Safety Tip</Text>
          <Text style={styles.cardDesc}>
            Aim for 6 months of living expenses saved.
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