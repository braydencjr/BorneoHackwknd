/**
 * personalizedsuggestionpage.tsx
 *
 * Layout (vertical ScrollView):
 *  ┌─────────────────────────┐
 *  │  Title                  │
 *  │  ← Flashcards →         │
 *  │  • • • • •              │  dots
 *  │  Detail panel           │  synced to active card
 *  │  [ 📋 1 2 3 4 5 ]       │  navigation pill strip
 *  │  ── Insights ──         │  praise/warning/consequence/tip cards
 *  └─────────────────────────┘
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
const CARD_W = SCREEN_W - 48;

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

// ─── Insight theme map ───────────────────────────────────────────────────────

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
      <View style={[styles.skeletonLine, { width: "55%", marginTop: 10 }]} />
      <View style={[styles.skeletonLine, { width: "80%", marginTop: 22 }]} />
      <View style={[styles.skeletonLine, { width: "65%", marginTop: 8 }]} />
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
              🔝 Biggest spend: <Text style={{ fontWeight: "700" }}>{summary.top_category}</Text>
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

// ─── Navigation strip ─────────────────────────────────────────────────────────

function NavStrip({
  slides,
  active,
  onPress,
}: {
  slides: Slide[];
  active: number;
  onPress: (i: number) => void;
}) {
  return (
    <View style={styles.navStrip}>
      {slides.map((slide, i) => {
        const isActive = i === active;
        const label = slide.type === "header" ? "📋" : String(slide.index + 1);
        const color = slide.type === "suggestion" ? slide.card.color : "#0F3D91";
        return (
          <TouchableOpacity
            key={i}
            style={[
              styles.navPill,
              isActive
                ? { backgroundColor: color }
                : { backgroundColor: "#E2E8F0" },
            ]}
            onPress={() => onPress(i)}
            activeOpacity={0.75}
          >
            <Text style={[styles.navPillText, isActive && { color: "#fff" }]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Insight card ─────────────────────────────────────────────────────────────

function InsightCardView({ item }: { item: InsightCard }) {
  const theme = INSIGHT_THEME[item.type];
  const label = { praise: "Great news", warning: "Heads up", consequence: "Watch out", tip: "Tip" }[item.type];
  return (
    <View style={[styles.insightCard, { backgroundColor: theme.bg }]}>
      <View style={[styles.insightIconBox, { backgroundColor: theme.icon_bg }]}>
        <Text style={styles.insightIconText}>{item.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.insightLabelRow}>
          <Text style={[styles.insightLabel, { color: theme.accent }]}>{label.toUpperCase()}</Text>
        </View>
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
  };

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24 }}>
        <Text style={styles.pageTitle}>Your Daily Report</Text>
        <SkeletonCard />
        <ActivityIndicator style={{ marginTop: 20 }} color="#1E3A8A" />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={52} color="#CBD5E1" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchSuggestions}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeSlide = slides[activeIndex] ?? slides[0];

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSuggestions} />}
    >
      <Text style={styles.pageTitle}>Your Daily Report</Text>

      {/* ── Flashcards ── */}
      <FlatList
        ref={flatRef}
        data={slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + 16}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={styles.flatContent}
        nestedScrollEnabled
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 16));
          setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
        }}
        renderItem={({ item }) => {
          if (item.type === "header") {
            const { summary } = item;
            const spendPct =
              summary.income + summary.outcome > 0
                ? (summary.outcome / (summary.income + summary.outcome)) * 100
                : 0;
            return (
              <View style={styles.cardWrapper}>
                <View style={[styles.card, { backgroundColor: "#0F3D91" }]}>
                  <Text style={styles.hEyebrow}>📅  30-Day Report</Text>
                  <Text style={styles.hBalance}>
                    RM {(summary.income - summary.outcome).toFixed(2)}
                  </Text>
                  <Text style={styles.hBalanceLabel}>Net balance</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.min(spendPct, 100)}%`,
                          backgroundColor: spendPct > 80 ? "#F87171" : "#4ADE80",
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{spendPct.toFixed(0)}% of income spent</Text>
                  <Text style={styles.hHint}>Swipe for suggestions →</Text>
                </View>
              </View>
            );
          }
          const { card, index } = item;
          const total = slides.filter((s) => s.type === "suggestion").length;
          return (
            <View style={styles.cardWrapper}>
              <View style={[styles.card, { backgroundColor: card.color }]}>
                <Text style={styles.sCounter}>{index + 1} / {total}</Text>
                <Text style={styles.sIcon}>{card.icon}</Text>
                <Text style={styles.sTitle}>{card.title}</Text>
                <Text style={styles.sBody} numberOfLines={3}>{card.body}</Text>
              </View>
            </View>
          );
        }}
      />

      {/* ── Dots ── */}
      <Dots count={slides.length} active={activeIndex} />

      {/* ── Detail panel ── */}
      {activeSlide && <DetailPanel slide={activeSlide} />}

      {/* ── Navigation strip ── */}
      <Text style={styles.navLabel}>Jump to card</Text>
      <NavStrip slides={slides} active={activeIndex} onPress={scrollTo} />

      {/* ── Insights section ── */}
      {insights.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Financial Insights</Text>
          <Text style={styles.sectionSub}>Based on your last 30 days of activity</Text>
          {insights.map((item, i) => (
            <InsightCardView key={i} item={item} />
          ))}
        </>
      )}

      <View style={{ height: 36 }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1F5F9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },

  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 16,
  },

  // ── FlatList ──
  flatContent: { paddingHorizontal: 24, gap: 16 },
  cardWrapper: { width: CARD_W },
  card: {
    width: CARD_W,
    borderRadius: 24,
    padding: 24,
    minHeight: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
    justifyContent: "center",
  },

  // Header card
  hEyebrow: { fontSize: 12, color: "#93C5FD", fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 },
  hBalance: { fontSize: 34, fontWeight: "800", color: "#FFFFFF" },
  hBalanceLabel: { fontSize: 13, color: "#BFDBFE", marginBottom: 18 },
  barTrack: { height: 7, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, overflow: "hidden", marginBottom: 6 },
  barFill: { height: 7, borderRadius: 4 },
  barLabel: { fontSize: 12, color: "#BFDBFE", marginBottom: 14 },
  hHint: { fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right" },

  // Suggestion card
  sCounter: { fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: "600", textAlign: "right", marginBottom: 12 },
  sIcon: { fontSize: 38, marginBottom: 10 },
  sTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginBottom: 8, lineHeight: 28 },
  sBody: { fontSize: 14, color: "rgba(255,255,255,0.82)", lineHeight: 20 },

  // Dots
  dotsRow: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 14, marginBottom: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#CBD5E1" },
  dotActive: { width: 18, backgroundColor: "#1E3A8A" },

  // Detail panel
  detailBox: {
    marginHorizontal: 24, marginTop: 14,
    backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  detailHeading: { fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  detailLabel: { fontSize: 14, color: "#64748B" },
  detailValue: { fontSize: 14, fontWeight: "700" },
  detailChip: { backgroundColor: "#F0F4FF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 12 },
  detailChipText: { fontSize: 13, color: "#1E3A8A" },
  detailBody: { fontSize: 14, color: "#475569", lineHeight: 20, marginBottom: 10 },
  actionRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10,
    borderWidth: 1,
  },
  actionText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600" },

  // Nav strip
  navLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "600", textAlign: "center", marginTop: 18, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" },
  navStrip: { flexDirection: "row", justifyContent: "center", gap: 8, paddingHorizontal: 24 },
  navPill: {
    minWidth: 40, height: 40, borderRadius: 20,
    justifyContent: "center", alignItems: "center", paddingHorizontal: 12,
  },
  navPillText: { fontSize: 14, fontWeight: "700", color: "#64748B" },

  // Insights
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", paddingHorizontal: 24, marginTop: 28, marginBottom: 2 },
  sectionSub: { fontSize: 13, color: "#94A3B8", paddingHorizontal: 24, marginBottom: 14 },
  insightCard: {
    flexDirection: "row", gap: 14, alignItems: "flex-start",
    marginHorizontal: 24, marginBottom: 12, borderRadius: 18, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  insightIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  insightIconText: { fontSize: 22 },
  insightLabelRow: { flexDirection: "row", marginBottom: 3 },
  insightLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  insightTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A", marginBottom: 4 },
  insightBody: { fontSize: 13, color: "#475569", lineHeight: 19 },

  // Skeleton
  skeletonCard: { backgroundColor: "#E2E8F0", justifyContent: "flex-start" },
  skeletonLine: { height: 14, borderRadius: 7, backgroundColor: "#CBD5E1", width: "100%" },

  // Error
  errorText: { color: "#64748B", fontSize: 15, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: { backgroundColor: "#1E3A8A", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14 },
  retryText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});