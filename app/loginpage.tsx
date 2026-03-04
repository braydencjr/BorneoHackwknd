import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  WebBrowser.maybeCompleteAuthSession();

const [request, response, promptAsync] = Google.useAuthRequest({
  clientId: "YOUR_GOOGLE_CLIENT_ID",
});

useEffect(() => {
  if (response?.type === "success") {
    console.log("Google login success");
    router.replace("/(tabs)/homepage");
  }
}, [response]);

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
        onPress={() => router.replace("/(tabs)/homepage")}
      >
        <Text style={styles.confirmText}>Confirm</Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider} />

      <Text style={styles.signInWith}>Sign in With :</Text>

      <TouchableOpacity
  style={styles.googleButton}
  disabled={!request}
  onPress={() => promptAsync()}
>
  <Ionicons name="logo-google" size={20} color="white" />
  <Text style={styles.googleText}> Sign up with Google</Text>
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
    paddingTop: 80,
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
    marginBottom: 40,
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
    marginBottom: 40,
  },

  signUpButton: {
    width: "80%",
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: "#0F2E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  signUpText: {
    fontSize: 20,
  },

  googleButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#DB4437",
  width: "80%",
  height: 50,
  borderRadius: 25,
  marginBottom: 20,
},

googleText: {
  color: "white",
  fontSize: 18,
  marginLeft: 10,
},
});