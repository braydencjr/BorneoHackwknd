import { createNotificationTransaction } from "@/services/notificationService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const CATEGORIES = [
  "Food",
  "Transport",
  "Shopping",
  "Entertainment",
  "Health",
  "Utilities",
  "Others",
];

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    classification?: string;
    merchant_name?: string;
    amount?: string;
    category?: string;
    description?: string;
  }>();

  const isIncome = params.classification === "incoming_money";

  const [merchantName, setMerchantName] = useState(params.merchant_name ?? "");
  const [amount, setAmount] = useState(params.amount ?? "0");
  const [category, setCategory] = useState(params.category ?? "Others");
  const [description, setDescription] = useState(params.description ?? "");
  const [type, setType] = useState<"income" | "expense">(
    isIncome ? "income" : "expense",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.");
      return;
    }
    if (!merchantName.trim()) {
      Alert.alert(
        "Missing Merchant",
        "Please enter a merchant or sender name.",
      );
      return;
    }

    setSaving(true);
    try {
      await createNotificationTransaction({
        merchant_name: merchantName.trim(),
        amount: numAmount,
        category,
        type,
        description: description.trim(),
      });
      Alert.alert("Saved", "Transaction recorded successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error("Failed to save transaction:", err);
      Alert.alert("Error", "Failed to save transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerCard}>
        <Ionicons
          name={type === "income" ? "arrow-down-circle" : "arrow-up-circle"}
          size={40}
          color={type === "income" ? "#16A34A" : "#DC2626"}
        />
        <Text style={styles.headerTitle}>
          {type === "income" ? "Incoming Money" : "Outgoing Payment"}
        </Text>
        <Text style={styles.headerSubtitle}>
          Detected from TNG eWallet notification
        </Text>
      </View>

      {/* Type Toggle */}
      <View style={styles.card}>
        <Text style={styles.label}>Transaction Type</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              type === "expense" && styles.toggleButtonActiveExpense,
            ]}
            onPress={() => setType("expense")}
          >
            <Ionicons
              name="arrow-up-circle"
              size={18}
              color={type === "expense" ? "#FFF" : "#DC2626"}
            />
            <Text
              style={[
                styles.toggleText,
                type === "expense" && styles.toggleTextActive,
              ]}
            >
              Expense
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              type === "income" && styles.toggleButtonActiveIncome,
            ]}
            onPress={() => setType("income")}
          >
            <Ionicons
              name="arrow-down-circle"
              size={18}
              color={type === "income" ? "#FFF" : "#16A34A"}
            />
            <Text
              style={[
                styles.toggleText,
                type === "income" && styles.toggleTextActive,
              ]}
            >
              Income
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Amount */}
      <View style={styles.card}>
        <Text style={styles.label}>Amount (RM)</Text>
        <TextInput
          style={styles.amountInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor="#999"
        />
      </View>

      {/* Merchant Name */}
      <View style={styles.card}>
        <Text style={styles.label}>
          {type === "income" ? "Sender" : "Merchant / Recipient"}
        </Text>
        <TextInput
          style={styles.input}
          value={merchantName}
          onChangeText={setMerchantName}
          placeholder="e.g. Grab, 7-Eleven, Friend"
          placeholderTextColor="#999"
        />
      </View>

      {/* Category */}
      <View style={styles.card}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                category === cat && styles.categoryChipActive,
              ]}
              onPress={() => setCategory(cat)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  category === cat && styles.categoryChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Description */}
      <View style={styles.card}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, { height: 70, textAlignVertical: "top" }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Add a note..."
          placeholderTextColor="#999"
          multiline
        />
      </View>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.saveButton, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={22} color="#FFF" />
            <Text style={styles.saveButtonText}>Save Transaction</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.discardButton}
        onPress={() => router.back()}
      >
        <Ionicons name="close-circle" size={22} color="#DC2626" />
        <Text style={styles.discardButtonText}>Discard</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    elevation: 4,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E3A8A",
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    marginBottom: 8,
  },
  input: {
    fontSize: 16,
    color: "#222",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  amountInput: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1E3A8A",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    textAlign: "center",
  },
  toggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  toggleButtonActiveExpense: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
  },
  toggleButtonActiveIncome: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
  },
  toggleTextActive: {
    color: "#FFF",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  categoryChipActive: {
    backgroundColor: "#1E3A8A",
    borderColor: "#1E3A8A",
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
  },
  categoryChipTextActive: {
    color: "#FFF",
  },
  saveButton: {
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
    marginBottom: 10,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  discardButton: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#DC2626",
  },
  discardButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "600",
  },
});
