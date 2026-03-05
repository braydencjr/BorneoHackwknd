import { useGoogleAuth } from "@/services/useGoogleAuth";
import { AntDesign } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { loginWithGoogle } from "../services/authService";

export default function Login() {
  const { request, response, promptAsync } = useGoogleAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
  try {

    const formBody = new URLSearchParams({
      username: email,
      password: password
    }).toString();

    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody
    });

    const data = await res.json();

    if (res.ok) {
      router.replace("/(tabs)/homepage");
    } else {
      alert("Invalid email or password");
    }

  } catch (error) {
    console.error(error);
    alert("Network error");
  }
};

useEffect(() => {
  const handleGoogleLogin = async () => {
    if (response?.type === "success") {
      const idToken = response.authentication?.idToken;

      try {
  setLoading(true);

  await loginWithGoogle(idToken);

  router.replace("/(tabs)/homepage");

} catch (error) {
  console.error("Google login failed:", error);
} finally {
  setLoading(false);
}
    }
  };

  handleGoogleLogin();
}, [response, router]);

  return (
    <View style={styles.container}>

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
        style={styles.confirmButton}
        onPress={handleLogin}
      >
        <Text style={styles.confirmText}>Confirm</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider} />

      <Text style={styles.signInWith}>Sign in With :</Text>

<TouchableOpacity
  style={styles.googleButton}
  disabled={!request || loading}
  onPress={() => promptAsync()}
>
  <AntDesign name="google" size={22} color="white" />
  <Text style={styles.googleText}>Sign in with Google</Text>
</TouchableOpacity>

      {/* Sign Up Button */}
      <TouchableOpacity 
      style={styles.signUpButton}
      onPress={() => router.push("/registrationpage")}>
        <Text style={styles.signUpText}>Sign Up</Text>
      </TouchableOpacity>

    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 30,
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
    marginTop:8,
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
  paddingBottom:8,
  backgroundColor: "#0F2E6D",
  paddingVertical: 8,
  borderRadius: 30,
  alignItems: "center",
  flexDirection: "row",
  justifyContent: "center",
  gap: 10
}
});