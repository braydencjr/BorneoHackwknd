/**
 * ResiliencePage — Financial resilience dashboard + chat interface.
 *
 * Architecture:
 *   ┌───────────────────────────────────┐
 *   │  Compact Score Banner (fixed)     │  ← Always visible
 *   ├───────────────────────────────────┤
 *   │  Metric Pills (horizontal scroll) │  ← Vitals summary
 *   │  Alert Banner (conditional)       │  ← If score < 40
 *   │  Savings Plan (collapsible)       │  ← Selectable tiers
 *   │  ─────── Chat Messages ──────────  │  ← Text + shock/canvas
 *   ├───────────────────────────────────┤
 *   │  [Chips]  [Input bar]      [Send] │  ← Fixed bottom
 *   └───────────────────────────────────┘
 *
 * Dashboard cards are rendered as fixed sections. The agent is auto-triggered
 * on mount; subsequent interactions use the chat input.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ResilienceChat from '@/components/resilience/resilience-chat';
import {
  useResilienceStream,
  type AlertData,
  type ChatMessage,
  type ChipsData,
  type PlanData,
  type ScoreData,
  type VitalsData,
} from '@/hooks/use-resilience-stream';

// ─── Theme ───────────────────────────────────────────────────────────────────
const T = {
  bg: '#060D1A',
  surface: '#0D1826',
  surfaceRaised: '#111F33',
  border: 'rgba(79,142,247,0.12)',
  borderActive: 'rgba(79,142,247,0.35)',
  brand: '#1E3A8A',
  accent: '#4F8EF7',
  green: '#0FB67C',
  amber: '#F5A623',
  red: '#FF4757',
  text: '#E8EEFF',
  textSecondary: '#7A90B5',
  textMuted: '#4A6080',
  userBubble: '#1E3A8A',
  inputBg: '#0F1D30',
};

// ─── Helpers: extract latest dashboard data from messages ────────────────────
function extractDashboard(messages: ChatMessage[]) {
  let vitals: VitalsData | null = null;
  let score: ScoreData | null = null;
  let alert: AlertData | null = null;
  let plan: PlanData | null = null;
  let chips: ChipsData | null = null;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== 'tool_result') continue;
      const d = part.data;
      if (!d) continue;
      switch (d.card) {
        case 'vitals': vitals = d; break;
        case 'score':  score = d;  break;
        case 'alert':  alert = d;  break;
        case 'plan':   plan = d;   break;
        case 'chips':  chips = d;  break;
      }
    }
  }
  return { vitals, score, alert, plan, chips };
}

/** Filter message parts so the chat area does NOT re-render dashboard cards */
function chatMessages(messages: ChatMessage[]): ChatMessage[] {
  const DASHBOARD_CARDS = new Set(['vitals', 'score', 'alert', 'plan']);
  return messages
    .map((msg) => {
      if (msg.role !== 'agent') return msg;
      const filtered = msg.parts.filter((p) => {
        if (p.type === 'tool_result' && DASHBOARD_CARDS.has(p.data?.card)) return false;
        return true;
      });
      if (filtered.length === 0) return null;
      return { ...msg, parts: filtered };
    })
    .filter(Boolean) as ChatMessage[];
}

// ─── Score Banner (fixed header) ─────────────────────────────────────────────
function ScoreBanner({ score, isLoading }: { score: ScoreData | null; isLoading: boolean }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isLoading]);

  const tierColor = score
    ? score.tier === 'strong' ? T.green : score.tier === 'moderate' ? T.amber : T.red
    : T.accent;
  const tierLabel = score
    ? score.tier === 'strong' ? 'RESILIENT' : score.tier === 'moderate' ? 'AT RISK' : 'CRITICAL'
    : '—';

  return (
    <View style={styles.scoreBanner}>
      <View style={styles.scoreBannerLeft}>
        <View style={[styles.scoreIndicator, { backgroundColor: tierColor }]} />
        <Text style={styles.scoreBannerLabel}>RESILIENCE</Text>
      </View>

      {score ? (
        <View style={styles.scoreBannerRight}>
          <Text style={[styles.scoreBannerValue, { color: tierColor }]}>
            {Math.round(score.score)}
          </Text>
          <Text style={styles.scoreBannerMax}>/100</Text>
          <View style={[styles.tierPill, { backgroundColor: tierColor + '22', borderColor: tierColor + '44' }]}>
            <Text style={[styles.tierPillText, { color: tierColor }]}>{tierLabel}</Text>
          </View>
        </View>
      ) : (
        <Animated.View style={{ opacity: pulseAnim, flexDirection: 'row', alignItems: 'center' }}>
          {isLoading ? (
            <>
              <ActivityIndicator size="small" color={T.accent} />
              <Text style={styles.scanningText}>Scanning…</Text>
            </>
          ) : (
            <Text style={styles.scanningText}>Tap below to scan</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Metric Pill ─────────────────────────────────────────────────────────────
const STATUS_COLORS = { ok: T.green, warning: T.amber, danger: T.red };

function MetricPill({
  label,
  value,
  status,
  icon,
}: {
  label: string;
  value: string;
  status: 'ok' | 'warning' | 'danger';
  icon: string;
}) {
  const color = STATUS_COLORS[status];
  return (
    <View style={[styles.metricPill, { borderColor: color + '33' }]}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MetricsStrip({ vitals }: { vitals: VitalsData | null }) {
  if (!vitals) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.metricsRow}
    >
      <MetricPill
        icon="🛡️"
        label="Buffer"
        value={`${vitals.buffer_months}mo`}
        status={vitals.buffer_status}
      />
      <MetricPill
        icon="💳"
        label="Debt"
        value={`${vitals.debt_pressure}%`}
        status={vitals.debt_status}
      />
      <MetricPill
        icon="💰"
        label="Cash Flow"
        value={`+RM${vitals.cashflow_monthly}`}
        status={vitals.cashflow_status}
      />
      <MetricPill
        icon="📊"
        label="Habits"
        value={`${vitals.habit_score}/100`}
        status={vitals.habit_status}
      />
    </ScrollView>
  );
}

// ─── Alert Strip ─────────────────────────────────────────────────────────────
function AlertStrip({ alert }: { alert: AlertData | null }) {
  if (!alert) return null;
  return (
    <View style={styles.alertStrip}>
      <Text style={styles.alertIcon}>🚨</Text>
      <View style={styles.alertTextCol}>
        <Text style={styles.alertTitle}>
          {alert.urgency === 'critical' ? 'CRITICAL' : 'HIGH'} — Savings Gap
        </Text>
        <Text style={styles.alertAmount}>RM{alert.savings_gap.toLocaleString()}</Text>
      </View>
    </View>
  );
}

// ─── Compact Savings Plan ────────────────────────────────────────────────────
function CompactPlan({
  plan,
  onSelectPlan,
}: {
  plan: PlanData | null;
  onSelectPlan?: (tierId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string>('balanced');
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: expanded ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [expanded]);

  if (!plan) return null;

  const TIER_COLORS_MAP: Record<string, string> = {
    aggressive: T.accent,
    balanced: T.amber,
    safe: T.green,
  };

  return (
    <View style={styles.planCard}>
      <Pressable onPress={() => setExpanded(!expanded)} style={styles.planHeader}>
        <View style={styles.planHeaderLeft}>
          <View style={[styles.planDot, { backgroundColor: T.amber }]} />
          <Text style={styles.planTitle}>SAVINGS PLAN</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={T.textSecondary}
        />
      </Pressable>

      {/* Collapsed summary */}
      {!expanded && (
        <View style={styles.planSummaryRow}>
          <Text style={styles.planSummaryText}>
            Gap:{' '}
            <Text style={{ color: T.amber, fontWeight: '700' }}>
              RM{plan.gap.toLocaleString()}
            </Text>
            {'  ·  '}
            Surplus:{' '}
            <Text style={{ color: T.green, fontWeight: '700' }}>
              RM{plan.monthly_surplus.toLocaleString()}/mo
            </Text>
          </Text>
        </View>
      )}

      {/* Expanded tiers */}
      {expanded && (
        <Animated.View>
          {plan.tiers.map((tier) => {
            const color = TIER_COLORS_MAP[tier.id] ?? T.accent;
            const isSelected = selected === tier.id;
            return (
              <Pressable
                key={tier.id}
                onPress={() => {
                  setSelected(tier.id);
                  onSelectPlan?.(tier.id);
                }}
                style={[
                  styles.planTierRow,
                  isSelected && { borderColor: color + '55', backgroundColor: color + '0A' },
                ]}
              >
                <View>
                  <Text style={[styles.planTierLabel, isSelected && { color }]}>
                    {tier.label}
                  </Text>
                  <Text style={styles.planTierSacrifice}>{tier.sacrifice}</Text>
                </View>
                <View style={styles.planTierRight}>
                  <Text style={[styles.planTierAmount, { color }]}>
                    RM{tier.monthly_save}/mo
                  </Text>
                  <Text style={styles.planTierMonths}>{tier.months_to_target} months</Text>
                </View>
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Action Chips Row (above input) ─────────────────────────────────────────
function ChipsRow({
  chips,
  onPress,
}: {
  chips: ChipsData | null;
  onPress: (text: string) => void;
}) {
  if (!chips || chips.chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContainer}
      keyboardShouldPersistTaps="always"
    >
      {chips.chips.map((chip, i) => (
        <Pressable
          key={i}
          onPress={() => onPress(chip)}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.chipText}>{chip}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ─── Scan Button (shown before first scan) ──────────────────────────────────
function ScanButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.45],
  });

  return (
    <View style={styles.scanBtnWrapper}>
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View
          style={[
            styles.scanBtn,
            { transform: [{ scale }], shadowOpacity },
          ]}
        >
          <Ionicons name="shield-checkmark" size={28} color="#fff" />
          <Text style={styles.scanBtnText}>Scan Financial Health</Text>
          <Text style={styles.scanBtnSub}>AI-powered resilience analysis</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─── Thinking Indicator ─────────────────────────────────────────────────────
function ThinkingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createPulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    createPulse(dot1, 0).start();
    createPulse(dot2, 150).start();
    createPulse(dot3, 300).start();
  }, []);

  return (
    <View style={styles.thinkingRow}>
      <View style={styles.thinkingBubble}>
        <Animated.View style={[styles.thinkingDot, { opacity: dot1 }]} />
        <Animated.View style={[styles.thinkingDot, { opacity: dot2 }]} />
        <Animated.View style={[styles.thinkingDot, { opacity: dot3 }]} />
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function ResiliencePage() {
  const {
    messages,
    isStreaming,
    sendMessage,
    sendResume,
    triggerAutoScan,
  } = useResilienceStream();

  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const hasScanTriggered = useRef(false);

  // Extract dashboard data from messages
  const { vitals, score, alert, plan, chips } = useMemo(
    () => extractDashboard(messages),
    [messages]
  );

  // Filter messages for chat area (exclude dashboard cards)
  const chat = useMemo(() => chatMessages(messages), [messages]);

  // Track if we have any data loaded
  const hasData = vitals !== null || score !== null;

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) return;
    setInputText('');
    Keyboard.dismiss();
    sendMessage(trimmed);
  }, [inputText, isStreaming, sendMessage]);

  const handleChipPress = useCallback(
    (text: string) => {
      if (isStreaming) return;
      sendMessage(text);
    },
    [isStreaming, sendMessage]
  );

  const handleScan = useCallback(() => {
    if (hasScanTriggered.current || isStreaming) return;
    hasScanTriggered.current = true;
    triggerAutoScan();
  }, [isStreaming, triggerAutoScan]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Score Banner ── */}
      <ScoreBanner score={score} isLoading={isStreaming && !hasData} />

      {/* ── Main Scroll ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Dashboard Section */}
        {hasData && (
          <View style={styles.dashboardSection}>
            <MetricsStrip vitals={vitals} />
            <AlertStrip alert={alert} />
            <CompactPlan plan={plan} />
          </View>
        )}

        {/* No-data state — show scan button */}
        {!hasData && !isStreaming && (
          <ScanButton onPress={handleScan} />
        )}

        {/* Loading state before first data */}
        {!hasData && isStreaming && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="large" color={T.accent} />
            <Text style={styles.loadingText}>Analyzing your finances…</Text>
          </View>
        )}

        {/* Chat Section */}
        {chat.length > 0 && (
          <View style={styles.chatSection}>
            <View style={styles.chatDivider}>
              <View style={styles.chatDividerLine} />
              <Text style={styles.chatDividerLabel}>INSIGHTS</Text>
              <View style={styles.chatDividerLine} />
            </View>

            <ResilienceChat
              messages={chat}
              onChipPress={handleChipPress}
              onApprove={(approved) => sendResume(approved)}
            />
          </View>
        )}

        {/* Thinking indicator */}
        {isStreaming && hasData && <ThinkingIndicator />}

        {/* Bottom pad */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Bottom Bar: Chips + Input ── */}
      <View style={styles.bottomBar}>
        <ChipsRow chips={chips} onPress={handleChipPress} />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            placeholder="Ask about your finances…"
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isStreaming}
            multiline={false}
          />
          <Pressable
            onPress={handleSend}
            disabled={isStreaming || !inputText.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              (isStreaming || !inputText.trim()) && styles.sendBtnDisabled,
              pressed && styles.sendBtnPressed,
            ]}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
  },

  // ── Score Banner ──
  scoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  scoreBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scoreBannerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: T.textSecondary,
    letterSpacing: 2,
  },
  scoreBannerRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  scoreBannerValue: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreBannerMax: {
    fontSize: 14,
    color: T.textMuted,
    fontWeight: '500',
  },
  tierPill: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  tierPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scanningText: {
    fontSize: 12,
    color: T.textSecondary,
    marginLeft: 8,
  },

  // ── Scroll ──
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },

  // ── Dashboard ──
  dashboardSection: {
    gap: 8,
    marginBottom: 4,
  },

  // ── Metrics Strip ──
  metricsRow: {
    gap: 10,
    paddingVertical: 4,
    paddingRight: 8,
  },
  metricPill: {
    backgroundColor: T.surface,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 90,
  },
  metricIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontSize: 10,
    color: T.textMuted,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  // ── Alert Strip ──
  alertStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,71,87,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.25)',
    padding: 14,
    gap: 12,
  },
  alertIcon: {
    fontSize: 24,
  },
  alertTextCol: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: T.red,
    letterSpacing: 1,
  },
  alertAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: T.red,
    marginTop: 2,
  },

  // ── Compact Plan ──
  planCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.15)',
    overflow: 'hidden',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  planHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  planTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textSecondary,
    letterSpacing: 1.5,
  },
  planSummaryRow: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  planSummaryText: {
    fontSize: 13,
    color: T.textSecondary,
  },
  planTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.border,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  planTierLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: T.text,
  },
  planTierSacrifice: {
    fontSize: 11,
    color: T.textMuted,
    marginTop: 2,
  },
  planTierRight: {
    alignItems: 'flex-end',
  },
  planTierAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  planTierMonths: {
    fontSize: 11,
    color: T.textMuted,
    marginTop: 2,
  },

  // ── Scan Button ──
  scanBtnWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  scanBtn: {
    backgroundColor: T.brand,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 40,
    alignItems: 'center',
    shadowColor: T.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 12,
  },
  scanBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 12,
  },
  scanBtnSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },

  // ── Loading ──
  loadingSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: T.textSecondary,
  },

  // ── Chat Section ──
  chatSection: {
    marginTop: 8,
  },
  chatDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  chatDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: T.border,
  },
  chatDividerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 2,
  },

  // ── Thinking ──
  thinkingRow: {
    paddingVertical: 8,
    paddingLeft: 4,
  },
  thinkingBubble: {
    flexDirection: 'row',
    backgroundColor: T.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
    gap: 6,
  },
  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.accent,
  },

  // ── Bottom Bar ──
  bottomBar: {
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingHorizontal: 16,
  },

  // ── Chips ──
  chipsContainer: {
    gap: 8,
    paddingVertical: 8,
    paddingRight: 8,
  },
  chip: {
    backgroundColor: T.surfaceRaised,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.borderActive,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipPressed: {
    backgroundColor: T.accent + '22',
  },
  chipText: {
    fontSize: 13,
    color: T.accent,
    fontWeight: '500',
  },

  // ── Input ──
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: T.inputBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    color: T.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
});
