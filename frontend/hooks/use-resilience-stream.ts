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

export type CanvasData = {
  card: 'canvas';
  title: string;
  html: string;
};

export type CardData = VitalsData | ScoreData | AlertData | PlanData | ShockData | ChipsData | CanvasData;

export type ThinkingStep = {
  id: string;
  tool: string;
  label: string;
  status: 'running' | 'done';
  timestamp: number;
};

export type MessagePart =
  | { type: 'text'; content: string }
  | { type: 'tool_running'; tool: string }
  | { type: 'tool_result'; tool: string; data: CardData }
  | { type: 'subagent_running'; label: string; isLesson: boolean }
  | { type: 'hitl_approval'; topic: string; message: string; decision?: 'approved' | 'rejected' }
  | { type: 'thinking'; steps: ThinkingStep[]; collapsed: boolean };

export type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  parts: MessagePart[];
};

export type SubagentStatus = {
  status: 'running' | 'done';
  scenario: string;
  /** Current intermediate step label emitted by the educator subagent */
  step?: string;
} | null;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BASE_URL = __DEV__ ? 'http://localhost:8000' : 'https://api.your-domain.com';
const CHAT_URL = `${BASE_URL}/api/v1/resilience/chat/demo`; // switch to /chat for auth
const RESUME_URL = `${BASE_URL}/api/v1/resilience/chat/demo/resume`; // switch to /resume for auth

let _idCounter = 0;
const uid = () => `msg_${++_idCounter}_${Date.now()}`;

let _stepIdCounter = 0;
const stepUid = () => `step_${++_stepIdCounter}_${Date.now()}`;

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
        } else if (part.type === 'subagent_running') {
          // Replace or add subagent_running part (only one at a time)
          const idx = lastParts.findLastIndex((p) => p.type === 'subagent_running');
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

  /** Remove the inline subagent progress row from the last agent message */
  const _removeSubagentRunning = useCallback(() => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.filter((p) => p.type !== 'subagent_running');
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  /** Update the label on the existing inline subagent progress row */
  const _updateSubagentRunningLabel = useCallback((label: string) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.map((p) =>
        p.type === 'subagent_running' ? { ...p, label } : p
      );
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  // ─── Thinking block helpers ─────────────────────────────────────────────────

  /** Ensure a thinking block exists in the last agent message. Returns updated messages. */
  const _ensureThinkingBlock = useCallback(() => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') {
        // Create new agent message with thinking block
        msgs.push({
          id: uid(),
          role: 'agent',
          parts: [{ type: 'thinking', steps: [], collapsed: false }],
        });
        return msgs;
      }
      // Check if thinking block already exists
      const hasThinking = last.parts.some((p) => p.type === 'thinking');
      if (!hasThinking) {
        const parts = [{ type: 'thinking' as const, steps: [] as ThinkingStep[], collapsed: false }, ...last.parts];
        msgs[msgs.length - 1] = { ...last, parts };
      }
      return msgs;
    });
  }, []);

  /** Add a step to the thinking block */
  const _addThinkingStep = useCallback((tool: string, label: string) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.map((p) => {
        if (p.type === 'thinking') {
          const newStep: ThinkingStep = {
            id: stepUid(),
            tool,
            label,
            status: 'running',
            timestamp: Date.now(),
          };
          return { ...p, steps: [...p.steps, newStep] };
        }
        return p;
      });
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  /** Mark a step as done in the thinking block */
  const _markThinkingStepDone = useCallback((tool: string) => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.map((p) => {
        if (p.type === 'thinking') {
          const steps = p.steps.map((s) =>
            s.tool === tool && s.status === 'running' ? { ...s, status: 'done' as const } : s
          );
          return { ...p, steps };
        }
        return p;
      });
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  /** Collapse the thinking block (all steps done) */
  const _collapseThinking = useCallback(() => {
    setMessages((prev) => {
      const msgs = [...prev];
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'agent') return prev;
      const parts = last.parts.map((p) => {
        if (p.type === 'thinking') {
          // Mark all remaining running steps as done and collapse
          const steps = p.steps.map((s) =>
            s.status === 'running' ? { ...s, status: 'done' as const } : s
          );
          return { ...p, steps, collapsed: true };
        }
        return p;
      });
      msgs[msgs.length - 1] = { ...last, parts };
      return msgs;
    });
  }, []);

  /** Human-readable tool label for the thinking block */
  const _toolLabel = (tool: string): string => {
    const labels: Record<string, string> = {
      display_vitals: 'Reading vital signs…',
      show_resilience_score: 'Calculating resilience score…',
      trigger_emergency_alert: 'Checking emergency signals…',
      show_savings_plan: 'Building savings plan…',
      suggest_actions: 'Generating actions…',
      simulate_shock: 'Simulating financial shock…',
      request_lesson_approval: 'Preparing interactive lesson…',
      generate_canvas: 'Rendering interactive lesson…',
    };
    return labels[tool] ?? `Running ${tool}…`;
  };

  // ─── Shared SSE event handler (used by both sendMessage and sendResume) ─────
  const handleRaw = useCallback((data: string) => {
    if (!data || data === '[DONE]') return;
    try {
      const event = JSON.parse(data);
      switch (event.type) {
        case 'thinking':
          if (event.state === 'start') {
            _ensureThinkingBlock();
          }
          // 'stop' is ignored — we collapse on 'done' or when text arrives
          break;
        case 'step':
          // Real-time step label from the backend — add to thinking block
          _ensureThinkingBlock();
          _addThinkingStep(event.tool, event.label);
          break;
        case 'text':
          // Collapse thinking block when text starts arriving
          _collapseThinking();
          _appendOrUpdateAgentPart({ type: 'text', content: event.content });
          break;
        case 'tool_call':
          if (event.state === 'running') {
            _ensureThinkingBlock();
            _addThinkingStep(event.tool, _toolLabel(event.tool));
          } else if (event.state === 'done') {
            _markThinkingStepDone(event.tool);
            _removeToolRunning(event.tool);
          }
          break;
        case 'tool_result':
          _markThinkingStepDone(event.tool);
          _removeToolRunning(event.tool);
          _appendOrUpdateAgentPart({ type: 'tool_result', tool: event.tool, data: event.data });
          if (event.tool === 'show_resilience_score' && event.data?.score != null) {
            setResilienceScore(event.data.score);
          }
          break;
        case 'subagent_status':
          if (event.status === 'done') {
            setSubagentStatus(null);
            _removeSubagentRunning();
          } else {
            setSubagentStatus({ status: event.status, scenario: event.scenario });
            const isLesson = (event.scenario as string).startsWith('lesson:');
            const initLabel = isLesson
              ? '📚 Building interactive lesson…'
              : `🔬 Simulating ${event.scenario.replace('_', ' ')} scenario…`;
            _ensureThinkingBlock();
            _addThinkingStep('subagent', initLabel);
            _appendOrUpdateAgentPart({ type: 'subagent_running', label: initLabel, isLesson });
          }
          break;
        case 'subagent_step':
          setSubagentStatus((prev) =>
            prev ? { ...prev, step: event.label } : { status: 'running', scenario: '', step: event.label }
          );
          _addThinkingStep(event.step, event.label);
          _updateSubagentRunningLabel(event.label);
          break;
        case 'hitl_request':
          // Collapse thinking before showing approval card
          _collapseThinking();
          _appendOrUpdateAgentPart({
            type: 'hitl_approval',
            topic: event.topic ?? 'this topic',
            message: event.message ?? 'The AI wants to open an interactive lesson. Approve?',
          });
          break;
        case 'error':
          _collapseThinking();
          _appendOrUpdateAgentPart({
            type: 'text',
            content: `⚠️ ${event.message || 'Something went wrong. Please try again.'}`,
          });
          break;
        case 'done':
          _collapseThinking();
          setIsStreaming(false);
          setSubagentStatus(null);
          _removeSubagentRunning();
          esRef.current?.close();
          esRef.current = null;
          abortRef.current = null;
          break;
      }
    } catch {
      // ignore parse errors
    }
  }, [
    _appendOrUpdateAgentPart, _removeToolRunning, _removeSubagentRunning,
    _updateSubagentRunningLabel, _ensureThinkingBlock, _addThinkingStep,
    _markThinkingStepDone, _collapseThinking, setResilienceScore,
  ]);

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

      // ─── Web: fetch + ReadableStream ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isStreaming, handleRaw]
  );

  const triggerAutoScan = useCallback(() => {
    sendMessage('Run my financial health scan');
  }, [sendMessage]);

  /**
   * Resume an interrupted run after the user approves or rejects the lesson.
   * Marks the inline approval card with the decision, then continues streaming.
   */
  const sendResume = useCallback(
    (approved: boolean, reason = '') => {
      // Stamp the decision onto the hitl_approval part so the card updates,
      // then push a fresh empty agent message so resumed text starts a new bubble
      // instead of appending into the HITL card's bubble.
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (!last || last.role !== 'agent') return prev;
        const parts = last.parts.map((p) =>
          p.type === 'hitl_approval'
            ? { ...p, decision: (approved ? 'approved' : 'rejected') as 'approved' | 'rejected' }
            : p
        );
        msgs[msgs.length - 1] = { ...last, parts };
        // Fresh bubble for the resumed response
        msgs.push({ id: uid(), role: 'agent', parts: [] as MessagePart[] });
        return msgs;
      });

      setIsStreaming(true);
      const body = JSON.stringify({ approved, reason: reason || (approved ? 'Approved' : 'Skipped') });

      if (Platform.OS === 'web') {
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        fetch(RESUME_URL, {
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
            if (err?.name !== 'AbortError')
              _appendOrUpdateAgentPart({ type: 'text', content: '⚠️ Connection lost. Please retry.' });
          })
          .finally(() => { setIsStreaming(false); setSubagentStatus(null); abortRef.current = null; });
        return;
      }

      const es = new EventSource(RESUME_URL, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body,
        pollingInterval: 0,
      });
      esRef.current = es;
      es.addEventListener('message', (e: any) => { if (e.data && e.data !== '[DONE]') handleRaw(e.data); });
      es.addEventListener('error', () => {
        es.close(); esRef.current = null; setIsStreaming(false); setSubagentStatus(null);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [_appendOrUpdateAgentPart, _removeSubagentRunning, handleRaw]
  );

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
    sendResume,
    triggerAutoScan,
    reset,
  };
}
