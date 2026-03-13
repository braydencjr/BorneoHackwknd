import type { SafetyNet, ShockData, SurvivalAction } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

const SCENARIO_LABELS: Record<string, string> = {
  illness: '🤒 Medical Crisis',
  job_loss: '💼 Job Loss',
  disaster: '🌊 Natural Disaster',
  war: '⚠️ Civil Disruption',
};

const PHASE_COLORS: Record<string, string> = {
  acute: '#FF4757',
  shock: '#FF4757',
  emergency: '#FF4757',
  evacuation: '#FF4757',
  recovery: '#F5A623',
  search: '#F5A623',
  rebuilding: '#F5A623',
  displacement: '#F5A623',
  partial_recovery: '#0FB67C',
  stabilisation: '#0FB67C',
  adaptation: '#4F8EF7',
};

type Props = { data: ShockData };

function TimelineBar({ month, delay }: { month: ShockData['timeline'][number]; delay: number }) {
  const barWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const isGone = month.status === 'depleted';
  const phaseColor = month.phase ? (PHASE_COLORS[month.phase] ?? '#4F8EF7') : undefined;
  const fillColor = isGone
    ? '#FF4757'
    : month.status === 'warning'
    ? '#F5A623'
    : month.status === 'critical'
    ? '#FF6B35'
    : (phaseColor ?? '#0FB67C');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, delay, useNativeDriver: true }),
      Animated.timing(barWidth, {
        toValue: month.savings_remaining > 0 ? month.savings_remaining : 0,
        duration: 600,
        delay: delay + 100,
        useNativeDriver: false,
      }),
    ]).start();
  }, [barWidth, delay, month.savings_remaining, opacity]);

  return (
    <Animated.View style={[styles.barRow, { opacity }]}>
      <Text style={styles.monthLabel}>M{month.month}</Text>
      {month.phase && (
        <View style={[styles.phaseDot, { backgroundColor: phaseColor ?? '#4F8EF7' }]} />
      )}
      <View style={styles.barTrack}>
        {isGone ? (
          <View style={[styles.barFill, styles.depletedBar]}>
            <Text style={styles.depletedText}>DEPLETED 💀</Text>
          </View>
        ) : (
          <Animated.View
            style={[
              styles.barFill,
              {
                width: barWidth.interpolate({
                  inputRange: [0, 10000],
                  outputRange: ['0%', '100%'],
                  extrapolate: 'clamp',
                }),
                backgroundColor: fillColor,
              },
            ]}
          />
        )}
      </View>
      {!isGone && (
        <Text style={styles.barValue}>
          RM{month.savings_remaining >= 1000
            ? `${(month.savings_remaining / 1000).toFixed(1)}k`
            : month.savings_remaining}
        </Text>
      )}
    </Animated.View>
  );
}

function PhaseLegend({ phases }: { phases: ShockData['phases'] }) {
  if (!phases || phases.length === 0) return null;
  return (
    <View style={styles.phaseLegend}>
      {phases.map((ph) => (
        <View key={ph.id} style={styles.phaseChip}>
          <View style={[styles.phaseDotLg, { backgroundColor: PHASE_COLORS[ph.id] ?? '#4F8EF7' }]} />
          <Text style={styles.phaseChipText}>{ph.label}</Text>
          <Text style={styles.phaseChipRange}>
            M{ph.month_start}–{ph.month_end === 9999 ? '+' : ph.month_end}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SafetyNetsSection({ nets }: { nets: SafetyNet[] }) {
  if (!nets || nets.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🛡 SAFETY NETS AVAILABLE</Text>
      {nets.map((net) => (
        <View key={net.name} style={styles.netRow}>
          <View style={styles.netInfo}>
            <Text style={styles.netName}>{net.name}</Text>
            <Text style={styles.netNote}>{net.note}</Text>
          </View>
          {net.available > 0 && (
            <Text style={styles.netAmount}>
              RM{net.available >= 1000 ? `${(net.available / 1000).toFixed(1)}k` : net.available}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

function SurvivalActionsSection({ actions, comparison }: {
  actions: SurvivalAction[];
  comparison?: ShockData['survival_comparison'];
}) {
  if (!actions || actions.length === 0) return null;
  const actionItems = actions.filter((a) => a.type !== 'preparation');
  const prepItems = actions.filter((a) => a.type === 'preparation');

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>⚡ SURVIVAL ACTIONS</Text>
      {comparison && comparison.gain_months != null && comparison.gain_months > 0 && (
        <View style={styles.comparisonBanner}>
          <Text style={styles.comparisonText}>
            Taking these actions extends runway by{' '}
            <Text style={styles.comparisonGain}>+{comparison.gain_months} months</Text>
          </Text>
        </View>
      )}
      {actionItems.map((a) => (
        <View key={a.action} style={styles.actionRow}>
          <View style={[styles.actionTypeTag, { backgroundColor: a.type === 'income' ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)' }]}>
            <Text style={[styles.actionTypeText, { color: a.type === 'income' ? '#16A34A' : '#D97706' }]}>
              {a.type === 'income' ? '↑ INCOME' : '↓ EXPENSE'}
            </Text>
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>{a.action}</Text>
            <Text style={styles.actionDesc}>{a.description}</Text>
          </View>
          <View style={styles.actionImpact}>
            {a.monthly_impact > 0 && (
              <Text style={styles.actionImpactRm}>+RM{a.monthly_impact}</Text>
            )}
            <Text style={styles.actionImpactLabel}>{a.impact_label}</Text>
          </View>
        </View>
      ))}
      {prepItems.length > 0 && (
        <>
          <Text style={styles.prepLabel}>PRE-EVENT PREPARATION</Text>
          {prepItems.map((a) => (
            <View key={a.action} style={styles.prepRow}>
              <Text style={styles.prepBullet}>•</Text>
              <Text style={styles.prepText}>{a.action}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export default function ShockTimelineCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const warningFlash = useRef(new Animated.Value(0.4)).current;

  const scenario = data.scenario ?? data.timeline[0]?.label?.split(':')[0]?.toLowerCase() ?? 'illness';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 0, duration: 350, useNativeDriver: true }),
      Animated.spring(headerScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    if (!data.survives) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(warningFlash, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(warningFlash, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [cardOpacity, cardTranslate, data.survives, headerScale, warningFlash]);

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
      ]}
    >
      {/* Header */}
      <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: '#FF4757' }]} />
          <Text style={styles.cardTitle}>SHOCK SIMULATION</Text>
        </View>
        <Animated.View
          style={[
            styles.survivalBadge,
            {
              backgroundColor: data.survives ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)',
              borderColor: data.survives ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.2)',
              opacity: warningFlash,
            },
          ]}
        >
          <Text style={[styles.survivalText, { color: data.survives ? '#16A34A' : '#DC2626' }]}>
            {data.survives ? '✓ SURVIVES' : '✗ FAILS'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Scenario + summary row */}
      <View style={styles.scenarioRow}>
        <View>
          <Text style={styles.scenarioLabel}>
            {SCENARIO_LABELS[scenario] ?? scenario}
          </Text>
          {data.risk_probability && (
            <Text style={styles.riskProb}>{data.risk_probability}</Text>
          )}
        </View>
        <View style={styles.depletion}>
          <Text style={styles.depletionLabel}>DEPLETES AT</Text>
          <Text style={[styles.depletionValue, { color: data.survives ? '#16A34A' : '#DC2626' }]}>
            {data.depletes_at_month === null
              ? 'Never'
              : `Month ${data.depletes_at_month}`}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>STARTING</Text>
          <Text style={styles.statValue}>
            RM{data.starting_savings >= 1000 ? `${(data.starting_savings / 1000).toFixed(1)}k` : data.starting_savings}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>AVG BURN/MO</Text>
          <Text style={[styles.statValue, { color: '#DC2626' }]}>
            RM{data.monthly_burn >= 1000 ? `${(data.monthly_burn / 1000).toFixed(1)}k` : data.monthly_burn}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>AVG INCOME</Text>
          <Text style={[styles.statValue, { color: '#D97706' }]}>
            RM{data.reduced_income >= 1000 ? `${(data.reduced_income / 1000).toFixed(1)}k` : data.reduced_income}
          </Text>
        </View>
      </View>

      {/* Phase legend */}
      {data.phases && <PhaseLegend phases={data.phases} />}

      {/* Timeline bars */}
      <View style={styles.timelineContainer}>
        <ScrollView
          horizontal={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={data.timeline.length > 8}
          style={{ maxHeight: 260 }}
        >
          {data.timeline.map((month, i) => (
            <TimelineBar key={month.month} month={month} delay={i * 80} />
          ))}
        </ScrollView>
      </View>

      {/* Safety nets */}
      {data.safety_nets && <SafetyNetsSection nets={data.safety_nets} />}

      {/* Survival actions */}
      {data.survival_actions && (
        <SurvivalActionsSection
          actions={data.survival_actions}
          comparison={data.survival_comparison}
        />
      )}

      {/* Insurance gap */}
      {data.insurance_gap_note && (
        <View style={styles.insuranceGap}>
          <Text style={styles.insuranceGapText}>💡 {data.insurance_gap_note}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {data.survives
            ? `✓ Fund holds for all ${data.timeline.length} months modelled`
            : `⚠ Fund exhausted — consider starting RM50/mo top-up today`}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.12)',
    padding: 18,
    marginVertical: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 2,
  },
  survivalBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  survivalText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  scenarioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  scenarioLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
  },
  riskProb: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 3,
    maxWidth: 180,
  },
  depletion: {
    alignItems: 'flex-end',
  },
  depletionLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    letterSpacing: 1.5,
  },
  depletionValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  phaseLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  phaseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  phaseDotLg: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  phaseChipText: {
    fontSize: 10,
    color: '#11181C',
    fontWeight: '600',
  },
  phaseChipRange: {
    fontSize: 9,
    color: '#9CA3AF',
  },
  timelineContainer: {
    marginBottom: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    gap: 6,
  },
  monthLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    width: 26,
    letterSpacing: 0.5,
  },
  phaseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  barTrack: {
    flex: 1,
    height: 22,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  depletedBar: {
    width: '100%',
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depletedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#DC2626',
    letterSpacing: 1,
  },
  barValue: {
    fontSize: 10,
    color: '#6B7280',
    width: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // ─── Section shared ────────────────────────────────────────────────────
  section: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  // ─── Safety nets ───────────────────────────────────────────────────────
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    backgroundColor: 'rgba(37,99,235,0.05)',
    borderRadius: 8,
    padding: 8,
  },
  netInfo: {
    flex: 1,
    marginRight: 8,
  },
  netName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#11181C',
  },
  netNote: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  netAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  // ─── Survival actions ──────────────────────────────────────────────────
  comparisonBanner: {
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#16A34A',
  },
  comparisonText: {
    fontSize: 11,
    color: '#374151',
  },
  comparisonGain: {
    fontWeight: '700',
    color: '#16A34A',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  actionTypeTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 1,
  },
  actionTypeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#11181C',
  },
  actionDesc: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  actionImpact: {
    alignItems: 'flex-end',
  },
  actionImpactRm: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  actionImpactLabel: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 1,
  },
  prepLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  prepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  prepBullet: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  prepText: {
    fontSize: 10,
    color: '#374151',
    flex: 1,
  },
  // ─── Insurance gap ────────────────────────────────────────────────────
  insuranceGap: {
    backgroundColor: 'rgba(217,119,6,0.07)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(217,119,6,0.35)',
  },
  insuranceGapText: {
    fontSize: 11,
    color: '#374151',
    lineHeight: 16,
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    padding: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 18,
  },
});
