import type { PlanData } from '@/hooks/use-resilience-stream';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

const TIER_ICONS = {
  aggressive: '🚀',
  balanced: '⚖️',
  safe: '🛡️',
};

const TIER_COLORS: Record<string, string> = {
  aggressive: '#4F8EF7',
  balanced: '#F5A623',
  safe: '#0FB67C',
};

const TAG_COLOR_HEX: Record<string, string> = {
  amber: '#F5A623',
  blue: '#4F8EF7',
  green: '#0FB67C',
};

type Props = {
  data: PlanData;
  onPlanSelect?: (tier: string, monthlySave: number) => void;
};

function TierCard({
  tier,
  selected,
  delay,
  onPress,
}: {
  tier: PlanData['tiers'][number];
  selected: boolean;
  delay: number;
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-20)).current;
  const borderGlow = useRef(new Animated.Value(0)).current;

  const color = TIER_COLORS[tier.id] ?? '#4F8EF7';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(borderGlow, {
      toValue: selected ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [selected]);

  const borderColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.06)', color + '88'],
  });

  const bgColor = borderGlow.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.02)', color + '11'],
  });

  return (
    <Animated.View
      style={[
        styles.tierCard,
        { opacity, transform: [{ translateX }], borderColor, backgroundColor: bgColor },
      ]}
    >
      <Pressable onPress={onPress} style={styles.tierPressable} android_ripple={{ color: color + '22' }}>
        {/* Left: icon + label */}
        <View style={styles.tierLeft}>
          <Text style={styles.tierIcon}>
            {TIER_ICONS[tier.id as keyof typeof TIER_ICONS] ?? '📊'}
          </Text>
          <View>
            <Text style={[styles.tierLabel, selected && { color }]}>{tier.label}</Text>
            <View style={[styles.tagBadge, { backgroundColor: TAG_COLOR_HEX[tier.tag_color] + '22', borderColor: TAG_COLOR_HEX[tier.tag_color] + '55' }]}>
              <Text style={[styles.tagText, { color: TAG_COLOR_HEX[tier.tag_color] }]}>{tier.tag}</Text>
            </View>
          </View>
        </View>

        {/* Right: amounts */}
        <View style={styles.tierRight}>
          <Text style={[styles.monthlyAmount, { color }]}>
            RM{tier.monthly_save.toFixed(0)}
            <Text style={styles.perMonth}>/mo</Text>
          </Text>
          <Text style={styles.weeklyAmount}>RM{tier.weekly_save.toFixed(0)}/wk</Text>
          <View style={styles.timelinePill}>
            <Text style={styles.timelineText}>{tier.months_to_target} months</Text>
          </View>
        </View>

        {/* Selected check */}
        {selected && (
          <View style={[styles.checkCircle, { backgroundColor: color }]}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function SavingsLadderCard({ data, onPlanSelect }: Props) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslate = useRef(new Animated.Value(16)).current;
  const [selectedTier, setSelectedTier] = useState<string>(
    data.tiers.find((t) => t.id === 'balanced')?.id ?? data.tiers[0]?.id ?? ''
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(cardTranslate, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSelect = (tier: PlanData['tiers'][number]) => {
    setSelectedTier(tier.id);
    onPlanSelect?.(tier.id, tier.monthly_save);
  };

  const selected = data.tiers.find((t) => t.id === selectedTier);

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: cardOpacity, transform: [{ translateY: cardTranslate }] },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: '#F5A623' }]} />
          <Text style={styles.cardTitle}>SAVINGS PLAN</Text>
        </View>
        {selected && (
          <Text style={styles.headerHint}>Tap a plan to select</Text>
        )}
      </View>

      {/* Goal context */}
      <View style={styles.goalRow}>
        <Text style={styles.goalLabel}>TARGET</Text>
        <Text style={styles.goalValue}>3-Month Emergency Fund</Text>
      </View>

      {/* Tiers */}
      <View style={styles.tierList}>
        {data.tiers.map((tier, i) => (
          <TierCard
            key={tier.id}
            tier={tier}
            selected={selectedTier === tier.id}
            delay={i * 120}
            onPress={() => handleSelect(tier)}
          />
        ))}
      </View>

      {/* Summary footer */}
      {selected && (
        <View style={[styles.summaryFooter, { borderColor: (TIER_COLORS[selected.id] ?? '#4F8EF7') + '33' }]}>
          <Text style={styles.summaryText}>
            Starting{' '}
            <Text style={{ color: TIER_COLORS[selected.id] ?? '#4F8EF7', fontWeight: '700' }}>
              RM{selected.monthly_save.toFixed(0)}/month
            </Text>
            {' '}today, you’ll hit your goal in{' '}
            <Text style={{ color: '#E8EEFF', fontWeight: '700' }}>
              {selected.months_to_target} months.
            </Text>
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0D1826',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.2)',
    padding: 18,
    marginVertical: 6,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  headerHint: {
    fontSize: 10,
    color: '#4A6080',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  goalLabel: {
    fontSize: 9,
    color: '#4A6080',
    letterSpacing: 1.5,
  },
  goalValue: {
    fontSize: 13,
    color: '#B8C8E0',
    fontWeight: '600',
  },
  tierList: {
    gap: 8,
    marginBottom: 12,
  },
  tierCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  tierPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  tierLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  tierIcon: {
    fontSize: 22,
  },
  tierLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8EEFF',
    marginBottom: 4,
  },
  tagBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  tierRight: {
    alignItems: 'flex-end',
  },
  monthlyAmount: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  perMonth: {
    fontSize: 11,
    fontWeight: '400',
    color: '#7A90B5',
  },
  weeklyAmount: {
    fontSize: 11,
    color: '#7A90B5',
    marginTop: 2,
  },
  timelinePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  timelineText: {
    fontSize: 10,
    color: '#B8C8E0',
    fontVariant: ['tabular-nums'],
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  checkMark: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },
  summaryFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 2,
  },
  summaryText: {
    fontSize: 13,
    color: '#7A90B5',
    lineHeight: 20,
    textAlign: 'center',
  },
});
