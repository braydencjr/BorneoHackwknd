import { BASE_URL } from "@/services/api";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function ChangePasswordPage() {
const router = useRouter();

const [oldPassword, setOldPassword] = useState("");
const [newPassword, setNewPassword] = useState("");

const handleChangePassword = async () => {
try {
const token = await SecureStore.getItemAsync("accessToken");
console.log("CHANGE PASSWORD TOKEN:", token);

  const response = await fetch(`${BASE_URL}/api/v1/auth/change-password`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    current_password: oldPassword,
    new_password: newPassword,
  }),
});

const text = await response.text();
let data;

try {
  data = JSON.parse(text);
} catch {
  data = { detail: text };
}

if (!response.ok) {
  throw new Error(data.detail || "Failed to change password");
}

  Alert.alert("Success", "Password changed successfully");
  router.back();
} catch (error) {
  console.log("CHANGE PASSWORD ERROR:", error);

  if (error instanceof Error) {
    Alert.alert("Error", error.message);
  } else {
    Alert.alert("Error", "Something went wrong");
  }
}

};

return ( 
<View style={styles.container}> 
    <Text style={styles.title}>Change Password</Text>
  <TextInput
    style={styles.input}
    placeholder="Current Password"
    secureTextEntry
    value={oldPassword}
    onChangeText={setOldPassword}
  />

  <TextInput
    style={styles.input}
    placeholder="New Password"
    secureTextEntry
    value={newPassword}
    onChangeText={setNewPassword}
  />

  <TouchableOpacity style={styles.button} onPress={handleChangePassword}>
    <Text style={styles.buttonText}>Update Password</Text>
  </TouchableOpacity>
</View>

);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: "#fff",
padding: 30,
justifyContent: "center",
},

title: {
fontSize: 26,
textAlign: "center",
marginBottom: 30,
},

input: {
height: 50,
backgroundColor: "#B8C7DA",
borderRadius: 25,
paddingHorizontal: 20,
marginBottom: 15,
letterSpacing: 0,
},

button: {
height: 50,
backgroundColor: "#1E3A8A",
borderRadius: 25,
justifyContent: "center",
alignItems: "center",
marginTop: 10,
},

buttonText: {
color: "white",
fontSize: 18,
},
});
