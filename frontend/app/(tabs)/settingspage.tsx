import { BASE_URL } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";

import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";


export default function SettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useFocusEffect(
  useCallback(() => {
    fetchUser();
  }, [])
);

  const fetchUser = async () => {
  try {
    const token = await SecureStore.getItemAsync("accessToken");
console.log("TOKEN:", token);

    const response = await fetch(`${BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    setUser(data);

  } catch (error) {
    console.log("Failed to load user:", error);
  }
};

  return (
    <ScrollView style={styles.container}>

      {/* Profile Card */}
      <View style={styles.profileCard}>
  <View style={styles.avatar} />

  <View>
    <Text style={styles.name}>{user?.name || "Loading..."}</Text>
    <Text style={styles.email}>{user?.email || ""}</Text>
  </View>
</View>

      {/* Preferences Section */}
      <Text style={styles.sectionTitle}>Preferences</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="notifications-outline" size={20} color="#1E3A8A" />
            <Text style={styles.rowText}>Notifications</Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ true: "#1E3A8A" }}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="moon-outline" size={20} color="#1E3A8A" />
            <Text style={styles.rowText}>Dark Mode</Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ true: "#1E3A8A" }}
          />
        </View>
      </View>

      {/* Account Section */}
      <Text style={styles.sectionTitle}>Account</Text>

      <View style={styles.card}>
       <TouchableOpacity
  style={styles.row}
  onPress={() => router.push("/editProfile")}
>
  <View style={styles.rowLeft}>
    <Ionicons name="person-outline" size={20} color="#1E3A8A" />
    <Text style={styles.rowText}>Edit Profile</Text>
  </View>

  <Ionicons name="chevron-forward" size={18} color="#999" />
</TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="lock-closed-outline" size={20} color="#1E3A8A" />
            <Text style={styles.rowText}>Change Password</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="log-out-outline" size={20} color="#E4572E" />
            <Text style={[styles.rowText, { color: "#E4572E" }]}>
              Log Out
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ height: 60 }} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 20,
    padding : 20,
  },

  profileCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
    marginBottom: 25,
  },

  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1E3A8A",
    marginRight: 15,
  },

  name: {
    fontSize: 18,
    fontWeight: "600",
  },

  email: {
    fontSize: 14,
    color: "#777",
  },

  sectionTitle: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 10,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingVertical: 5,
    elevation: 4,
    marginBottom: 20,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 15,
  },

  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  rowText: {
    fontSize: 16,
    marginLeft: 10,
  },

  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 15,
  },
});