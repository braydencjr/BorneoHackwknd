/**
 * notificationService.ts
 *
 * TypeScript wrapper around the TngNotificationModule native module (Android only).
 * Provides methods to:
 *   - Check / request Notification Access permission
 *   - Listen for incoming TNG eWallet notifications
 *   - Forward notification content to the backend for AI classification
 */

import * as SecureStore from "expo-secure-store";
import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import api from "./api";

// ─── Native module types ──────────────────────────────────────────────────

interface TngNotificationNativeModule {
  isNotificationAccessEnabled(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
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
 * If classified as outgoing payment or incoming money, the backend
 * automatically records it as a transaction.
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
