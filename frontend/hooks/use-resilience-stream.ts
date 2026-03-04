import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import EventSource from 'react-native-sse';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type VitalsData = {
  card: 'vitals';
  buffer_months: number;
  buffer_status: 'ok' | 'warning' | 'danger';
  debt_pressure: number;
  debt_status: 'ok' | 'warning' | 'danger';
  cashflow_monthly: number;
  cashflow_status: 'ok' | 'warning' | 'danger';
  habit_score: number;
  habit_status: 'ok' | 'warning' | 'danger';
  monthly_income: number;
  total_expenses: number;
};

export type ScoreData = {
  card: 'score';
  score: number;
  tier: 'strong' | 'moderate' | 'critical';
  verdict: string;
  buffer_months: number;
  dimensions: { buffer: number; debt: number; cashflow: number; habits: number };
};

export type AlertData = {
  card: 'alert';
  urgency: 'critical' | 'high';
  buffer_months: number;
  action_bullets: string[];
  savings_gap: number;
};

export type PlanTier = {
  id: string;
  label: string;
  monthly_save: number;
  weekly_save: number;
  months_to_target: number;
  sacrifice: string;
  tag: string;
  tag_color: 'amber' | 'blue' | 'green';
};

export type PlanData = {
  card: 'plan';
  target_amount: number;
  current_savings: number;
  gap: number;
  monthly_surplus: number;
  tiers: PlanTier[];
};

export type ShockMonth = {
  month: number;
  savings_remaining: number;
  status: 'ok' | 'warning' | 'critical' | 'depleted';
  label: string;
};

export type ShockData = {
  card: 'shock';
  scenario: string;
  scenario_label: string;
  scenario_icon: string;
  scenario_description: string;
  months_simulated: number;
  monthly_burn: number;
  reduced_income: number;
  starting_savings: number;
  timeline: ShockMonth[];
  depletes_at_month: number | null;
  survives: boolean;
};

export type ChipsData = {
  card: 'chips';
  chips: string[];
};

export type CardData = VitalsData | ScoreData | AlertData | PlanData | ShockData | ChipsData;

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool_running'; tool: string }
  | { type: 'tool_result'; tool: string; data: CardData };

export type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  parts: MessagePart[];
};

export type SubagentStatus = {
  status: 'running' | 'done';
  scenario: string;
} | null;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = __DEV__ ? 'http://localhost:8000' : 'https://api.your-domain.com';
const CHAT_URL = `${BASE_URL}/api/v1/resilience/chat/demo`; // switch to /chat for auth

let _idCounter = 0;
const uid = () => `msg_${++_idCounter}_${Date.now()}`;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useResilienceStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [subagentStatus, setSubagentStatus] = useState<SubagentStatus>(null);
  const [resilienceScore, setResilienceScore] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const _appendOrUpdateAgentPart = useCallback((part: MessagePart) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const lastMsg = msgs[msgs.length - 1];
      if (!lastMsg || lastMsg.role !== 'agent') {
        msgs.push({ id: uid(), role: 'agent', parts: [part] });
      } else {
        const lastParts = [...lastMsg.parts];
        if (
          part.type === 'text' &&
          lastParts.length > 0 &&
          lastParts[lastParts.length - 1].type === 'text'
        ) {
          // Append to existing text part
          const existingText = lastParts[lastParts.length - 1] as { type: 'text'; content: string };
          lastParts[lastParts.length - 1] = {
            type: 'text',
            content: existingText.content + part.content,
          };
        } else if (part.type === 'tool_running') {
          // Replace or add tool_running part (only one at a time)
          const idx = lastParts.findLastIndex((p) => p.type === 'tool_running');
          if (idx >= 0) lastParts[idx] = part;
          else lastParts.push(part);
        } else {
          lastParts.push(part);
        }
        msgs[msgs.length - 1] = { ...lastMsg, parts: lastParts };
      }
      return msgs;
    });
  }, []);

  const _removeToolRunning = useCallback((tool: string) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.filter(
        (p) => !(p.type === 'tool_running' && (p as any).tool === tool)
      );
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (isStreaming) return;

      // Close any existing connection
      esRef.current?.close();
      esRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;

      // Append user message
      const userMsg: ChatMessage = {
        id: uid(),
        role: 'user',
        parts: [{ type: 'text', content: text }],
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      // Only send the current message — the backend MemorySaver checkpointer
      // remembers the full conversation history per user thread, so sending
      // prior messages would cause the agent to see duplicated context.
      const body = JSON.stringify({ messages: [{ role: 'user', content: text }] });

      // ─── Shared event handler ───────────────────────────────────────────
      const handleRaw = (data: string) => {
        if (!data || data === '[DONE]') return;
        try {
          const event = JSON.parse(data);
          switch (event.type) {
            case 'text':
              _appendOrUpdateAgentPart({ type: 'text', content: event.content });
              break;
            case 'tool_call':
              if (event.state === 'running') {
                _appendOrUpdateAgentPart({ type: 'tool_running', tool: event.tool });
              }
              break;
            case 'tool_result':
              _removeToolRunning(event.tool);
              _appendOrUpdateAgentPart({ type: 'tool_result', tool: event.tool, data: event.data });
              if (event.tool === 'show_resilience_score' && event.data?.score != null) {
                setResilienceScore(event.data.score);
              }
              break;
            case 'subagent_status':
              setSubagentStatus(
                event.status === 'done' ? null : { status: event.status, scenario: event.scenario }
              );
              break;
            case 'error':
              _appendOrUpdateAgentPart({
                type: 'text',
                content: `⚠️ ${event.message || 'Something went wrong. Please try again.'}`,
              });
              break;
            case 'done':
              setIsStreaming(false);
              setSubagentStatus(null);
              esRef.current?.close();
              esRef.current = null;
              abortRef.current = null;
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      // ─── Web: fetch + ReadableStream (avoids react-native-sse XHR polling) ──
      if (Platform.OS === 'web') {
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: ctrl.signal,
        })
          .then(async (res) => {
            if (!res.body) throw new Error('No response body');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });

              // SSE lines are separated by \n\n; parse all complete events
              const parts = buf.split('\n\n');
              buf = parts.pop() ?? '';   // keep incomplete tail
              for (const part of parts) {
                for (const line of part.split('\n')) {
                  if (line.startsWith('data: ')) {
                    handleRaw(line.slice(6).trim());
                  }
                }
              }
            }
          })
          .catch((err) => {
            if (err?.name !== 'AbortError') {
              _appendOrUpdateAgentPart({ type: 'text', content: '⚠️ Connection lost. Please retry.' });
            }
          })
          .finally(() => {
            setIsStreaming(false);
            setSubagentStatus(null);
            abortRef.current = null;
          });

        return;
      }

      // ─── Native: react-native-sse ─────────────────────────────────────────
      const es = new EventSource(CHAT_URL, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body,
        pollingInterval: 0,
      });

      esRef.current = es;

      es.addEventListener('message', (e: any) => {
        if (!e.data || e.data === '[DONE]') return;
        handleRaw(e.data);
      });

      es.addEventListener('error', () => {
        es.close();          // stop react-native-sse from polling/retrying
        esRef.current = null;
        setIsStreaming(false);
        setSubagentStatus(null);
      });
    },
    [isStreaming, _appendOrUpdateAgentPart, _removeToolRunning]
  );

  const triggerAutoScan = useCallback(() => {
    sendMessage('Run my financial health scan');
  }, [sendMessage]);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setIsStreaming(false);
    setSubagentStatus(null);
    setResilienceScore(null);
  }, []);

  return {
    messages,
    isStreaming,
    subagentStatus,
    resilienceScore,
    sendMessage,
    triggerAutoScan,
    reset,
  };
}
