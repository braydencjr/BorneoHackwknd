/**
 * ResiliencePage — 3-tab financial resilience dashboard.
 *
 * Tab 1 – Overview  : Hero score + vitals + alert + savings plan
 * Tab 2 – Scenarios : Shock timeline + stress-test cards
 * Tab 3 – Chat      : AI conversation + chips + input bar
 *
 * Architecture:
 *   ┌─────────────────────────────────────────────────┐
 *   │  Score Banner (fixed header)                    │
 *   ├─────────────────────────────────────────────────┤
 *   │  [ Overview ]  [ Scenarios ]  [ Chat ]          │
 *   ├─────────────────────────────────────────────────┤
 *   │  Tab content (scrollable)                       │
 *   ├─────────────────────────────────────────────────┤
 *   │  Chips + Input  (Chat tab only)                 │
 *   └─────────────────────────────────────────────────┘
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
import ShockTimelineCard from '@/components/resilience/shock-timeline-card';
import StressTestCard from '@/components/resilience/stress-test-card';
import { useOverviewScan, type AnalysisData } from '@/hooks/use-overview-scan';
import {
    useResilienceStream,
    type AlertData,
    type ChatMessage,
    type ChipsData,
    type PlanData,
    type ScoreData,
    type ShockData,
    type StressTestData,
    type VitalsData,
} from '@/hooks/use-resilience-stream';
import ContingencyPage from "../contingencypage";

// ─── Theme ────────────────────────────────────────────────────────────────────
const T = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F4FF',
  border: 'rgba(30,58,138,0.08)',
  borderActive: 'rgba(37,99,235,0.3)',
  brand: '#1E3A8A',
  accent: '#2563EB',
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  text: '#11181C',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  userBubble: '#1E3A8A',
  inputBg: '#F0F4FF',
};

const STATUS_COLORS: Record<'ok' | 'warning' | 'danger', string> = {
  ok: T.green,
  warning: T.amber,
  danger: T.red,
};

// ─── Tab type ─────────────────────────────────────────────────────────────────
type TabId = 'overview' | 'scenarios' | 'chat';

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Chat now renders ALL genUI cards inline — vitals, score, plan, shock, canvas, etc.
 * The overview tab has its own dedicated agent (useOverviewScan) so there is no
 * reason to suppress cards from the chat thread anymore.
 * Scenarios tab still extracts shock/stress_test from chat history for its view.
 */
function chatMessages(messages: ChatMessage[]): ChatMessage[] {
  // Remove empty agent messages (e.g. agent messages that only had tool calls
  // with no text or visible cards)
  return messages
    .map((msg) => {
      if (msg.role !== 'agent') return msg;
      // Keep all parts — all cards are welcome in chat
      if (msg.parts.length === 0) return null;
      return msg;
    })
    .filter(Boolean) as ChatMessage[];
}

/** Extract only scenario cards from chat history for the Scenarios tab */
function extractScenarios(messages: ChatMessage[]) {
  let shock: ShockData | null = null;
  let stressTest: StressTestData | null = null;
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type !== 'tool_result') continue;
      const d = part.data;
      if (!d) continue;
      if (d.card === 'shock')       shock      = d;
      if (d.card === 'stress_test') stressTest = d;
    }
  }
  return { shock, stressTest };
}

// ─── TabBar ───────────────────────────────────────────────────────────────────
type TabDef = { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap };

const TABS: TabDef[] = [
  { id: 'overview',  label: 'Overview',  icon: 'grid-outline' },
  { id: 'scenarios', label: 'Scenarios', icon: 'analytics-outline' },
  { id: 'chat',      label: 'Chat',      icon: 'chatbubble-outline' },
];

function TabBar({
  active,
  onChange,
  hasScenarios,
  isStreaming,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  hasScenarios: boolean;
  isStreaming: boolean;
}) {
  return (
    <View style={tabStyles.wrapper}>
      <View style={tabStyles.track}>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const showScenarioDot = tab.id === 'scenarios' && hasScenarios && !isActive;
          const showStreamDot   = tab.id === 'chat' && isStreaming && !isActive;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onChange(tab.id)}
              style={({ pressed }) => [
                tabStyles.pill,
                isActive && tabStyles.pillActive,
                pressed && !isActive && tabStyles.pillPressed,
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={14}
                color={isActive ? '#fff' : T.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[tabStyles.label, isActive && tabStyles.labelActive]}>
                {tab.label}
              </Text>
              {(showScenarioDot || showStreamDot) && (
                <View style={[
                  tabStyles.dot,
                  showStreamDot && { backgroundColor: T.amber },
                ]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: T.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: '#EEF2FF',
    borderRadius: 22,
    padding: 3,
    gap: 2,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 18,
  },
  pillActive: {
    backgroundColor: T.brand,
    shadowColor: T.brand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  pillPressed: {
    backgroundColor: 'rgba(30,58,138,0.06)',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: T.textMuted,
  },
  labelActive: {
    color: '#fff',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.green,
    marginLeft: 5,
  },
});

// ─── Score Banner ─────────────────────────────────────────────────────────────
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

// ─── Alert Strip (also used in Overview tab) ─────────────────────────────────
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

// ─── Action Chips Row (above chat input) ─────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// Overview Tab — new components
// ═══════════════════════════════════════════════════════════════════════════════

function formatTimeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Shimmer skeleton box ─────────────────────────────────────────────────────
function ShimmerBox({
  width,
  height,
  borderRadius = 12,
  style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1,    duration: 850, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.35, duration: 850, useNativeDriver: true }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: '#DDE3EE' },
        { opacity: anim },
        style,
      ]}
    />
  );
}

// ─── Overview loading skeleton ────────────────────────────────────────────────
function OverviewSkeleton({ step }: { step: string }) {
  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      {/* Score card skeleton */}
      <View style={[ovStyles.card, { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 }]}>
        <ShimmerBox width={88} height={88} borderRadius={44} />
        <View style={{ flex: 1, gap: 10 }}>
          <ShimmerBox width={80} height={20} borderRadius={8} />
          <ShimmerBox width="90%" height={12} borderRadius={6} />
          <ShimmerBox width="70%" height={12} borderRadius={6} />
          <ShimmerBox width="80%" height={8}  borderRadius={4} />
          <ShimmerBox width="75%" height={8}  borderRadius={4} />
        </View>
      </View>
      {/* 2×2 metric grid skeleton */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ShimmerBox width="48.5%" height={108} />
        <ShimmerBox width="48.5%" height={108} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ShimmerBox width="48.5%" height={108} />
        <ShimmerBox width="48.5%" height={108} />
      </View>
      {/* Analysis card skeleton */}
      <View style={[ovStyles.analysisCard, { gap: 10 }]}>
        <ShimmerBox width={140} height={16} borderRadius={6} style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
        <ShimmerBox width="100%" height={12} borderRadius={5} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <ShimmerBox width="88%"  height={12} borderRadius={5} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <ShimmerBox width="94%"  height={12} borderRadius={5} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
        <ShimmerBox width="72%"  height={12} borderRadius={5} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
      </View>
      {step ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 }}>
          <ActivityIndicator size="small" color={T.accent} />
          <Text style={{ fontSize: 12, color: T.textMuted }}>{step}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Score ring card ──────────────────────────────────────────────────────────
function ScoreRingCard({
  score,
  insights,
  isLoading,
  timestamp,
  onRefresh,
}: {
  score: ScoreData;
  insights?: string[] | null;
  isLoading?: boolean;
  timestamp?: number;
  onRefresh?: () => void;
}) {
  const tierColor =
    score.tier === 'strong' ? T.green : score.tier === 'moderate' ? T.amber : T.red;
  const tierLabel =
    score.tier === 'strong' ? 'RESILIENT' : score.tier === 'moderate' ? 'AT RISK' : 'CRITICAL';

  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim,   { toValue: 1, tension: 60, friction: 9, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dims = [
    { label: 'Buffer',    value: score.dimensions.buffer },
    { label: 'Debt',      value: score.dimensions.debt },
    { label: 'Cash Flow', value: score.dimensions.cashflow },
    { label: 'Habits',    value: score.dimensions.habits },
  ];

  const timeAgo = timestamp && timestamp > 0 ? formatTimeAgo(timestamp) : null;

  return (
    <Animated.View style={[ovStyles.card, ovStyles.scoreCard, { borderColor: tierColor + '28', opacity: opacityAnim, transform: [{ scale: scaleAnim }] }]}>
      <View style={ovStyles.scoreCardRow}>
        {/* Ring */}
        <View style={[ovStyles.scoreRing, { borderColor: tierColor }]}>
          <Text style={[ovStyles.scoreNum, { color: tierColor }]}>
            {Math.round(score.score)}
          </Text>
          <Text style={ovStyles.scoreOf}>/100</Text>
        </View>

        {/* Right column */}
        <View style={ovStyles.scoreRight}>
          <View style={[ovStyles.scoreTierBadge, { backgroundColor: tierColor + '18', borderColor: tierColor + '44' }]}>
            <Text style={[ovStyles.scoreTierText, { color: tierColor }]}>{tierLabel}</Text>
          </View>
          <Text style={ovStyles.scoreVerdict} numberOfLines={3}>{score.verdict}</Text>

          {/* Dimension bars */}
          <View style={{ gap: 6, marginTop: 4 }}>
            {dims.map(({ label, value }) => {
              const barColor = value > 65 ? T.green : value > 35 ? T.amber : T.red;
              return (
                <View key={label} style={ovStyles.dimRow}>
                  <Text style={ovStyles.dimLabel}>{label}</Text>
                  <View style={ovStyles.dimTrack}>
                    <View style={[ovStyles.dimFill, { width: `${Math.min(value, 100)}%` as any, backgroundColor: barColor }]} />
                  </View>
                  <Text style={[ovStyles.dimVal, { color: barColor }]}>{Math.round(value)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* AI insights — overall standing */}
      {insights && insights.length > 0 && (
        <View style={ovStyles.insightSection}>
          <View style={ovStyles.insightDivider} />
          {insights.map((bullet, i) => (
            <View key={i} style={ovStyles.insightRow}>
              <Text style={[ovStyles.insightDot, { color: tierColor }]}>•</Text>
              <Text style={ovStyles.insightText}>{bullet}</Text>
            </View>
          ))}
        </View>
      )}
      {isLoading && !insights && (
        <View style={ovStyles.insightSection}>
          <View style={ovStyles.insightDivider} />
          <View style={ovStyles.insightLoadingRow}>
            <ActivityIndicator size="small" color={T.textMuted} />
            <Text style={ovStyles.insightLoadingText}>Analyzing your finances…</Text>
          </View>
        </View>
      )}

      {/* Refresh footer */}
      {!isLoading && onRefresh && (
        <View style={ovStyles.scoreFooter}>
          {timeAgo ? (
            <Text style={ovStyles.scoreFooterTime}>Analyzed {timeAgo}</Text>
          ) : <View />}
          <Pressable onPress={onRefresh} style={ovStyles.refreshBtn} hitSlop={8}>
            <Ionicons name="refresh-outline" size={13} color={T.textMuted} />
            <Text style={ovStyles.refreshBtnText}>Refresh</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

// ─── 2×2 Metrics grid ────────────────────────────────────────────────────────
function MetricsGrid({ vitals, analysis }: { vitals: VitalsData; analysis: AnalysisData | null }) {
  const metrics = [
    {
      icon: '🛡️',
      label: 'Buffer',
      value: `${vitals.buffer_months}mo`,
      status: vitals.buffer_status,
      bench: '3+ mo safe',
      insights: analysis?.emergency_buffer,
    },
    {
      icon: '💳',
      label: 'Debt Load',
      value: `${vitals.debt_pressure}%`,
      status: vitals.debt_status,
      bench: '<30% healthy',
      insights: analysis?.debt_load,
    },
    {
      icon: '💰',
      label: 'Cash Flow',
      value: `+RM${vitals.cashflow_monthly.toLocaleString()}`,
      status: vitals.cashflow_status,
      bench: 'surplus/mo',
      insights: analysis?.monthly_cash_flow,
    },
    {
      icon: '📊',
      label: 'Habits',
      value: `${vitals.habit_score}/100`,
      status: vitals.habit_status,
      bench: '65+ is good',
      insights: analysis?.spending_habits,
    },
  ];

  return (
    <View style={ovStyles.metricsGrid}>
      {metrics.map(({ icon, label, value, status, bench, insights }, idx) => {
        const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS];
        const delay = idx * 60;
        return (
          <MetricGridCell
            key={label}
            icon={icon}
            label={label}
            value={value}
            color={color}
            status={status}
            bench={bench}
            delay={delay}
            insights={insights}
          />
        );
      })}
    </View>
  );
}

function MetricGridCell({
  icon, label, value, color, status, bench, delay, insights,
}: {
  icon: string; label: string; value: string; color: string;
  status: string; bench: string; delay: number;
  insights?: string[] | null;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[ovStyles.metricCell, { borderColor: color + '30', opacity: anim }]}>
      <Text style={ovStyles.metricCellIcon}>{icon}</Text>
      <Text style={[ovStyles.metricCellValue, { color }]}>{value}</Text>
      <Text style={ovStyles.metricCellLabel}>{label}</Text>
      <View style={[ovStyles.metricCellPill, { backgroundColor: color + '15' }]}>
        <Text style={[ovStyles.metricCellStatus, { color }]}>{status.toUpperCase()}</Text>
      </View>
      <Text style={ovStyles.metricCellBench}>{bench}</Text>
      {insights && insights.length > 0 && (
        <View style={ovStyles.metricInsightBox}>
          {insights.map((b, i) => (
            <Text key={i} style={ovStyles.metricInsightText}>{b}</Text>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── AI Analysis card ─────────────────────────────────────────────────────────
// ─── Savings best-tier snapshot ───────────────────────────────────────────────
function SavingsBestTier({ plan, insights }: { plan: PlanData; insights?: string[] | null }) {
  const balanced = plan.tiers.find((t) => t.id === 'balanced') ?? plan.tiers[0];
  if (!balanced) return null;

  return (
    <View style={ovStyles.savingsCard}>
      <View style={ovStyles.savingsHeader}>
        <View style={[ovStyles.savingsBadge, { backgroundColor: T.amber + '22', borderColor: T.amber + '55' }]}>
          <Text style={[ovStyles.savingsBadgeText, { color: T.amber }]}>RECOMMENDED</Text>
        </View>
        <Text style={ovStyles.savingsLabel}>{balanced.label} Plan</Text>
      </View>
      <View style={ovStyles.savingsStats}>
        <View style={ovStyles.savingsStat}>
          <Text style={ovStyles.savingsStatValue}>RM{balanced.monthly_save.toLocaleString()}</Text>
          <Text style={ovStyles.savingsStatLabel}>per month</Text>
        </View>
        <View style={ovStyles.savingsDivider} />
        <View style={ovStyles.savingsStat}>
          <Text style={ovStyles.savingsStatValue}>{balanced.months_to_target}</Text>
          <Text style={ovStyles.savingsStatLabel}>months to goal</Text>
        </View>
        <View style={ovStyles.savingsDivider} />
        <View style={ovStyles.savingsStat}>
          <Text style={ovStyles.savingsStatValue}>RM{plan.gap.toLocaleString()}</Text>
          <Text style={ovStyles.savingsStatLabel}>safety gap</Text>
        </View>
      </View>
      <Text style={ovStyles.savingsNote}>{balanced.sacrifice}</Text>
      {insights && insights.length > 0 && (
        <View style={ovStyles.insightSection}>
          <View style={[ovStyles.insightDivider, { borderTopColor: T.amber + '44' }]} />
          {insights.map((b, i) => (
            <View key={i} style={ovStyles.insightRow}>
              <Text style={[ovStyles.insightDot, { color: T.amber }]}>•</Text>
              <Text style={[ovStyles.insightText, { color: T.textSecondary }]}>{b}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Overview error state ─────────────────────────────────────────────────────
function OverviewErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={ovStyles.errorState}>
      <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠️</Text>
      <Text style={ovStyles.errorTitle}>Could not load overview</Text>
      <Text style={ovStyles.errorMsg}>{message}</Text>
      <Pressable onPress={onRetry} style={ovStyles.retryBtn}>
        <Ionicons name="refresh" size={16} color="#fff" style={{ marginRight: 6 }} />
        <Text style={ovStyles.retryBtnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

// ─── Overview empty state (stream done but no data received) ──────────────────
function OverviewEmptyState({ onScan }: { onScan: () => void }) {
  return (
    <View style={ovStyles.errorState}>
      <Text style={{ fontSize: 40, marginBottom: 8 }}>📊</Text>
      <Text style={ovStyles.errorTitle}>No data yet</Text>
      <Text style={ovStyles.errorMsg}>
        Tap below to run your financial health scan.
      </Text>
      <Pressable onPress={onScan} style={ovStyles.retryBtn}>
        <Ionicons name="pulse-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
        <Text style={ovStyles.retryBtnText}>Run Health Scan</Text>
      </Pressable>
    </View>
  );
}

// ─── Scenarios Tab ────────────────────────────────────────────────────────────
function ScenariosTab({
  shock,
  stressTest,
}: {
  shock: ShockData | null;
  stressTest: StressTestData | null;
}) {
  if (!shock && !stressTest) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyTitle}>No Scenarios Yet</Text>
        <Text style={styles.emptySubtitle}>
          Head to the Chat tab and ask the AI to simulate a financial shock — e.g.
          {' '}{'"'}Simulate job loss for 6 months{'"'} or {'"'}Run a stress test{'"'}.
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.scenariosSection}>
      {shock      && <ShockTimelineCard data={shock} />}
      {stressTest && <StressTestCard    data={stressTest} />}
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Overview: dedicated stateless agent, auto-scans on mount, cached 24 h
  const overviewScan = useOverviewScan();

  // Chat + Scenarios: interactive multi-turn agent
  const { messages, isStreaming, sendMessage, sendResume } = useResilienceStream();

  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const scrollRef                 = useRef<ScrollView>(null);

  // Extract chips from chat messages (action suggestions)
  const chips = useMemo<ChipsData | null>(() => {
    for (const msg of [...messages].reverse()) {
      for (const part of msg.parts) {
        if (part.type === 'tool_result' && part.data?.card === 'chips')
          return part.data as ChipsData;
      }
    }
    return null;
  }, [messages]);

  const { shock, stressTest } = useMemo(() => extractScenarios(messages), [messages]);
  const chat                  = useMemo(() => chatMessages(messages), [messages]);
  const hasScenarios          = shock !== null || stressTest !== null;

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (messages.length > 0 && activeTab === 'chat') {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, activeTab]);

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
      setActiveTab('chat');
      sendMessage(text);
    },
    [isStreaming, sendMessage]
  );

  // The fixed score banner always shows the overview score (primary source of truth)
  const bannerScore   = overviewScan.score;
  const bannerLoading = overviewScan.isLoading && !overviewScan.score;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Fixed Header ── */}
      <ScoreBanner score={bannerScore} isLoading={bannerLoading} />
      <TabBar
        active={activeTab}
        onChange={setActiveTab}
        hasScenarios={hasScenarios}
        isStreaming={isStreaming}
      />

      {/* ══ Overview Tab ══ */}
      {activeTab === 'overview' && (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {overviewScan.isLoading && !overviewScan.score ? (
            // Still fetching — show skeleton with current step label
            <OverviewSkeleton step={overviewScan.currentStep} />
          ) : overviewScan.error && !overviewScan.score ? (
            // Network or agent error before any data arrived
            <OverviewErrorState
              message={overviewScan.error}
              onRetry={overviewScan.refresh}
            />
          ) : !overviewScan.score && !overviewScan.isLoading ? (
            // Stream finished but no data — prompt user to scan
            <OverviewEmptyState onScan={overviewScan.refresh} />
          ) : (
            // At least score is available — render dashboard
            <View style={styles.dashboardSection}>
              {overviewScan.score && (
                <ScoreRingCard
                  score={overviewScan.score}
                  insights={overviewScan.analysis?.overall_standing}
                  isLoading={overviewScan.isLoading}
                  timestamp={overviewScan.timestamp}
                  onRefresh={overviewScan.refresh}
                />
              )}
              {overviewScan.vitals && (
                <MetricsGrid vitals={overviewScan.vitals} analysis={overviewScan.analysis} />
              )}
              {overviewScan.alert && (
                <AlertStrip alert={overviewScan.alert} />
              )}
              {overviewScan.plan && (
                <SavingsBestTier
                  plan={overviewScan.plan}
                  insights={overviewScan.analysis?.priority_action}
                />
              )}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ══ Scenarios Tab ══ */}
      {activeTab === 'scenarios' && (
        <View style={{ flex: 1 }}>
       <ContingencyPage />
      </View>
      )}

      {/* ══ Chat Tab ══ */}
      {activeTab === 'chat' && (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {chat.length === 0 && !isStreaming && (
              <View style={styles.chatWelcome}>
                <Text style={styles.chatWelcomeIcon}>🤖</Text>
                <Text style={styles.chatWelcomeTitle}>Your AI Financial Coach</Text>
                <Text style={styles.chatWelcomeSub}>
                  Ask me anything about your finances, or tap a suggestion below to get started.
                </Text>
              </View>
            )}
            {chat.length > 0 && (
              <ResilienceChat
                messages={chat}
                onChipPress={handleChipPress}
                onApprove={(approved) => sendResume(approved)}
              />
            )}
            {isStreaming && <ThinkingIndicator />}
            <View style={{ height: 16 }} />
          </ScrollView>

          {/* ── Bottom Bar (Chat tab only) ── */}
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
        </>
      )}
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
    paddingTop: 16,
    flexGrow: 1,
  },

  // ── Dashboard (Overview tab) ──
  dashboardSection: {
    gap: 10,
  },

  // ── Hero Score Card ──
  heroCard: {
    backgroundColor: T.surface,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  heroCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.bg,
  },
  heroNum: {
    fontSize: 30,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    lineHeight: 34,
  },
  heroOf: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
  },
  heroRight: {
    flex: 1,
    gap: 8,
  },
  heroTierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  heroTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroVerdict: {
    fontSize: 13,
    color: T.textSecondary,
    lineHeight: 19,
  },
  heroDims: {
    gap: 10,
  },
  heroDimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroDimLabel: {
    width: 70,
    fontSize: 12,
    color: T.textMuted,
    fontWeight: '500',
  },
  heroDimTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  heroDimFill: {
    height: 6,
    borderRadius: 3,
  },
  heroDimVal: {
    width: 28,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
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
    backgroundColor: 'rgba(220,38,38,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
    padding: 14,
    gap: 12,
  },
  alertIcon: { fontSize: 24 },
  alertTextCol: { flex: 1 },
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
    borderColor: 'rgba(217,119,6,0.15)',
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
  planTierRight: { alignItems: 'flex-end' },
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

  // ── Scenarios Tab ──
  scenariosSection: {
    gap: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: T.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },

  // ── Chat Tab ──
  chatWelcome: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 10,
  },
  chatWelcomeIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  chatWelcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: T.text,
    textAlign: 'center',
  },
  chatWelcomeSub: {
    fontSize: 14,
    color: T.textMuted,
    textAlign: 'center',
    lineHeight: 21,
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

  // ── Bottom Bar (Chat tab) ──
  bottomBar: {
    backgroundColor: T.surface,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    paddingHorizontal: 16,
  },
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
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnPressed:  { opacity: 0.8 },
});

// ─── Overview-specific styles ────────────────────────────────────────────────
const ovStyles = StyleSheet.create({
  // Shared card base
  card: {
    backgroundColor: T.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Score ring card ──
  scoreCard: {
    padding: 20,
  },
  scoreCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
  },
  scoreRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.bg,
    flexShrink: 0,
  },
  scoreNum: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  scoreOf: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
  },
  scoreRight: {
    flex: 1,
    gap: 6,
  },
  scoreTierBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  scoreTierText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  scoreVerdict: {
    fontSize: 13,
    color: T.textSecondary,
    lineHeight: 18,
  },
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimLabel: {
    width: 58,
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
  },
  dimTrack: {
    flex: 1,
    height: 5,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  dimFill: {
    height: 5,
    borderRadius: 3,
  },
  dimVal: {
    width: 26,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // ── 2×2 Metrics grid ──
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCell: {
    width: '48.5%',
    backgroundColor: T.surface,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  metricCellIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  metricCellValue: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricCellLabel: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  metricCellPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  metricCellStatus: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  metricCellBench: {
    fontSize: 10,
    color: T.textMuted,
    marginTop: 1,
  },

  // ── AI Analysis card ──
  analysisCard: {
    backgroundColor: T.brand,
    borderRadius: 18,
    padding: 18,
    gap: 12,
    shadowColor: T.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  analysisTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  analysisStepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  analysisStepText: {
    fontSize: 11,
    color: 'rgba(147,197,253,0.9)',
    fontWeight: '500',
  },
  analysisPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  analysisPlaceholderText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  analysisBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  analysisFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  analysisFooterTime: {
    fontSize: 11,
    color: 'rgba(147,197,253,0.6)',
    fontWeight: '500',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  refreshBtnText: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '600',
  },

  // ── Score card footer ──
  scoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
  },
  scoreFooterTime: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
  },

  // ── Insight list (shared across cards) ──
  insightSection: {
    gap: 5,
  },
  insightDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.border,
    marginTop: 10,
    marginBottom: 8,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  insightDot: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: T.accent,
  },
  insightText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: T.textSecondary,
  },
  insightLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  insightLoadingText: {
    fontSize: 12,
    color: T.textMuted,
    fontStyle: 'italic',
  },

  // ── Metric cell insights ──
  metricInsightBox: {
    marginTop: 6,
    gap: 3,
    width: '100%',
  },
  metricInsightText: {
    fontSize: 10,
    lineHeight: 14,
    color: T.textMuted,
    textAlign: 'center',
  },

  // ── Savings best-tier ──
  savingsCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.amber + '33',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  savingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  savingsBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  savingsBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  savingsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
  },
  savingsStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savingsStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  savingsStatValue: {
    fontSize: 17,
    fontWeight: '800',
    color: T.text,
    fontVariant: ['tabular-nums'],
  },
  savingsStatLabel: {
    fontSize: 10,
    color: T.textMuted,
    textAlign: 'center',
  },
  savingsDivider: {
    width: 1,
    height: 36,
    backgroundColor: T.border,
  },
  savingsNote: {
    fontSize: 12,
    color: T.textMuted,
    fontStyle: 'italic',
  },

  // ── Error state ──
  errorState: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 10,
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: T.text,
  },
  errorMsg: {
    fontSize: 13,
    color: T.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.brand,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

