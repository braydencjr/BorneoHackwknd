import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChipsData } from '@/hooks/use-resilience-stream';

type Props = {
  data: ChipsData;
  onPress: (text: string) => void;
};

function Chip({
  label,
  delay,
  onPress,
}: {
  label: string;
  delay: number;
  onPress: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const pressed = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressed, { toValue: 0.93, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressed, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale: pressed }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.chip}
        android_ripple={{ color: 'rgba(79,142,247,0.15)', borderless: false }}
      >
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function ActionChips({ data, onPress }: Props) {
  const rowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rowOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: rowOpacity }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: '#4F8EF7' }]} />
        <Text style={styles.headerText}>SUGGESTED ACTIONS</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {data.chips.map((chip, i) => (
          <Chip
            key={i}
            label={chip}
            delay={i * 80}
            onPress={() => onPress(chip)}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerText: {
    fontSize: 9,
    color: '#4A6080',
    letterSpacing: 2,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: 'rgba(79,142,247,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.28)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  chipText: {
    fontSize: 13,
    color: '#A8C0E8',
    fontWeight: '500',
  },
});
