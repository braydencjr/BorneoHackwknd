/**
 * personalizedsuggestionpage.tsx
 *
 * Layout:
 *  ┌──────────────────────────────────────┐  ← flashcard zone (hero)
 *  │  Title + subtitle                    │
 *  │  ← Card  [next card peeking] →       │  peek reveals swipeability
 *  │  • ─────── • •  dots                 │
 *  │  ↔ Swipe hint (fades after 1 swipe)  │
 *  └──────────────────────────────────────┘
 *  ── Supporting detail ─────────────────── ← clearly secondary
 *  Detail panel  (white card, smaller)
 *  [ 📋 1 2 3 4 5 ] navigation pills
 *  Financial Insights (tip/praise/warning)
 */

import { BASE_URL } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_W } = Dimensions.get("window");
// Narrower card so next card peeks in from the right
const CARD_W = SCREEN_W - 72;
const CARD_SPACING = 12;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SuggestionCard {
  title: string;
  body: string;
  icon: string;
  color: string;
  detail: string;
}

interface InsightCard {
  type: "praise" | "warning" | "consequence" | "tip";
  icon: string;
  title: string;
  body: string;
}

interface SummaryData {
  income: number;
  outcome: number;
  top_category: string | null;
  top_category_amount: number;
  transaction_count: number;
  period_days: number;
}

type Slide =
  | { type: "header"; summary: SummaryData }
  | { type: "suggestion"; card: SuggestionCard; index: number };

const INSIGHT_THEME: Record<InsightCard["type"], { bg: string; accent: string; icon_bg: string }> = {
  praise: { bg: "#F0FDF4", accent: "#16A34A", icon_bg: "#DCFCE7" },
  warning: { bg: "#FFFBEB", accent: "#D97706", icon_bg: "#FEF3C7" },
  consequence: { bg: "#FFF1F2", accent: "#E11D48", icon_bg: "#FFE4E6" },
  tip: { bg: "#EFF6FF", accent: "#1D4ED8", icon_bg: "#DBEAFE" },
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  const anim = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View style={[styles.card, styles.skeletonCard, { opacity: anim }]}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: "40%", marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: "85%", marginTop: 28 }]} />
      <View style={[styles.skeletonLine, { width: "65%", marginTop: 10 }]} />
      <View style={[styles.skeletonLine, { width: "75%", marginTop: 10 }]} />
    </Animated.View>
  );
}

// ─── Swipe hint (pulses, fades after first swipe) ─────────────────────────────

function SwipeHint({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, { toValue: 8, duration: 500, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.swipeHintRow, { opacity }]}>
      <Ionicons name="chevron-back" size={14} color="#94A3B8" />
      <Text style={styles.swipeHintText}>Swipe cards</Text>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
      </Animated.View>
    </Animated.View>
  );
}

// ─── Dots ─────────────────────────────────────────────────────────────────────

function Dots({ count, active }: { count: number; active: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
      ))}
    </View>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ slide }: { slide: Slide }) {
  if (slide.type === "header") {
    const { summary } = slide;
    const net = summary.income - summary.outcome;
    return (
      <View style={styles.detailBox}>
        <Text style={styles.detailHeading}>30-Day Snapshot</Text>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Income</Text>
          <Text style={[styles.detailValue, { color: "#16A34A" }]}>RM {summary.income.toFixed(2)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Spent</Text>
          <Text style={[styles.detailValue, { color: "#DC2626" }]}>RM {summary.outcome.toFixed(2)}</Text>
        </View>
        <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.detailLabel}>Net</Text>
          <Text style={[styles.detailValue, { color: net >= 0 ? "#16A34A" : "#DC2626" }]}>
            {net >= 0 ? "+" : ""}RM {Math.abs(net).toFixed(2)}
          </Text>
        </View>
        {summary.top_category && (
          <View style={styles.detailChip}>
            <Text style={styles.detailChipText}>
              🔝 Biggest: <Text style={{ fontWeight: "700" }}>{summary.top_category}</Text>
              {" · "}RM {summary.top_category_amount.toFixed(2)}
            </Text>
          </View>
        )}
      </View>
    );
  }

  const { card } = slide;
  return (
    <View style={[styles.detailBox, { borderLeftWidth: 3, borderLeftColor: card.color }]}>
      <Text style={styles.detailHeading}>{card.icon}  {card.title}</Text>
      <Text style={styles.detailBody}>{card.body}</Text>
      {card.detail ? (
        <View style={[styles.actionRow, { borderColor: card.color + "33" }]}>
          <Ionicons name="checkmark-circle" size={15} color={card.color} style={{ marginTop: 1 }} />
          <Text style={[styles.actionText, { color: card.color }]}>{card.detail}</Text>
        </View>
      ) : null}
    </View>
  );
}

// NavStrip removed — redundant with swipe + dots

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCardView({ item }: { item: InsightCard }) {
  const theme = INSIGHT_THEME[item.type];
  const label = { praise: "Great news", warning: "Heads up", consequence: "Watch out", tip: "Tip" }[item.type];
  return (
    <View style={[styles.insightCard, { borderLeftColor: theme.accent }]}>
      <View style={[styles.insightIconBox, { backgroundColor: theme.icon_bg }]}>
        <Text style={styles.insightIconText}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.insightLabel, { color: theme.accent }]}>{label.toUpperCase()}</Text>
        <Text style={styles.insightTitle}>{item.title}</Text>
        <Text style={styles.insightBody}>{item.body}</Text>
      </View>
    </View>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuggestionPage() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasSwiped, setHasSwiped] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await SecureStore.getItemAsync("accessToken");
      const res = await fetch(`${BASE_URL}/api/v1/summary/suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      const items: Slide[] = [
        { type: "header", summary: data.summary },
        ...(data.cards as SuggestionCard[]).map(
          (card, i): Slide => ({ type: "suggestion", card, index: i })
        ),
      ];
      setSlides(items);
      setInsights(data.insights ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuggestions(); }, []);

  const scrollTo = (idx: number) => {
    flatRef.current?.scrollToIndex({ index: idx, animated: true });
    setActiveIndex(idx);
    if (!hasSwiped) setHasSwiped(true);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.heroZone}>
          <Text style={styles.pageTitle}>Your Daily Report</Text>
          <Text style={styles.pageSubtitle}>AI-powered financial insights</Text>
          <SkeletonCard />
          <ActivityIndicator style={{ marginTop: 16 }} color="#fff" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", gap: 16 }]}>
        <Ionicons name="cloud-offline-outline" size={52} color="#CBD5E1" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchSuggestions}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeSlide = slides[activeIndex] ?? slides[0];
  const suggCount = slides.filter((s) => s.type === "suggestion").length;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSuggestions} />}
    >
      {/* ══ HERO ZONE — visually dominant ══════════════════════════════════ */}
      <View style={styles.heroZone}>
        <Text style={styles.pageTitle}>Your Daily Report</Text>
        <Text style={styles.pageSubtitle}>
          {new Date().toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}
        </Text>

        {/* Flashcard FlatList — peek effect shows next card */}
        <FlatList
          ref={flatRef}
          data={slides}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_SPACING}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.flatContent}
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_SPACING));
            const clamped = Math.max(0, Math.min(idx, slides.length - 1));
            setActiveIndex(clamped);
            if (!hasSwiped && clamped > 0) setHasSwiped(true);
          }}
          renderItem={({ item }) => {
            if (item.type === "header") {
              const { summary } = item;
              const spendPct =
                summary.income + summary.outcome > 0
                  ? (summary.outcome / (summary.income + summary.outcome)) * 100
                  : 0;
              const net = summary.income - summary.outcome;
              return (
                <View style={styles.cardWrapper}>
                  <View style={[styles.card, { backgroundColor: "#0F3D91" }]}>
                    <Text style={styles.hEyebrow}>📅  30-Day Overview</Text>

                    <Text style={styles.hBalance}>
                      {net >= 0 ? "+" : ""}RM {Math.abs(net).toFixed(2)}
                    </Text>
                    <Text style={[styles.hBalanceLabel, { color: net >= 0 ? "#4ADE80" : "#F87171" }]}>
                      {net >= 0 ? "Saved this period" : "Over budget this period"}
                    </Text>

                    <View style={styles.hStatsRow}>
                      <View style={styles.hStat}>
                        <Text style={styles.hStatNum}>RM {summary.income.toFixed(0)}</Text>
                        <Text style={styles.hStatLabel}>Income</Text>
                      </View>
                      <View style={styles.hStatDivider} />
                      <View style={styles.hStat}>
                        <Text style={[styles.hStatNum, { color: "#F87171" }]}>RM {summary.outcome.toFixed(0)}</Text>
                        <Text style={styles.hStatLabel}>Spent</Text>
                      </View>
                      <View style={styles.hStatDivider} />
                      <View style={styles.hStat}>
                        <Text style={styles.hStatNum}>{suggCount}</Text>
                        <Text style={styles.hStatLabel}>Suggestions</Text>
                      </View>
                    </View>

                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.min(spendPct, 100)}%`, backgroundColor: spendPct > 80 ? "#F87171" : "#4ADE80" },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{spendPct.toFixed(0)}% of income spent →  Swipe to see suggestions</Text>
                  </View>
                </View>
              );
            }

            const { card, index } = item;
            return (
              <View style={styles.cardWrapper}>
                <View style={[styles.card, { backgroundColor: card.color }]}>
                  {/* Card number badge */}
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{index + 1} / {suggCount}</Text>
                  </View>

                  <Text style={styles.sIcon}>{card.icon}</Text>
                  <Text style={styles.sTitle}>{card.title}</Text>
                  <View style={styles.sDivider} />
                  <Text style={styles.sBody}>{card.body}</Text>
                </View>
              </View>
            );
          }}
        />

        {/* Dots — prominent on dark bg */}
        <Dots count={slides.length} active={activeIndex} />

        {/* Swipe hint — fades after first swipe */}
        <SwipeHint visible={!hasSwiped} />
      </View>

      {/* ══ SUPPORTING CONTENT ═══════════════════════════════════════════ */}
      <View style={styles.supportZone}>

        {/* Section label */}
        <View style={styles.supportHeader}>
          <View style={styles.supportLine} />
          <Text style={styles.supportLabel}>Details</Text>
          <View style={styles.supportLine} />
        </View>

        {/* Detail panel */}
        {activeSlide && <DetailPanel slide={activeSlide} />}

        {/* Insights */}
        {insights.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Financial Insights</Text>
            <Text style={styles.sectionSub}>Based on your last 30 days</Text>
            {insights.map((item, i) => (
              <InsightCardView key={i} item={item} />
            ))}
          </>
        )}

        <View style={{ height: 36 }} />
      </View>
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },

  // ── Hero zone (dark gradient feel) ──
  heroZone: {
    backgroundColor: "#F1F5F9",
    paddingTop: 20,
    paddingBottom: 24,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#000",
    paddingHorizontal: 24,
    marginBottom: 2,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#94A3B8",
    paddingHorizontal: 24,
    marginBottom: 20,
  },

  // ── FlatList ──
  flatContent: { paddingLeft: 24, paddingRight: 24, gap: CARD_SPACING },
  cardWrapper: { width: CARD_W },

  card: {
    width: CARD_W,
    borderRadius: 26,
    padding: 26,
    margin: 10,
    minHeight: 300,
    shadowColor: "#F3F5F9",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
    justifyContent: "flex-end",
  },

  // Header card internals
  hEyebrow: {
    fontSize: 11,
    color: "#93C5FD",
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
    position: "absolute",
    top: 26,
    left: 26,
  },
  hBalance: {
    fontSize: 40,
    fontWeight: "900",
    color: "#FFFFFF",
    lineHeight: 44,
  },
  hBalanceLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
  },
  hStatsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  hStat: { flex: 1, alignItems: "center" },
  hStatNum: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  hStatLabel: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  hStatDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.15)" },
  barTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  barFill: { height: 6, borderRadius: 3 },
  barLabel: { fontSize: 11, color: "#64748B" },

  // Suggestion card internals
  cardBadge: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  cardBadgeText: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  sIcon: { fontSize: 44, marginBottom: 12 },
  sTitle: { fontSize: 26, fontWeight: "900", color: "#FFFFFF", lineHeight: 32, marginBottom: 10 },
  sDivider: { height: 2, backgroundColor: "rgba(255,255,255,0.25)", marginBottom: 12 },
  sBody: { fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 22 },

  // Dots
  dotsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 3, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#94A3B8" },
  dotActive: { width: 22, height: 8, borderRadius: 4, backgroundColor: "#1E3A8A" },

  // Swipe hint
  swipeHintRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 3 },
  swipeHintText: { fontSize: 12, color: "#94A3B8" },

  // ── Support zone ──
  supportZone: { backgroundColor: "#F1F5F9", paddingTop: 4 },
  supportHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 24, marginTop: -2, marginBottom: 4 },
  supportLine: { flex: 1, height: 1, backgroundColor: "#E2E8F0" },
  supportLabel: { fontSize: 11, fontWeight: "600", color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase" },

  // Detail panel
  detailBox: {
    marginHorizontal: 24, marginTop: 12,
    backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  detailHeading: { fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 10 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  detailLabel: { fontSize: 14, color: "#64748B" },
  detailValue: { fontSize: 14, fontWeight: "700" },
  detailChip: { backgroundColor: "#F0F4FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  detailChipText: { fontSize: 13, color: "#1E3A8A" },
  detailBody: { fontSize: 14, color: "#475569", lineHeight: 20, marginBottom: 10 },
  actionRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10, borderWidth: 1 },
  actionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },

  // Insights
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A", paddingHorizontal: 24, marginTop: 26, marginBottom: 2 },
  sectionSub: { fontSize: 12, color: "#94A3B8", paddingHorizontal: 24, marginBottom: 12 },
  insightCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    marginHorizontal: 24, marginBottom: 10, borderRadius: 16, padding: 14,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 4,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  insightIconBox: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center" },
  insightIconText: { fontSize: 20 },
  insightLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 2 },
  insightTitle: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginBottom: 3 },
  insightBody: { fontSize: 13, color: "#475569", lineHeight: 18 },

  // Skeleton
  skeletonCard: { backgroundColor: "#1E293B", justifyContent: "flex-start", marginHorizontal: 24 },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: "#334155", width: "100%" },

  // Error
  errorText: { color: "#64748B", fontSize: 15, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: { backgroundColor: "#1E3A8A", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14 },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});