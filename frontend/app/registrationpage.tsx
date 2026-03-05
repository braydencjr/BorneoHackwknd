import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function Register() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleRegister = async () => {
    console.log("Sign Up Button Pressed!");
    console.log("API URL:", process.env.EXPO_PUBLIC_API_URL);

  try {
    const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/v1/auth/send-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
        name: username
      }),
    });

    console.log("Response status:", res.status);

    const data = await res.json();
    console.log("Response data:", data);

    if (res.ok) {
      router.push({
  pathname: "/otp",
  params: {
    email,
    name: username,
    password
  }
});
    } else {
      alert(data.detail || "Otp Sent failed");
    }

  } catch (error) {
    console.error(error);
    alert("Network error");
  }
};


  return (
    <View style={styles.container}>

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
      />

      {/* Email */}
      <Text style={styles.label}>Email :</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />

      {/* Password */}
      <Text style={styles.label}>Password :</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* Confirm Password */}
      <Text style={styles.label}>Confirm Password :</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {/* Sign Up Button */}
      <TouchableOpacity
      style={styles.signUpButton}
      onPress={handleRegister} >
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