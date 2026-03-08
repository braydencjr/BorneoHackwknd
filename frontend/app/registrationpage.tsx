import { BASE_URL } from "@/services/api";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";

export default function Register() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // Basic validation
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    console.log("Sign Up Button Pressed!");
    console.log("API URL:", BASE_URL);

    try {
      setLoading(true);

      const lowerEmail = email.trim().toLowerCase();
      const res = await fetch(`${BASE_URL}/api/v1/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: lowerEmail }),
      });

      console.log("Response status:", res.status);

      const data = await res.json();
      console.log("Response data:", data);

      if (res.ok) {
        router.push({
          pathname: "/otp",
          params: {
            email: lowerEmail,
            name: username.trim(),
            password,
          },
        });
      } else {
        Alert.alert("Error", data.detail ?? "Failed to send OTP.");
      }
    } catch (error: any) {
      console.error(error);
      Alert.alert("Network error", "Could not reach the server. Make sure the backend is running.");
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* Logo Circle */}
          <View style={styles.circle} />

          {/* App Name */}
          <Text style={styles.appName}>AppName</Text>

          {/* Username */}
          <Text style={styles.label}>Username :</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Enter your username"
            autoCapitalize="none"
          />

          {/* Email */}
          <Text style={styles.label}>Email :</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password */}
          <Text style={styles.label}>Password :</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
          />

          {/* Confirm Password */}
          <Text style={styles.label}>Confirm Password :</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm your password"
          />

          {/* Sign Up Button */}
          <TouchableOpacity
            style={[styles.signUpButton, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.signUpText}>Sign Up</Text>
            }
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
    paddingTop: 70,
    paddingHorizontal: 30,
  },

  circle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "#0F3D91",
    marginBottom: 20,
  },

  appName: {
    fontSize: 32,
    fontWeight: "500",
    marginBottom: 30,
  },

  label: {
    alignSelf: "flex-start",
    fontSize: 18,
    marginBottom: 8,
    marginTop: 10,
  },

  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#B8C7DA",
    borderRadius: 25,
    paddingHorizontal: 20,
    marginBottom: 10,
  },

  signUpButton: {
    width: "80%",
    height: 55,
    backgroundColor: "#143B7C",
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
  },

  signUpText: {
    color: "#FFFFFF",
    fontSize: 20,
  },
});