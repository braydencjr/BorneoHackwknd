import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AISuggestion {
  mainSuggestion: string;
  mainDetail: string;
  potentialSaving: string;
  reason: string[];
  impact: { icon: string; text: string; color: string; bg: string }[];
  extraTip: string;
  category: string;
  generatedAt: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SUGGESTION: AISuggestion = {
  mainSuggestion: "Limit food delivery to 2 times this week.",
  mainDetail:
    "You spent RM45 more on food delivery than usual. Cutting back frees up a meaningful buffer for your emergency fund.",
  potentialSaving: "RM60",
  category: "🍔 Food & Dining",
  reason: [
    "Food delivery spending increased by 28% this week",
    "Dining is currently your highest spending category",
    "Your savings rate dropped from 22% to 15% this month",
  ],
  impact: [
    { icon: "cash-outline", text: "Save around RM60 this week", color: "#059669", bg: "#D1FAE5" },
    { icon: "trending-up-outline", text: "Increase emergency savings by 5%", color: "#2563EB", bg: "#DBEAFE" },
    { icon: "shield-checkmark-outline", text: "Improve resilience score by 3 pts", color: "#7C3AED", bg: "#EDE9FE" },
  ],
  extraTip:
    "Set a weekly food budget of RM120 using a cash envelope or a dedicated sub-account.",
  generatedAt: "Today, 8:00 AM",
};

// ─── Animated fade-in wrapper ─────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

// ─── Daily Suggestion Card ────────────────────────────────────────────────────

function DailySuggestionCard({ data }: { data: AISuggestion }) {
  return (
    <FadeIn delay={0}>
      <LinearGradient
        colors={["#4F46E5", "#7C3AED", "#A855F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mainCard}
      >

        {/* Top Row */}
        <View style={styles.mainCardHeader}>
          <View style={styles.bulbBadge}>
            <Text style={{ fontSize: 14 }}>💡</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.mainCardLabel}>Today's AI Suggestion</Text>
            <Text style={styles.mainCardTime}>{data.generatedAt}</Text>
          </View>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryPillText}>{data.category}</Text>
          </View>
        </View>

        {/* Main Text */}
        <Text style={styles.mainSuggestion}>{data.mainSuggestion}</Text>
        <Text style={styles.mainDetail}>{data.mainDetail}</Text>

        {/* Saving Row */}
        <View style={styles.savingRow}>
          <Ionicons name="cash-outline" size={16} color="#86EFAC" />
          <Text style={styles.savingText}>
            Potential saving:{" "}
            <Text style={styles.savingAmount}>{data.potentialSaving}</Text>
          </Text>
        </View>
      </LinearGradient>
    </FadeIn>
  );
}

// ─── Reason Card ──────────────────────────────────────────────────────────────

function SuggestionReason({ reasons }: { reasons: string[] }) {
  return (
    <FadeIn delay={120}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <LinearGradient colors={["#F97316", "#FB923C"]} style={styles.iconBadge}>
            <Ionicons name="analytics-outline" size={16} color="#FFF" />
          </LinearGradient>
          <Text style={styles.cardTitle}>Why this suggestion?</Text>
        </View>
        {reasons.map((r, i) => (
          <View key={i} style={styles.reasonRow}>
            <View style={styles.reasonIndex}>
              <Text style={styles.reasonIndexText}>{i + 1}</Text>
            </View>
            <Text style={styles.reasonText}>{r}</Text>
          </View>
        ))}
      </View>
    </FadeIn>
  );
}

// ─── Impact Card ──────────────────────────────────────────────────────────────

function ImpactCard({ impacts }: { impacts: AISuggestion["impact"] }) {
  return (
    <FadeIn delay={220}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <LinearGradient colors={["#0EA5E9", "#38BDF8"]} style={styles.iconBadge}>
            <Ionicons name="flash" size={16} color="#FFF" />
          </LinearGradient>
          <Text style={styles.cardTitle}>If you follow this</Text>
        </View>
        <View style={styles.impactGrid}>
          {impacts.map((item, i) => (
            <View
              key={i}
              style={[styles.impactChip, { backgroundColor: item.bg }]}
            >
              <View style={[styles.impactChipIcon, { backgroundColor: item.color + "22" }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={[styles.impactChipText, { color: item.color }]}>
                {item.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </FadeIn>
  );
}

// ─── Extra Tip Card ───────────────────────────────────────────────────────────

function ExtraTipCard({ tip }: { tip: string }) {
  return (
    <FadeIn delay={320}>
      <LinearGradient
        colors={["#FEF3C7", "#FDE68A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.extraCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.starBadge}>
            <Text style={{ fontSize: 14 }}>⭐</Text>
          </View>
          <Text style={styles.extraCardTitle}>Bonus Tip</Text>
        </View>
        <Text style={styles.extraTipText}>{tip}</Text>
      </LinearGradient>
    </FadeIn>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PersonalizedSuggestionPage() {
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const startSpin = () => {
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  const load = () => {
    setLoading(true);
    setSuggestion(null);
    startSpin();
    // TODO: Replace with real API call to /api/v1/suggestions/daily
    setTimeout(() => {
      setSuggestion(MOCK_SUGGESTION);
      setLoading(false);
    }, 1300);
  };

  useEffect(() => {
    load();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 80 }}
    >
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Today's Insight</Text>
          <Text style={styles.pageSubtitle}>Personalised just for you ✨</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={load} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="refresh-outline" size={20} color="#4F46E5" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <LinearGradient
            colors={["#4F46E5", "#A855F7"]}
            style={styles.loadingBadge}
          >
            <ActivityIndicator color="#FFF" size="small" />
          </LinearGradient>
          <Text style={styles.loadingTitle}>Analysing your habits…</Text>
          <Text style={styles.loadingSubtitle}>
            Our AI is looking at your recent spending
          </Text>
        </View>
      ) : suggestion ? (
        <>
          <DailySuggestionCard data={suggestion} />
          <SuggestionReason reasons={suggestion.reason} />
          <ImpactCard impacts={suggestion.impact} />
          <ExtraTipCard tip={suggestion.extraTip} />
        </>
      ) : null}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 18,
  },

  // Page header
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1E1B4B",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 3,
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#4F46E5",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 70,
  },
  loadingBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E1B4B",
    marginBottom: 6,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },

  // Main gradient card
  mainCard: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#7C3AED",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },

  mainCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },
  bulbBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  mainCardLabel: {
    fontSize: 12,
    color: "#C4B5FD",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  mainCardTime: {
    fontSize: 11,
    color: "#A78BFA",
    marginTop: 2,
  },
  categoryPill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryPillText: {
    color: "#EDE9FE",
    fontSize: 11,
    fontWeight: "600",
  },
  mainSuggestion: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 28,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  mainDetail: {
    fontSize: 14,
    color: "#C4B5FD",
    lineHeight: 21,
    marginBottom: 18,
  },
  savingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  savingText: {
    fontSize: 13,
    color: "#D9F99D",
  },
  savingAmount: {
    fontWeight: "800",
    color: "#86EFAC",
  },

  // Shared card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1E1B4B",
  },

  // Reason card
  reasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
    gap: 10,
  },
  reasonIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EEF2FF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  reasonIndexText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4F46E5",
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: "#475569",
    lineHeight: 21,
  },

  // Impact card — grid chips
  impactGrid: {
    gap: 10,
  },
  impactChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  impactChipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  impactChipText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  // Extra tip
  extraCard: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    elevation: 2,
  },
  starBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  extraCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#92400E",
  },
  extraTipText: {
    fontSize: 14,
    color: "#78350F",
    lineHeight: 22,
  },
});