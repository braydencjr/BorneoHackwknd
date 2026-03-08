import { useGoogleAuth } from "@/services/useGoogleAuth";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { authService } from "../services/authService";

export default function Login() {
  const { request, response, promptAsync } = useGoogleAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ─── Email / password login ─────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter your email and password.");
      return;
    }

    try {
      setLoading(true);
      await authService.login({ username: email.trim().toLowerCase(), password });
      router.replace("/(tabs)/homepage");
    } catch (error: any) {
      Alert.alert("Login failed", error.message ?? "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Google login ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleGoogleLogin = async () => {
      if (response?.type === "success") {
        // Google auth succeeded in Expo Go — navigate to home.
        // For a full backend JWT flow, pass response.authentication?.idToken
        // to your backend Google route once it's implemented.
        router.replace("/(tabs)/homepage");
      } else if (response?.type === "error") {
        Alert.alert("Google Sign-In failed", response.error?.message ?? "Unknown error.");
      }
    };

    handleGoogleLogin();
  }, [response, router]);

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

          {/* Email */}
          <Text style={styles.label}>Email :</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          {/* Password */}
          <Text style={styles.label}>Password :</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text style={styles.forgot}>Forgot Password ?</Text>

          {/* Confirm Button */}
          <TouchableOpacity
            style={[styles.confirmButton, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.confirmText}>Confirm</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider} />

          <Text style={styles.signInWith}>Sign in With :</Text>

          <TouchableOpacity
            style={[styles.googleButton, (!request || loading) && { opacity: 0.6 }]}
            disabled={!request || loading}
            onPress={() => promptAsync()}
          >
            <AntDesign name="google" size={22} color="white" />
            <Text style={styles.googleText}>Sign in with Google</Text>
          </TouchableOpacity>

          {/* Sign Up Button */}
          <TouchableOpacity
            style={styles.signUpButton}
            onPress={() => router.push("/registrationpage")}
          >
            <Text style={styles.signUpText}>Sign Up</Text>
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
    paddingTop: 60,
    paddingHorizontal: 30,
    paddingBottom: 40,
  },

  circle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: "#0F3D91",
    marginBottom: 10,
  },

  appName: {
    fontSize: 32,
    fontWeight: "500",
    marginBottom: 20,
  },

  label: {
    alignSelf: "flex-start",
    fontSize: 18,
    marginBottom: 8,
    marginTop: 3,
  },

  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#B8C7DA",
    borderRadius: 25,
    paddingHorizontal: 20,
    marginBottom: 10,
  },

  forgot: {
    marginTop: 5,
    marginBottom: 20,
    fontSize: 14,
  },

  confirmButton: {
    width: "80%",
    height: 50,
    backgroundColor: "#0F2E6D",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
  },

  confirmText: {
    color: "#FFFFFF",
    fontSize: 20,
  },

  divider: {
    width: "90%",
    height: 1,
    backgroundColor: "#0F2E6D",
    marginBottom: 10,
  },

  signInWith: {
    marginBottom: 8,
  },

  signUpButton: {
    width: "80%",
    height: 50,
    marginTop: 8,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#0F2E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  signUpText: {
    fontSize: 20,
  },

  googleText: {
    color: "white",
    fontSize: 18,
    marginLeft: 10,
  },

  googleButton: {
    width: "80%",
    height: 50,
    backgroundColor: "#0F2E6D",
    paddingVertical: 8,
    borderRadius: 30,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
});