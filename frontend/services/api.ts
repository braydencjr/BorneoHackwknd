/**
 * api.ts
 * Centralised HTTP client for the FastAPI backend.
 *
 * Usage:
 *   import api from './api';
 *   const data = await api.get('/health');
 *   const user = await api.post('/auth/register', { email, password, name });
 */

import * as SecureStore from 'expo-secure-store';

// ─── Base URL ──────────────────────────────────────────────────────────────
// Change to your machine LAN IP when testing on a physical device,
// or use http://10.0.2.2:8000 for the Android emulator.
const BASE_URL = __DEV__ ? 'http://localhost:8000' : 'https://api.your-domain.com';

const API_PREFIX = '/api/v1';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

// ─── Token helpers ─────────────────────────────────────────────────────────
export async function saveTokens(access: string, refresh: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

// ─── Token refresh ─────────────────────────────────────────────────────────
async function refreshAccessToken(): Promise<string | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;

  const res = await fetch(`${BASE_URL}${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });

  if (!res.ok) {
    await clearTokens();
    return null;
  }

  const { access_token, refresh_token } = await res.json();
  await saveTokens(access_token, refresh_token);
  return access_token;
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(method, path, body, false);
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'An error occurred');
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── Public API ────────────────────────────────────────────────────────────
const api = {
  get:    <T = unknown>(path: string)                        => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown)        => request<T>('POST',   path, body),
  put:    <T = unknown>(path: string, body?: unknown)        => request<T>('PUT',    path, body),
  patch:  <T = unknown>(path: string, body?: unknown)        => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string)                        => request<T>('DELETE', path),
};

export default api;
export { BASE_URL };
