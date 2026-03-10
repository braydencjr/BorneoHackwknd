import type { ScoreData } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const TIER_COLORS = {
  strong: '#0FB67C',
  moderate: '#F5A623',
  critical: '#FF4757',
};

const TIER_LABELS = {
  strong: 'RESILIENT',
  moderate: 'AT RISK',
  critical: 'CRITICAL',
};

// Needle rotation: score 0 → -90deg, score 100 → +90deg
type Props = { data: ScoreData };

export default function ResilienceGaugeCard({ data }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const needleRotation = useRef(new Animated.Value(-90)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const color = TIER_COLORS[data.tier];

  useEffect(() => {
    const targetDeg = (data.score / 100) * 180 - 90;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(needleRotation, {
          toValue: targetDeg,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 800,
          delay: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const rotate = needleRotation.interpolate({
    inputRange: [-90, 90],
    outputRange: ['-90deg', '90deg'],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: cardOpacity, transform: [{ scale: cardScale }] },
        { borderColor: color + '33' },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.cardTitle}>RESILIENCE SCORE</Text>
      </View>

      {/* Gauge */}
      <View style={styles.gaugeWrapper}>
        {/* Arc track segments — 5 colored zones */}
        <View style={styles.arcContainer}>
          {/* Background arc */}
          <View style={[styles.arcTrack, styles.arcSegment1]} />
          <View style={[styles.arcTrack, styles.arcSegment2]} />
          <View style={[styles.arcTrack, styles.arcSegment3]} />
          <View style={[styles.arcTrack, styles.arcSegment4]} />
          <View style={[styles.arcTrack, styles.arcSegment5]} />

          {/* Needle */}
          <View style={styles.needleBase}>
            <Animated.View
              style={[
                styles.needle,
                { transform: [{ rotate }] },
              ]}
            />
          </View>

          {/* Center cap */}
          <View style={[styles.centerCap, { backgroundColor: color }]} />
        </View>

        {/* Score number */}
        <Text style={[styles.scoreNumber, { color }]}>
          {Math.round(data.score)}
        </Text>

        <View style={[styles.tierBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Text style={[styles.tierText, { color }]}>{TIER_LABELS[data.tier]}</Text>
        </View>
      </View>

      {/* Verdict */}
      <Animated.View style={[styles.verdictRow, { opacity: glowOpacity }]}>
        <Text style={styles.verdictText}>{data.verdict}</Text>
      </Animated.View>

      {/* Dimension bars */}
      <View style={styles.dimensions}>
        {Object.entries(data.dimensions).map(([key, val]) => (
          <View key={key} style={styles.dimItem}>
            <Text style={styles.dimLabel}>{key.toUpperCase()}</Text>
            <View style={styles.dimBarTrack}>
              <View
                style={[
                  styles.dimBarFill,
                  {
                    width: `${val}%`,
                    backgroundColor: val >= 70 ? '#0FB67C' : val >= 40 ? '#F5A623' : '#FF4757',
                  },
                ]}
              />
            </View>
            <Text style={styles.dimValue}>{Math.round(val)}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1826',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
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
  gaugeWrapper: {
    alignItems: 'center',
    marginVertical: 4,
  },
  arcContainer: {
    width: 200,
    height: 100,
    overflow: 'hidden',
    position: 'relative',
  },
  arcTrack: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 14,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    top: 0,
  },
  arcSegment1: { borderTopColor: '#FF4757', transform: [{ rotate: '-90deg' }] },
  arcSegment2: { borderTopColor: '#FF8C42', transform: [{ rotate: '-54deg' }] },
  arcSegment3: { borderTopColor: '#F5A623', transform: [{ rotate: '-18deg' }] },
  arcSegment4: { borderTopColor: '#7BC27A', transform: [{ rotate: '18deg' }] },
  arcSegment5: { borderTopColor: '#0FB67C', transform: [{ rotate: '54deg' }] },
  needleBase: {
    position: 'absolute',
    bottom: 0,
    left: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  needle: {
    width: 3,
    height: 80,
    backgroundColor: '#E8EEFF',
    borderRadius: 2,
    transformOrigin: 'bottom',
    position: 'absolute',
    bottom: 0,
  },
  centerCap: {
    position: 'absolute',
    bottom: -6,
    left: 91,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '800',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginTop: 4,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  verdictRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  verdictText: {
    fontSize: 13,
    color: '#B8C8E0',
    lineHeight: 20,
    textAlign: 'center',
  },
  dimensions: {
    marginTop: 14,
    gap: 8,
  },
  dimItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dimLabel: {
    fontSize: 10,
    color: '#4A6080',
    letterSpacing: 1,
    width: 70,
  },
  dimBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dimBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  dimValue: {
    fontSize: 11,
    color: '#7A90B5',
    width: 28,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
