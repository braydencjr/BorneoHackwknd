import type { VitalsData } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const STATUS_COLORS = {
  ok: '#0FB67C',
  warning: '#F5A623',
  danger: '#FF4757',
};

const STATUS_LABELS = {
  ok: 'HEALTHY',
  warning: 'WATCH',
  danger: 'CRITICAL',
};

type VitalRowProps = {
  label: string;
  value: string;
  subtext: string;
  status: 'ok' | 'warning' | 'danger';
  progress: number; // 0–1
  delay: number;
};

function VitalRow({ label, value, subtext, status, progress, delay }: VitalRowProps) {
  const barWidth = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(barWidth, {
        toValue: progress,
        duration: 900,
        delay: delay + 200,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  const color = STATUS_COLORS[status];

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={[styles.statusBadge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
          <Text style={[styles.statusText, { color }]}>{STATUS_LABELS[status]}</Text>
        </View>
      </View>
      <View style={styles.rowValues}>
        <Text style={styles.rowValue}>{value}</Text>
        <Text style={styles.rowSubtext}>{subtext}</Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: color,
              width: barWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        <View style={[styles.barGlow, { shadowColor: color }]} />
      </View>
    </Animated.View>
  );
}

type Props = { data: VitalsData };

export default function VitalSignsCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const bufferProgress = Math.min(data.buffer_months / 6, 1);
  const debtProgress = Math.max(1 - data.debt_pressure / 100, 0);
  const cashflowProgress = Math.min(Math.max(data.cashflow_monthly / data.monthly_income, 0), 1);
  const habitProgress = data.habit_score / 100;

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.pulseIndicator} />
        <Text style={styles.cardTitle}>VITAL SIGNS</Text>
        <Text style={styles.cardSubtitle}>Financial Health Scan</Text>
      </View>

      <VitalRow
        label="Emergency Buffer"
        value={`${data.buffer_months} months`}
        subtext={`RM ${data.monthly_income.toLocaleString()} income`}
        status={data.buffer_status}
        progress={bufferProgress}
        delay={0}
      />
      <VitalRow
        label="Debt Pressure"
        value={`${data.debt_pressure}%`}
        subtext="of monthly income"
        status={data.debt_status}
        progress={debtProgress}
        delay={150}
      />
      <VitalRow
        label="Cash Flow"
        value={`+RM ${data.cashflow_monthly.toLocaleString()}`}
        subtext="monthly surplus"
        status={data.cashflow_status}
        progress={cashflowProgress}
        delay={300}
      />
      <VitalRow
        label="Spending Habits"
        value={`${data.habit_score}/100`}
        subtext="behaviour score"
        status={data.habit_status}
        progress={habitProgress}
        delay={450}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1826',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.18)',
    padding: 20,
    marginVertical: 6,
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
    gap: 8,
  },
  pulseIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F8EF7',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F8EF7',
    letterSpacing: 2,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#4A6080',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  row: {
    marginBottom: 16,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowLabel: {
    fontSize: 12,
    color: '#7A90B5',
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  rowValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  rowValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E8EEFF',
    fontVariant: ['tabular-nums'],
  },
  rowSubtext: {
    fontSize: 12,
    color: '#4A6080',
  },
  barTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  barGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 12,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
