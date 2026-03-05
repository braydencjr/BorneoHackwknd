/**
 * authService.ts
 * Typed wrapper around auth-related API calls.
 * Uses the shared api client (api.ts) which handles token refresh automatically.
 */

import api, { clearTokens, saveTokens } from "./api";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface UserProfile {
  email: string;
  name: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ─── Service ───────────────────────────────────────────────────────────────

export const authService = {
  async register(payload: RegisterPayload): Promise<UserProfile> {
    return api.post<UserProfile>("/auth/register", payload);
  },

  async login(payload: LoginPayload): Promise<void> {
    const formBody = new URLSearchParams({
      username: payload.username,
      password: payload.password,
    }).toString();

    const res = await fetch(
      `${(await import("./api")).BASE_URL}/api/v1/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail ?? "Login failed");
    }

    const { access_token, refresh_token }: TokenResponse = await res.json();
    await saveTokens(access_token, refresh_token);
  },

  async me(): Promise<UserProfile> {
    return api.get<UserProfile>("/auth/me");
  },

  async logout(): Promise<void> {
    await clearTokens();
  },
};

// ─── Google Login ──────────────────────────────────────────────────────────

export async function loginWithGoogle(idToken: string | undefined) {
  if (!idToken) return;

  const res = await fetch("http://localhost:3000/auth/google", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: idToken,
    }),
  });

  const data = await res.json();

  console.log("Backend response:", data);

  return data;
}
