import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import {
    classifyNotification,
    hasConsent,
    subscribeTngNotifications,
    type TngNotificationPayload,
} from "@/services/notificationService";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Background TNG notification listener (Android only)
  useEffect(() => {
    if (Platform.OS !== "android") return;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      const consentGranted = await hasConsent();
      if (!consentGranted) return;

      unsubscribe = subscribeTngNotifications(
        async (data: TngNotificationPayload) => {
          try {
            const result = await classifyNotification(data.title, data.text);
            if (result.recorded) {
              console.log(
                `[TNG] Recorded ${result.classification}: RM${result.amount} at ${result.merchant_name}`,
              );
            }
          } catch (err) {
            console.warn("[TNG] Failed to classify notification:", err);
          }
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
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
