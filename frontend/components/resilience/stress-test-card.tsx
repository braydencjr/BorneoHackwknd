import type { StressTestData, StressTestScenario } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const SCENARIO_META: Record<string, { emoji: string; color: string }> = {
  illness:   { emoji: '🤒', color: '#FF6B35' },
  job_loss:  { emoji: '💼', color: '#FF4757' },
  disaster:  { emoji: '🌊', color: '#4F8EF7' },
  war:       { emoji: '⚠️', color: '#9B59B6' },
};

type Props = { data: StressTestData };

function ScenarioRow({
  s,
  isMostDangerous,
  isSafest,
  delay,
}: {
  s: StressTestScenario;
  isMostDangerous: boolean;
  isSafest: boolean;
  delay: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 300, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, opacity, translateX]);

  const meta = SCENARIO_META[s.scenario] ?? { emoji: '⚡', color: '#F5A623' };
  const depletionColor = s.survives ? '#16A34A' : s.depletes_at_month && s.depletes_at_month <= 2 ? '#DC2626' : '#D97706';

  return (
    <Animated.View
      style={[
        styles.scenarioRow,
        isMostDangerous && styles.scenarioRowDanger,
        isSafest && styles.scenarioRowSafe,
        { opacity, transform: [{ translateX }] },
      ]}
    >
      <Text style={styles.scenarioEmoji}>{meta.emoji}</Text>
      <View style={styles.scenarioInfo}>
        <View style={styles.scenarioNameRow}>
          <Text style={styles.scenarioName}>{s.label}</Text>
          {isMostDangerous && (
            <View style={styles.badge}>
              <Text style={styles.badgeDangerText}>MOST DANGEROUS</Text>
            </View>
          )}
          {isSafest && (
            <View style={[styles.badge, styles.badgeSafe]}>
              <Text style={styles.badgeSafeText}>SAFEST</Text>
            </View>
          )}
        </View>
        <Text style={styles.scenarioBurn}>
          Avg burn: RM{s.monthly_burn >= 1000 ? `${(s.monthly_burn / 1000).toFixed(1)}k` : s.monthly_burn}/mo
        </Text>
      </View>
      <View style={styles.scenarioOutcome}>
        <Text style={[styles.depletionText, { color: depletionColor }]}>
          {s.survives ? 'SURVIVES ✓' : `M${s.depletes_at_month} 💀`}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function StressTestCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;

  const allSurvive = data.survival_count === 4;
  const noneSurvive = data.survival_count === 0;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.spring(ringScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [cardOpacity, cardTranslate, ringScale]);

  const ringColor = allSurvive ? '#16A34A' : noneSurvive ? '#DC2626' : '#D97706';

  return (
    <Animated.View
      style={[styles.card, { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.dot} />
          <Text style={styles.cardTitle}>FULL STRESS TEST</Text>
        </View>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{data.months_simulated} MONTHS</Text>
        </View>
      </View>

      {/* Survival ring */}
      <View style={styles.ringSection}>
        <Animated.View
          style={[
            styles.survivalRing,
            { borderColor: ringColor, transform: [{ scale: ringScale }] },
          ]}
        >
          <Text style={[styles.ringCount, { color: ringColor }]}>{data.survival_count}</Text>
          <Text style={styles.ringLabel}>of 4</Text>
          <Text style={styles.ringSublabel}>SURVIVE</Text>
        </Animated.View>
        <Text style={styles.verdict}>{data.verdict}</Text>
      </View>

      {/* Scenario rows */}
      <View style={styles.scenarioList}>
        {data.scenarios.map((s, i) => (
          <ScenarioRow
            key={s.scenario}
            s={s}
            isMostDangerous={s.scenario === data.most_dangerous}
            isSafest={s.scenario === data.safest}
            delay={i * 100 + 200}
          />
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Starting savings: RM{data.starting_savings >= 1000 ? `${(data.starting_savings / 1000).toFixed(1)}k` : data.starting_savings}
          {' · '}Ask about any scenario for a detailed breakdown
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
    borderColor: 'rgba(37,99,235,0.12)',
    padding: 18,
    marginVertical: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
    backgroundColor: '#2563EB',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 2,
  },
  durationBadge: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  durationText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563EB',
    letterSpacing: 1,
  },
  ringSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  survivalRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCount: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 28,
  },
  ringLabel: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 13,
  },
  ringSublabel: {
    fontSize: 8,
    color: '#9CA3AF',
    letterSpacing: 1,
  },
  verdict: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  scenarioList: {
    gap: 8,
    marginBottom: 14,
  },
  scenarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  scenarioRowDanger: {
    backgroundColor: 'rgba(220,38,38,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.15)',
  },
  scenarioRowSafe: {
    backgroundColor: 'rgba(22,163,74,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.2)',
  },
  scenarioEmoji: {
    fontSize: 22,
  },
  scenarioInfo: {
    flex: 1,
  },
  scenarioNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  scenarioName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  badge: {
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeDangerText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  badgeSafe: {
    backgroundColor: 'rgba(22,163,74,0.1)',
  },
  badgeSafeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#16A34A',
    letterSpacing: 0.5,
  },
  scenarioBurn: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  scenarioOutcome: {
    alignItems: 'flex-end',
  },
  depletionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    padding: 10,
  },
  footerText: {
    fontSize: 11,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 16,
  },
});