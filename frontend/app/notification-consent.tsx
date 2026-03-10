import {
    hasConsent,
    isNotificationAccessEnabled,
    openAppDetailsSettings,
    openBackgroundProtectionSettings,
    openBatteryOptimizationSettings,
    openNotificationAccessSettings,
    requestNotificationListenerRebind,
    setConsent,
} from "@/services/notificationService";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
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
  const { next } = useLocalSearchParams<{ next?: string }>();
  const nextRoute = typeof next === "string" ? next : null;
  const [consentGranted, setConsentGranted] = useState(false);
  const [systemAccessEnabled, setSystemAccessEnabled] = useState(false);
  const [rebindStatus, setRebindStatus] = useState<
    "idle" | "requesting" | "done" | "error"
  >("idle");
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
    await checkStatus();
  };

  const handleRevoke = async () => {
    await setConsent(false);
    setConsentGranted(false);
    setRebindStatus("idle");
  };

  const handleRebind = async () => {
    setRebindStatus("requesting");
    try {
      await requestNotificationListenerRebind();
      setRebindStatus("done");
      // Wait a moment then re-check if the bind succeeded
      setTimeout(() => checkStatus(), 2000);
    } catch {
      setRebindStatus("error");
    }
  };

  const handleContinue = () => {
    if (nextRoute) {
      router.replace(nextRoute as any);
    }
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

      <View style={styles.hintCard}>
        <Ionicons name="information-circle-outline" size={18} color="#92400E" />
        <Text style={styles.hintText}>
          Some Android devices block sensitive toggles for sideloaded or newly
          installed apps. If notification access is disabled or cannot be
          switched on, open this app&apos;s system settings and enable
          <Text style={styles.bold}> Allow restricted settings</Text>, then come
          back and try again.
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
          {/* Setup Checklist */}
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Setup Checklist</Text>
            <Text style={styles.setupSubtitle}>
              Complete all steps for automatic transaction tracking to work
              reliably.
            </Text>

            {/* Step 1: Notification Access */}
            <View style={styles.setupStep}>
              <View style={styles.setupStepHeader}>
                <View style={styles.setupStepLeft}>
                  <Ionicons
                    name={
                      systemAccessEnabled ? "checkmark-circle" : "close-circle"
                    }
                    size={22}
                    color={systemAccessEnabled ? "#16A34A" : "#DC2626"}
                  />
                  <View style={styles.setupStepInfo}>
                    <Text style={styles.setupStepTitle}>
                      Notification Access
                    </Text>
                    <Text
                      style={[
                        styles.setupStepStatus,
                        { color: systemAccessEnabled ? "#16A34A" : "#DC2626" },
                      ]}
                    >
                      {systemAccessEnabled ? "Enabled" : "Disabled"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.setupStepButton}
                  onPress={openNotificationAccessSettings}
                >
                  <Text style={styles.setupStepButtonText}>Open</Text>
                  <Ionicons name="open-outline" size={14} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <Text style={styles.setupStepDesc}>
                Allow this app to read TNG eWallet notifications in the
                background.
              </Text>
            </View>

            {/* Step 2: Autostart / Background */}
            <View style={styles.setupStep}>
              <View style={styles.setupStepHeader}>
                <View style={styles.setupStepLeft}>
                  <Ionicons
                    name="refresh-circle-outline"
                    size={22}
                    color="#F59E0B"
                  />
                  <View style={styles.setupStepInfo}>
                    <Text style={styles.setupStepTitle}>
                      Autostart / Background
                    </Text>
                    <Text
                      style={[styles.setupStepStatus, { color: "#92400E" }]}
                    >
                      Tap to configure
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.setupStepButton}
                  onPress={() => openBackgroundProtectionSettings()}
                >
                  <Text style={styles.setupStepButtonText}>Open</Text>
                  <Ionicons name="open-outline" size={14} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <Text style={styles.setupStepDesc}>
                Enable Autostart for this app so the notification listener
                isn&apos;t killed by the system (required on Xiaomi/MIUI, OPPO,
                Vivo, Huawei).
              </Text>
            </View>

            {/* Step 3: Battery Optimization */}
            <View style={styles.setupStep}>
              <View style={styles.setupStepHeader}>
                <View style={styles.setupStepLeft}>
                  <Ionicons
                    name="battery-charging-outline"
                    size={22}
                    color="#F59E0B"
                  />
                  <View style={styles.setupStepInfo}>
                    <Text style={styles.setupStepTitle}>
                      Battery Optimization
                    </Text>
                    <Text
                      style={[styles.setupStepStatus, { color: "#92400E" }]}
                    >
                      Tap to configure
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.setupStepButton}
                  onPress={() => openBatteryOptimizationSettings()}
                >
                  <Text style={styles.setupStepButtonText}>Open</Text>
                  <Ionicons name="open-outline" size={14} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <Text style={styles.setupStepDesc}>
                Set this app to &ldquo;Unrestricted&rdquo; or &ldquo;No
                restrictions&rdquo; so Android doesn&apos;t kill the background
                service.
              </Text>
            </View>

            {/* Step 4: App Details (restricted settings) */}
            <View
              style={[
                styles.setupStep,
                { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
              ]}
            >
              <View style={styles.setupStepHeader}>
                <View style={styles.setupStepLeft}>
                  <Ionicons name="shield-outline" size={22} color="#6366F1" />
                  <View style={styles.setupStepInfo}>
                    <Text style={styles.setupStepTitle}>
                      App Details Settings
                    </Text>
                    <Text
                      style={[styles.setupStepStatus, { color: "#4338CA" }]}
                    >
                      If toggle is grayed out
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.setupStepButton}
                  onPress={() => openAppDetailsSettings()}
                >
                  <Text style={styles.setupStepButtonText}>Open</Text>
                  <Ionicons name="open-outline" size={14} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <Text style={styles.setupStepDesc}>
                If Notification Access cannot be toggled, open App Details and
                enable{" "}
                <Text style={styles.bold}>Allow restricted settings</Text>.
              </Text>
            </View>
          </View>

          {/* Re-check Status */}
          <TouchableOpacity style={styles.recheckButton} onPress={checkStatus}>
            <Ionicons name="refresh-outline" size={18} color="#1E3A8A" />
            <Text style={styles.recheckButtonText}>Re-check Status</Text>
          </TouchableOpacity>

          {/* MIUI / OEM Troubleshooting */}
          {!systemAccessEnabled && (
            <View style={styles.troubleshootCard}>
              <View style={styles.troubleshootHeader}>
                <Ionicons name="warning-outline" size={20} color="#92400E" />
                <Text style={styles.troubleshootTitle}>
                  Still blocked? (Xiaomi / MIUI &amp; other OEMs)
                </Text>
              </View>
              <Text style={styles.troubleshootBody}>
                Some devices (Xiaomi, OPPO, Vivo, Huawei) cache a binding
                rejection even after you enable Autostart and battery settings.
                Follow these steps:
              </Text>
              <View style={styles.troubleshootStep}>
                <Text style={styles.troubleshootNum}>1</Text>
                <Text style={styles.troubleshootStepText}>
                  Confirm <Text style={styles.bold}>Autostart</Text> is ON and
                  battery restriction is set to{" "}
                  <Text style={styles.bold}>No restrictions</Text> (steps 2
                  &amp; 3 above).
                </Text>
              </View>
              <View style={styles.troubleshootStep}>
                <Text style={styles.troubleshootNum}>2</Text>
                <Text style={styles.troubleshootStepText}>
                  Tap <Text style={styles.bold}>Force Rebind</Text> below — this
                  tells Android to retry connecting the notification service
                  without re-toggling.
                </Text>
              </View>
              <View style={styles.troubleshootStep}>
                <Text style={styles.troubleshootNum}>3</Text>
                <Text style={styles.troubleshootStepText}>
                  If the rebind doesn&apos;t work, open{" "}
                  <Text style={styles.bold}>Notification Access</Text> (step 1
                  above), toggle this app <Text style={styles.bold}>OFF</Text>,
                  then back <Text style={styles.bold}>ON</Text>, then tap
                  Re‑check Status.
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.rebindButton,
                  rebindStatus === "requesting" && { opacity: 0.6 },
                ]}
                onPress={handleRebind}
                disabled={rebindStatus === "requesting"}
              >
                <Ionicons
                  name={
                    rebindStatus === "done"
                      ? "checkmark-circle-outline"
                      : rebindStatus === "error"
                        ? "alert-circle-outline"
                        : "sync-outline"
                  }
                  size={18}
                  color="#FFF"
                />
                <Text style={styles.rebindButtonText}>
                  {rebindStatus === "requesting"
                    ? "Requesting…"
                    : rebindStatus === "done"
                      ? "Rebind Requested — Check Status"
                      : rebindStatus === "error"
                        ? "Rebind Failed — Try Toggle Instead"
                        : "Force Rebind Service"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {systemAccessEnabled && nextRoute && (
            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
            >
              <Ionicons name="arrow-forward-circle" size={22} color="#FFF" />
              <Text style={styles.continueButtonText}>Continue to App</Text>
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
  hintCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
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
  continueButton: {
    backgroundColor: "#1E3A8A",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
    marginBottom: 12,
  },
  continueButtonText: {
    color: "#FFF",
    fontSize: 16,
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
  setupCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    marginBottom: 12,
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E3A8A",
    marginBottom: 4,
  },
  setupSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  setupStep: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    paddingBottom: 14,
    marginBottom: 14,
  },
  setupStepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  setupStepLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  setupStepInfo: {
    flex: 1,
  },
  setupStepTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#222",
  },
  setupStepStatus: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 1,
  },
  setupStepButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EEF2FF",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  setupStepButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E3A8A",
  },
  setupStepDesc: {
    fontSize: 12,
    color: "#666",
    lineHeight: 17,
    paddingLeft: 32,
  },
  recheckButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EEF2FF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#C7D2FE",
    marginBottom: 12,
  },
  recheckButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E3A8A",
  },
  troubleshootCard: {
    backgroundColor: "#FFF7ED",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FED7AA",
    marginBottom: 12,
  },
  troubleshootHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  troubleshootTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    flex: 1,
  },
  troubleshootBody: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
    marginBottom: 12,
  },
  troubleshootStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  troubleshootNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F59E0B",
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
    overflow: "hidden",
  },
  troubleshootStepText: {
    flex: 1,
    fontSize: 13,
    color: "#78350F",
    lineHeight: 18,
  },
  rebindButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D97706",
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
  },
  rebindButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFF",
  },
});
