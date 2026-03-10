/**
 * notificationService.ts
 *
 * TypeScript wrapper around the TngNotificationModule native module (Android only).
 * Provides methods to:
 *   - Check / request Notification Access permission
 *   - Listen for incoming TNG eWallet notifications
 *   - Forward notification content to the backend for AI classification
 *   - Show local notifications prompting user to record transactions
 */

import * as SecureStore from "expo-secure-store";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import api, { BASE_URL } from "./api";

// ─── Native module types ──────────────────────────────────────────────────

interface TngNotificationNativeModule {
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
  openAppDetailsSettings(): Promise<boolean>;
  openBatteryOptimizationSettings(): Promise<boolean>;
  openBackgroundProtectionSettings(): Promise<
    "oem_background" | "battery_optimization" | "app_details" | "none"
  >;
  requestNotificationListenerRebind(): Promise<boolean>;
  syncCredentials(accessToken: string, apiUrl: string): Promise<boolean>;
}

export interface TngNotificationPayload {
  title: string;
  text: string;
  subText: string;
  timestamp: string;
  packageName: string;
}

export interface NotificationClassification {
  classification: "general" | "outgoing_payment" | "incoming_money";
  merchant_name: string | null;
  amount: number | null;
  category: string | null;
  description: string | null;
  recorded: boolean;
}

// ─── Module access ────────────────────────────────────────────────────────

const CONSENT_KEY = "notificationConsentV1";

function getNativeModule(): TngNotificationNativeModule | null {
  if (Platform.OS !== "android") return null;
  return NativeModules.TngNotificationModule ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Check whether the user has granted Notification Access in Android settings. */
export async function isNotificationAccessEnabled(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  return mod.isNotificationAccessEnabled();
}

/** Open the Android Notification Access settings screen. */
export async function openNotificationAccessSettings(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  await mod.openNotificationAccessSettings();
}

/** Open this app's details settings screen. */
export async function openAppDetailsSettings(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  await mod.openAppDetailsSettings();
}

/** Open battery optimization settings. */
export async function openBatteryOptimizationSettings(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;
  await mod.openBatteryOptimizationSettings();
}

/**
 * Best-effort open OEM background/autostart settings.
 * Returns which page was opened, if any.
 */
export async function openBackgroundProtectionSettings(): Promise<
  "oem_background" | "battery_optimization" | "app_details" | "none"
> {
  const mod = getNativeModule();
  if (!mod) return "none";
  return mod.openBackgroundProtectionSettings();
}

/**
 * Request the system to rebind the NotificationListenerService.
 * Call this after enabling Autostart/Battery settings to force MIUI/OEM to
 * retry the bind without needing to re-toggle Notification Access manually.
 * Returns true if the rebind was requested, false on older API levels.
 */
export async function requestNotificationListenerRebind(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  return mod.requestNotificationListenerRebind();
}

/** Check whether the user has granted in-app consent. */
export async function hasConsent(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(CONSENT_KEY);
  return value === "granted";
}

/** Save consent decision. */
export async function setConsent(granted: boolean): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, granted ? "granted" : "declined");
}

/**
 * Subscribe to TNG eWallet notification events.
 * Returns an unsubscribe function.
 * Only works on Android when consent is granted.
 */
export function subscribeTngNotifications(
  callback: (data: TngNotificationPayload) => void,
): () => void {
  if (Platform.OS !== "android") return () => {};

  const mod = getNativeModule();
  if (!mod) return () => {};

  const emitter = new NativeEventEmitter(NativeModules.TngNotificationModule);
  const subscription = emitter.addListener("onTngNotification", callback);

  return () => subscription.remove();
}

/**
 * Send captured notification text to backend for Gemini AI classification.
 * The backend auto-records the transaction if it's not "general".
 */
export async function classifyNotification(
  title: string,
  text: string,
): Promise<NotificationClassification> {
  return api.post<NotificationClassification>("/notifications/classify", {
    title,
    text,
  });
}

/**
 * Sync the access token and API URL to SharedPreferences so the Kotlin
 * NotificationListenerService can call the backend API even when the
 * React Native app is not running.
 */
export async function syncCredentials(): Promise<void> {
  const mod = getNativeModule();
  if (!mod) return;

  const token = await SecureStore.getItemAsync("accessToken");
  if (!token) {
    console.log("[syncCredentials] No access token — skipping");
    return;
  }

  await mod.syncCredentials(token, BASE_URL);
  console.log("[syncCredentials] Credentials synced to native layer");
}
