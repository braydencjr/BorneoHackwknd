import type { AlertData } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const URGENCY_CONFIG: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  critical: { color: '#FF4757', bg: 'rgba(255,71,87,0.08)', label: 'CRITICAL ALERT', icon: '🚨' },
  high: { color: '#FF4757', bg: 'rgba(255,71,87,0.08)', label: 'HIGH ALERT', icon: '🚨' },
  medium: { color: '#F5A623', bg: 'rgba(245,166,35,0.08)', label: 'WARNING', icon: '⚠️' },
  low: { color: '#F5A623', bg: 'rgba(245,166,35,0.05)', label: 'CAUTION', icon: '📊' },
};

type Props = { data: AlertData };

export default function EmergencyAlertCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;
  const borderGlow = useRef(new Animated.Value(0.3)).current;
  const titleShake = useRef(new Animated.Value(0)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const bulletOpacities = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  const cfg = URGENCY_CONFIG[data.urgency] ?? URGENCY_CONFIG.high;

  useEffect(() => {
    // Card entrance
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true }),
    ]).start(() => {
      // Shake title after entrance
      Animated.sequence([
        Animated.timing(titleShake, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(titleShake, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(titleShake, { toValue: 4, duration: 60, useNativeDriver: true }),
        Animated.timing(titleShake, { toValue: -4, duration: 60, useNativeDriver: true }),
        Animated.timing(titleShake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();

      // Stagger bullet points
      Animated.stagger(
        180,
        bulletOpacities.map((anim) =>
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true })
        )
      ).start();
    });

    // Pulsing border glow (if high urgency)
    if (data.urgency === 'high') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderGlow, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(borderGlow, { toValue: 0.3, duration: 900, useNativeDriver: false }),
        ])
      ).start();
    }

    // Icon heartbeat
    Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(iconPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const borderColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [cfg.color + '33', cfg.color + 'BB'],
  });

  const shadowOpacity = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.35],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: cardOpacity,
          transform: [{ scale: cardScale }],
          borderColor,
          backgroundColor: cfg.bg,
          shadowOpacity,
          shadowColor: cfg.color,
        },
      ]}
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <Animated.Text style={[styles.iconLarge, { transform: [{ scale: iconPulse }] }]}>
          {cfg.icon}
        </Animated.Text>
        <Animated.View style={{ transform: [{ translateX: titleShake }] }}>
          <Text style={[styles.urgencyLabel, { color: cfg.color }]}>{cfg.label}</Text>
          <Text style={styles.urgencySubLabel}>Emergency Fund Critical</Text>
        </Animated.View>
        <View style={[styles.urgencyBand, { backgroundColor: cfg.color }]}>
          <Text style={styles.urgencyBandText}>{data.urgency.toUpperCase()}</Text>
        </View>
      </View>

      {/* Savings gap */}
      <View style={[styles.gapBox, { borderColor: cfg.color + '33' }]}>
        <Text style={styles.gapLabel}>SAVINGS GAP</Text>
        <Text style={[styles.gapValue, { color: cfg.color }]}>
          RM{data.savings_gap.toLocaleString()}
        </Text>
        <Text style={styles.gapSub}>needed to reach safety threshold</Text>
      </View>

      {/* Action bullets */}
      <View style={styles.actionsSection}>
        <Text style={styles.actionsHeading}>IMMEDIATE ACTIONS</Text>
        {data.action_bullets.map((bullet, i) => (
          <Animated.View key={i} style={[styles.bulletRow, { opacity: bulletOpacities[i] ?? 1 }]}>
            <View style={[styles.bulletDot, { backgroundColor: cfg.color }]} />
            <Text style={styles.bulletText}>{bullet}</Text>
          </Animated.View>
        ))}
      </View>

      {/* Bottom accent */}
      <View style={[styles.bottomAccent, { backgroundColor: cfg.color + '22' }]}>
        <Text style={[styles.bottomAccentText, { color: cfg.color }]}>
          Act now — every month of delay costs more to recover from.
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    marginVertical: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    elevation: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconLarge: {
    fontSize: 32,
  },
  urgencyLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  urgencySubLabel: {
    fontSize: 11,
    color: '#7A90B5',
    marginTop: 2,
  },
  urgencyBand: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  urgencyBandText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  gapBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  gapLabel: {
    fontSize: 9,
    color: '#4A6080',
    letterSpacing: 2,
    marginBottom: 4,
  },
  gapValue: {
    fontSize: 36,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  gapSub: {
    fontSize: 11,
    color: '#7A90B5',
    marginTop: 2,
  },
  actionsSection: {
    marginBottom: 14,
  },
  actionsHeading: {
    fontSize: 9,
    color: '#4A6080',
    letterSpacing: 2,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: '#B8C8E0',
    lineHeight: 20,
  },
  bottomAccent: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bottomAccentText: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
