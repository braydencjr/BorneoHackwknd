import { BASE_URL } from "@/services/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function ForgotPassword() {
const router = useRouter();
const [email, setEmail] = useState("");

const handleReset = async () => {
  if (!email.trim()) {
    Alert.alert("Missing Email", "Please enter your email.");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to send reset email");
    }

    Alert.alert(
      "Reset Link Sent",
      "Check your email for password reset instructions."
    );

    router.back();

  } catch (error: any) {
    Alert.alert(
      "Error",
      error.message || "Unable to process password reset request."
    );
  }
};

return (
  <View style={styles.container}>
    <Text style={styles.title}>Forgot Password</Text>

    <Text style={styles.description}>
      Enter your email address and we will send you instructions to reset your password.
    </Text>

    <TextInput
      style={styles.input}
      placeholder="Enter your email"
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      keyboardType="email-address"
    />

    <TouchableOpacity style={styles.button} onPress={handleReset}>
      <Text style={styles.buttonText}>Send Reset Link</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={() => router.back()}>
      <Text style={styles.backText}>Back to Login</Text>
    </TouchableOpacity>
  </View>
);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: "#fff",
justifyContent: "center",
padding: 30,
},

title: {
fontSize: 28,
fontWeight: "600",
marginBottom: 10,
textAlign: "center",
},

description: {
fontSize: 14,
color: "#555",
textAlign: "center",
marginBottom: 25,
},

input: {
height: 50,
borderRadius: 25,
backgroundColor: "#B8C7DA",
paddingHorizontal: 20,
marginBottom: 20,
},

button: {
height: 50,
borderRadius: 25,
backgroundColor: "#0F2E6D",
justifyContent: "center",
alignItems: "center",
marginBottom: 20,
},

buttonText: {
color: "#fff",
fontSize: 18,
},

backText: {
textAlign: "center",
color: "#0F2E6D",
textDecorationLine: "underline",
},
});
