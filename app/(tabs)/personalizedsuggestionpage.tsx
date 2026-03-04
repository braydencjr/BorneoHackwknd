import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function SuggestionPage() {
  return (
    <ScrollView style={styles.container}>

      {/* Suggestion Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Top Suggestions</Text>

        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionText}>
            You are spending 40% on non-essential items.
          </Text>
        </View>

        <View style={styles.suggestionBox}>
          <Text style={styles.suggestionText}>
            Consider reducing BNPL usage this month.
          </Text>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
    padding: 20,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    elevation: 4,
  },

  title: {
    fontSize: 18,
    marginBottom: 20,
  },

  suggestionBox: {
    backgroundColor: "#F0F0F0",
    borderRadius: 18,
    padding: 18,
    marginBottom: 15,
  },

  suggestionText: {
    fontSize: 14,
  },
});