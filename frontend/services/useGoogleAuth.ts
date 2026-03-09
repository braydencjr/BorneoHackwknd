import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

/**
 * Google OAuth client IDs — one per platform.
 *
 * To set these up:
 *   1. Go to https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Create OAuth 2.0 Client IDs for:
 *      - "Web application"  → paste into EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
 *      - "iOS"              → paste into EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
 *      - "Android"          → paste into EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
 *   3. For iOS native, also add bundleIdentifier to app.json → expo.ios.bundleIdentifier
 *   4. For Android native, add google-services.json and reference it in app.json
 *
 * In Expo Go (development), only the web clientId is required.
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID, // fallback to existing key
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  return { request, response, promptAsync };
}