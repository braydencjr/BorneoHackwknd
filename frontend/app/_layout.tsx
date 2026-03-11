import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  hasConsent,
  isNotificationAccessEnabled,
  subscribeTngNotifications,
  syncCredentials,
  type TngNotificationPayload,
} from "@/services/notificationService";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  // Force an explicit consent + system permission step before listener usage.
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let cancelled = false;

    (async () => {
      const inMainApp = segments[0] === "(tabs)";
      const onConsentScreen = segments[0] === "notification-consent";
      if (!inMainApp || onConsentScreen) return;

      const [consentGranted, accessEnabled] = await Promise.all([
        hasConsent(),
        isNotificationAccessEnabled(),
      ]);

      if (!cancelled && (!consentGranted || !accessEnabled)) {
        router.push("/notification-consent");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, segments]);

  // Sync credentials to native layer so Kotlin service can call API independently
  useEffect(() => {
    if (Platform.OS !== "android") return;

    (async () => {
      // Request POST_NOTIFICATIONS permission on Android 13+
      if (Number(Platform.Version) >= 33) {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
      }

      await syncCredentials();
    })().catch((err) =>
      console.warn("[Layout] Failed to sync credentials:", err),
    );
  }, []);

  // Background TNG notification listener (Android only) — just log in JS,
  // the Kotlin service handles API calls and native notifications directly.
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      const consentGranted = await hasConsent();
      if (!consentGranted) return;

      unsubscribe = subscribeTngNotifications(
        (data: TngNotificationPayload) => {
          console.log(
            `[TNG] Notification received: "${data.title}" — "${data.text}"`,
          );
        },
      );
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* Landing page */}
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Tabs (main app after login) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        <Stack.Screen
          name="notification-consent"
          options={{ title: "Notification Consent" }}
        />

        <Stack.Screen
          name="add-transaction"
          options={{ title: "Record Transaction" }}
        />

        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
