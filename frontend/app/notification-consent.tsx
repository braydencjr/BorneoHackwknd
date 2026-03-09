import {
    hasConsent,
    isNotificationAccessEnabled,
    openNotificationAccessSettings,
    setConsent,
} from "@/services/notificationService";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
    Alert,
    AppState,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function NotificationConsentScreen() {
  const router = useRouter();
  const [consentGranted, setConsentGranted] = useState(false);
  const [systemAccessEnabled, setSystemAccessEnabled] = useState(false);
  const isAndroid = Platform.OS === "android";

  const checkStatus = useCallback(async () => {
    const consent = await hasConsent();
    setConsentGranted(consent);
    if (isAndroid) {
      const access = await isNotificationAccessEnabled();
      setSystemAccessEnabled(access);
    }
  }, [isAndroid]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Re-check when app comes back to foreground (after user toggles in Settings)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkStatus();
    });
    return () => sub.remove();
  }, [checkStatus]);

  const handleGrant = async () => {
    await setConsent(true);
    setConsentGranted(true);

    // If system-level access isn't enabled yet, prompt user to enable it
    if (isAndroid) {
      const access = await isNotificationAccessEnabled();
      if (!access) {
        Alert.alert(
          "Enable Notification Access",
          'To read TNG eWallet notifications, you need to enable Notification Access for this app in Android Settings.\n\nTap "Open Settings" to proceed.',
          [
            { text: "Later", style: "cancel" },
            {
              text: "Open Settings",
              onPress: () => openNotificationAccessSettings(),
            },
          ],
        );
      }
    }
  };

  const handleRevoke = async () => {
    await setConsent(false);
    setConsentGranted(false);
  };

  if (!isAndroid) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Ionicons name="phone-portrait-outline" size={48} color="#999" />
          <Text style={styles.unavailableText}>
            This feature is only available on Android devices.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Ionicons name="shield-checkmark" size={48} color="#1E3A8A" />
        <Text style={styles.headerTitle}>TNG eWallet Notification Access</Text>
        <Text style={styles.headerSubtitle}>
          Automatic transaction tracking from your Touch &apos;n Go eWallet
          notifications
        </Text>
      </View>

      {/* What This Feature Does */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>What this feature does</Text>
        <View style={styles.bulletRow}>
          <Ionicons name="notifications-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            Reads notifications from the TNG eWallet app
            (my.com.tngdigital.ewallet) in the background
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="sparkles-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            Sends notification text to our AI (Gemini) to determine if it&apos;s
            a payment, incoming money, or general/promotional content
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="receipt-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            Automatically records outgoing payments and incoming money as
            transactions in your account, including amount, merchant, and
            category
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="close-circle-outline" size={18} color="#666" />
          <Text style={styles.bulletText}>
            Promotional or general notifications are discarded and not stored
          </Text>
        </View>
      </View>

      {/* Data & Privacy */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Data &amp; Privacy</Text>
        <View style={styles.bulletRow}>
          <Ionicons name="lock-closed-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            Only notifications from TNG eWallet are read — no other app&apos;s
            notifications are accessed
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="server-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            Notification content is sent to our server only for classification
            and is not stored beyond the resulting transaction record
          </Text>
        </View>
        <View style={styles.bulletRow}>
          <Ionicons name="toggle-outline" size={18} color="#1E3A8A" />
          <Text style={styles.bulletText}>
            You can revoke this consent at any time from Settings — existing
            recorded transactions will remain
          </Text>
        </View>
      </View>

      {/* Permission Required */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Permission required</Text>
        <Text style={styles.bodyText}>
          This feature uses Android&apos;s{" "}
          <Text style={styles.bold}>Notification Access</Text> permission. After
          granting consent here, you will be asked to enable it in your
          device&apos;s system settings. This is a sensitive permission —
          Android will show a warning. You may disable it at any time from
          Settings → Apps → Special app access → Notification access.
        </Text>
      </View>

      {/* Current Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>In-app consent:</Text>
          <Text
            style={[
              styles.statusValue,
              { color: consentGranted ? "#16A34A" : "#DC2626" },
            ]}
          >
            {consentGranted ? "Granted" : "Not granted"}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>System notification access:</Text>
          <Text
            style={[
              styles.statusValue,
              { color: systemAccessEnabled ? "#16A34A" : "#DC2626" },
            ]}
          >
            {systemAccessEnabled ? "Enabled" : "Disabled"}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      {!consentGranted ? (
        <TouchableOpacity style={styles.grantButton} onPress={handleGrant}>
          <Ionicons name="checkmark-circle" size={22} color="#FFF" />
          <Text style={styles.grantButtonText}>
            I Understand &amp; Grant Consent
          </Text>
        </TouchableOpacity>
      ) : (
        <View>
          {!systemAccessEnabled && (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={openNotificationAccessSettings}
            >
              <Ionicons name="settings-outline" size={20} color="#FFF" />
              <Text style={styles.settingsButtonText}>
                Open Notification Access Settings
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.revokeButton} onPress={handleRevoke}>
            <Ionicons name="close-circle" size={22} color="#DC2626" />
            <Text style={styles.revokeButtonText}>Revoke Consent</Text>
          </TouchableOpacity>
        </View>
      )}

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
    textAlign: "center",
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 6,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E3A8A",
    marginBottom: 12,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  bold: {
    fontWeight: "700",
  },
  statusCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    marginBottom: 20,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  statusLabel: {
    fontSize: 14,
    color: "#555",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  grantButton: {
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
  },
  grantButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  settingsButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
    marginBottom: 12,
  },
  settingsButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "600",
  },
  revokeButton: {
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
  revokeButtonText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "600",
  },
  unavailableText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginTop: 16,
  },
});
