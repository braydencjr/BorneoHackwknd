import { BASE_URL } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";

export default function OTP() {
  const {
    email = "",
    name = "",
    password = "",
  } = useLocalSearchParams<{
    email: string;
    name: string;
    password: string;
  }>();

  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const verifyOTP = async () => {
    if (!otp.trim()) {
      Alert.alert("Missing OTP", "Please enter the OTP sent to your email.");
      return;
    }

    try {
      setLoading(true);

      const lowerEmail = email.toLowerCase().trim();
      const res = await fetch(`${BASE_URL}/api/v1/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: lowerEmail,
          otp: otp.trim(),
          name: name.trim(),
          password,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch (e) {
        console.warn("Could not parse JSON response");
      }

      if (res.ok) {
        Alert.alert(
          "Account created!",
          "You can now log in with your credentials.",
          [{ text: "OK", onPress: () => router.replace("/Login") }],
        );
      } else {
        const errorMsg = data.detail ?? "The OTP is incorrect or has expired.";
        const title =
          res.status === 400 && data.detail === "Invalid OTP"
            ? "Invalid OTP"
            : "Registration Failed";
        Alert.alert(title, errorMsg);
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert(
        "Network error",
        "Could not reach the server. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Verify Your Email</Text>
          <Text style={styles.subtitle}>
            An OTP has been sent to{"\n"}
            <Text style={styles.email}>{email}</Text>
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter OTP"
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity
            style={[styles.button, loading && { opacity: 0.7 }]}
            onPress={verifyOTP}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "600",
    color: "#0F2E6D",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#555",
    marginBottom: 30,
    lineHeight: 22,
  },
  email: {
    fontWeight: "700",
    color: "#0F2E6D",
  },
  input: {
    width: "100%",
    height: 55,
    backgroundColor: "#B8C7DA",
    borderRadius: 28,
    paddingHorizontal: 20,
    fontSize: 20,
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    width: "80%",
    height: 55,
    backgroundColor: "#143B7C",
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "500",
  },
});
