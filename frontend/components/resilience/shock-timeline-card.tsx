import type { ShockData } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

const SCENARIO_LABELS: Record<string, string> = {
  illness: '🤒 Medical Crisis',
  job_loss: '💼 Job Loss',
  disaster: '🌊 Natural Disaster',
  war: '⚠️ Civil Disruption',
};

type Props = { data: ShockData };

function TimelineBar({ month, delay }: { month: ShockData['timeline'][number]; delay: number }) {
  const barWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const isGone = month.status === 'depleted';
  const fillColor = isGone
    ? '#FF4757'
    : month.status === 'warning'
    ? '#F5A623'
    : '#0FB67C';

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
  }, []);

  return (
    <Animated.View style={[styles.barRow, { opacity }]}>
      <Text style={styles.monthLabel}>M{month.month}</Text>
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

export default function ShockTimelineCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const warningFlash = useRef(new Animated.Value(0.4)).current;

  const scenario = data.timeline[0]?.label?.split(':')[0]?.toLowerCase() ?? 'illness';

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
  }, []);

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
              backgroundColor: data.survives ? '#0FB67C22' : '#FF475722',
              borderColor: data.survives ? '#0FB67C44' : '#FF475744',
              opacity: warningFlash,
            },
          ]}
        >
          <Text style={[styles.survivalText, { color: data.survives ? '#0FB67C' : '#FF4757' }]}>
            {data.survives ? '✓ SURVIVES' : '✗ FAILS'}
          </Text>
        </Animated.View>
      </Animated.View>

      {/* Scenario label */}
      <View style={styles.scenarioRow}>
        <Text style={styles.scenarioLabel}>
          {SCENARIO_LABELS[scenario] ?? scenario}
        </Text>
        <View style={styles.depletion}>
          <Text style={styles.depletionLabel}>DEPLETES AT</Text>
          <Text style={[styles.depletionValue, { color: data.survives ? '#0FB67C' : '#FF4757' }]}>
            {data.depletes_at_month === null
              ? 'Never'
              : `Month ${data.depletes_at_month}`}
          </Text>
        </View>
      </View>

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

      {/* Footer note */}
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
    backgroundColor: '#0D1826',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.2)',
    padding: 18,
    marginVertical: 6,
    shadowColor: '#FF4757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
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
    color: '#7A90B5',
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
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  scenarioLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E8EEFF',
  },
  depletion: {
    alignItems: 'flex-end',
  },
  depletionLabel: {
    fontSize: 9,
    color: '#4A6080',
    letterSpacing: 1.5,
  },
  depletionValue: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
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
    color: '#4A6080',
    width: 26,
    letterSpacing: 0.5,
  },
  barTrack: {
    flex: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    backgroundColor: 'rgba(255,71,87,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depletedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF4757',
    letterSpacing: 1,
  },
  barValue: {
    fontSize: 10,
    color: '#7A90B5',
    width: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
  },
  footerText: {
    fontSize: 12,
    color: '#7A90B5',
    textAlign: 'center',
    lineHeight: 18,
  },
});
