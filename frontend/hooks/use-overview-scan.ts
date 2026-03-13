/**
 * useOverviewScan — daily financial health overview hook.
 *
 * Behaviour:
 *   • On first mount: checks AsyncStorage for a cached result.
 *     – Cache is fresh (<24 h) → hydrate from cache instantly, no network call.
 *     – Cache is stale or absent → stream fresh data from /overview/demo.
 *   • `refresh()` — forces a new fetch regardless of cache age.
 *   • Persists every successful result to AsyncStorage so the next cold open
 *     is instant.
 *
 * SSE events consumed (subset of the main resilience stream protocol):
 *   step        → updates currentStep for the skeleton loader label
 *   tool_result → populates vitals / score / alert / plan as cards arrive
 *   text        → appended to `analysis` (streams in progressively)
 *   error       → sets error field, clears loading
 *   done        → clears loading, saves cache
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import EventSource from 'react-native-sse';

import { BASE_URL as API_BASE_URL } from '@/services/api';
import type { AlertData, PlanData, ScoreData, VitalsData } from './use-resilience-stream';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OVERVIEW_URL  = `${API_BASE_URL}/api/v1/resilience/overview/demo`;
const CACHE_KEY     = 'finsight_overview_cache_v2';
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type AnalysisData = {
  card: 'analysis';
  overall_standing:  string[];
  emergency_buffer:  string[];
  debt_load:         string[];
  monthly_cash_flow: string[];
  spending_habits:   string[];
  priority_action:   string[];
};

export type OverviewCacheEntry = {
  timestamp: number;
  vitals:    VitalsData    | null;
  score:     ScoreData     | null;
  alert:     AlertData     | null;
  plan:      PlanData      | null;
  analysis:  AnalysisData  | null;
};

export type OverviewState = OverviewCacheEntry & {
  isLoading:   boolean;
  currentStep: string;
  error:       string | null;
};

const INITIAL_STATE: OverviewState = {
  timestamp:   0,
  vitals:      null,
  score:       null,
  alert:       null,
  plan:        null,
  analysis:    null,
  isLoading:   true,
  currentStep: '',
  error:       null,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useOverviewScan() {
  const [state, setState] = useState<OverviewState>(INITIAL_STATE);

  const esRef      = useRef<EventSource | null>(null);
  const abortRef   = useRef<AbortController | null>(null);
  // True once a successful result exists in this session (prevents double-fetch)
  const sessionHitRef = useRef(false);

  // ── SSE raw event handler ───────────────────────────────────────────────
  const handleRaw = useCallback((raw: string) => {
    if (!raw || raw === '[DONE]') return;
    try {
      const event = JSON.parse(raw);
      switch (event.type) {
        case 'step':
          setState((prev) => ({ ...prev, currentStep: event.label ?? '' }));
          break;

        case 'tool_result': {
          const d = event.data;
          if (!d) break;
          setState((prev) => {
            switch (d.card) {
              case 'vitals':   return { ...prev, vitals: d };
              case 'score':    return { ...prev, score: d };
              case 'alert':    return { ...prev, alert: d };
              case 'plan':     return { ...prev, plan: d };
              case 'analysis': return { ...prev, analysis: d as AnalysisData };
              default:         return prev;
            }
          });
          break;
        }

        case 'text':
          // analysis is now structured via show_analysis tool — text tokens ignored
          break;

        case 'error':
          setState((prev) => ({
            ...prev,
            isLoading: false,
            currentStep: '',
            error: event.message ?? 'Something went wrong. Tap refresh to retry.',
          }));
          break;

        case 'done':
          setState((prev) => {
            const now = Date.now();
            const entry: OverviewCacheEntry = {
              timestamp: now,
              vitals:    prev.vitals,
              score:     prev.score,
              alert:     prev.alert,
              plan:      prev.plan,
              analysis:  prev.analysis,
            };
            AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entry)).catch(() => {});
            sessionHitRef.current = true;
            return { ...prev, isLoading: false, currentStep: '', timestamp: now, error: null };
          });
          break;
      }
    } catch {
      // silently ignore parse errors
    }
  }, []);

  // ── Stream from backend ─────────────────────────────────────────────────
  const _stream = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoading:   true,
      currentStep: '',
      analysis:    null,
      vitals:      null,
      score:       null,
      alert:       null,
      plan:        null,
      error:       null,
    }));

    // ── Web: fetch + ReadableStream ────────────────────────────────────────
    if (Platform.OS === 'web') {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      fetch(OVERVIEW_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          if (!res.body) throw new Error('No response body');
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\n\n');
            buf = parts.pop() ?? '';
            for (const part of parts) {
              for (const line of part.split('\n')) {
                if (line.startsWith('data: ')) handleRaw(line.slice(6).trim());
              }
            }
          }
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: 'Connection lost. Tap refresh to retry.',
            }));
          }
        })
        .finally(() => {
          abortRef.current = null;
        });
      return;
    }

    // ── Native: react-native-sse ─────────────────────────────────────────
    const es = new EventSource(OVERVIEW_URL, {
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({}),
      pollingInterval: 0,
    });
    esRef.current = es;

    es.addEventListener('message', (e: any) => {
      if (e.data && e.data !== '[DONE]') handleRaw(e.data);
    });

    es.addEventListener('error', () => {
      es.close();
      esRef.current = null;
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Connection lost. Tap refresh to retry.',
      }));
    });
  }, [handleRaw]);

  // ── Public: force a new fetch ────────────────────────────────────────────
  const refresh = useCallback(() => {
    sessionHitRef.current = false;
    esRef.current?.close();
    esRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    // Clear stale cache so next init also picks up fresh data
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    _stream();
  }, [_stream]);

  // ── On mount: check cache, stream if stale ───────────────────────────────
  useEffect(() => {
    if (sessionHitRef.current) return; // already fetched this session

    let cancelled = false;

    const init = async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached && !cancelled) {
          const data: OverviewCacheEntry = JSON.parse(cached);
          // Migrate old string analysis (pre-structured-output) to null
          if (typeof (data as any).analysis === 'string') {
            (data as any).analysis = null;
          }
          const age = Date.now() - (data.timestamp ?? 0);
          if (age < CACHE_TTL_MS && data.vitals && data.score) {
            setState({
              ...data,
              isLoading:   false,
              currentStep: '',
              error:       null,
            });
            sessionHitRef.current = true;
            return; // served from cache — no network call needed
          }
        }
      } catch {
        // ignore corrupt cache
      }

      if (!cancelled) _stream();
    };

    init();

    return () => {
      cancelled = true;
      esRef.current?.close();
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refresh };
}
