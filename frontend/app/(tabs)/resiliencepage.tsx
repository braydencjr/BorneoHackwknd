import React, { useEffect, useRef } from 'react';
import { Animated, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';

import ResilienceChat from '@/components/resilience/resilience-chat';
import { ResilienceProvider, useResilience } from '@/context/resilience-context';

const TIER_COLORS = { strong: '#0FB67C', moderate: '#F5A623', critical: '#FF4757' };

function ScoreBadge() {
  const { resilienceScore } = useResilience();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (resilienceScore !== null) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      ]).start();
    }
  }, [resilienceScore]);

  if (resilienceScore === null) {
    return (
      <View style={styles.badgePlaceholder}>
        <Text style={styles.badgePlaceholderText}>— —</Text>
      </View>
    );
  }

  const tier =
    resilienceScore >= 70 ? 'strong' : resilienceScore >= 40 ? 'moderate' : 'critical';
  const color = TIER_COLORS[tier];

  return (
    <Animated.View
      style={[
        styles.scoreBadge,
        { borderColor: color + '55', opacity, transform: [{ scale }] },
      ]}
    >
      <Text style={[styles.scoreNumber, { color }]}>{Math.round(resilienceScore)}</Text>
      <Text style={[styles.scoreSlash, { color }]}>/100</Text>
    </Animated.View>
  );
}

function ResiliencePageInner() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#060D1A" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.aiOrb}>
            <Text style={styles.aiOrbText}>AI</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>FinShield AI</Text>
            <Text style={styles.headerSub}>Financial Resilience Agent</Text>
          </View>
        </View>
        <ScoreBadge />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Chat */}
      <ResilienceChat />
    </SafeAreaView>
  );
}

export default function ResiliencePage() {
  return (
    <ResilienceProvider>
      <ResiliencePageInner />
    </ResilienceProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#060D1A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aiOrb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(79,142,247,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiOrbText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4F8EF7',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#E8EEFF',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 11,
    color: '#4A6080',
    marginTop: 1,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  scoreNumber: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreSlash: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.6,
  },
  badgePlaceholder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  badgePlaceholderText: {
    fontSize: 13,
    color: '#4A6080',
    letterSpacing: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});