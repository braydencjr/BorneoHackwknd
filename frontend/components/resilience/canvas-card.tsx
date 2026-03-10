/**
 * CanvasCard — renders an AI-generated interactive HTML lesson.
 *
 * In chat: shows a tappable thumbnail card with the lesson title.
 * On tap:  opens a full-screen modal / WebView containing the HTML slide deck.
 *
 * Sandboxing:
 *  - Native  → react-native-webview (OS-level isolation, no extra sandbox needed)
 *  - Web     → <iframe sandbox="allow-scripts"> (script-only, no parent access)
 */
import React, { useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import type { CanvasData } from '@/hooks/use-resilience-stream';

// react-native-webview is only present on native builds — import conditionally
let WebView: any = null;
if (Platform.OS !== 'web') {
   
  WebView = require('react-native-webview').WebView;
}

/* ─────────── Web iframe renderer ─────────── */
function WebIframe({ html }: { html: string }) {
  // On Expo web we render a sandboxed iframe
  // sandbox="allow-scripts" lets the navigation JS run but blocks parent access
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-scripts"
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        border: 'none',
        background: '#F5F5F5',
      }}
      title="Interactive Lesson"
    />
  );
}

/* ─────────── Full-screen canvas modal ─────────── */
function CanvasModal({
  visible,
  title,
  html,
  onClose,
}: {
  visible: boolean;
  title: string;
  html: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalRoot}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />

        {/* Modal header */}
        <View style={styles.modalHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.lessonBadge}>
              <Text style={styles.lessonBadgeText}>📚</Text>
            </View>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Canvas content */}
        <View style={styles.canvasArea}>
          {Platform.OS === 'web' ? (
            <WebIframe html={html} />
          ) : (
            WebView && (
              <WebView
                source={{ html }}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled={false}
                allowFileAccess={false}
                style={styles.webview}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              />
            )
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/* ─────────── Chat thumbnail card ─────────── */
export default function CanvasCard({ data }: { data: CanvasData }) {
  const [open, setOpen] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          {/* Glowing top accent */}
          <View style={styles.cardAccent} />

          <View style={styles.cardBody}>
            <View style={styles.cardIcon}>
              <Text style={styles.cardIconText}>📚</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardLabel}>INTERACTIVE LESSON</Text>
              <Text style={styles.cardTitle}>{data.title}</Text>
              <Text style={styles.cardSub}>Tap to open • Swipe through slides</Text>
            </View>
            <Text style={styles.cardArrow}>›</Text>
          </View>
        </Animated.View>
      </Pressable>

      <CanvasModal
        visible={open}
        title={data.title}
        html={data.html}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  /* ── Thumbnail card ── */
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.18)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardAccent: {
    height: 3,
    backgroundColor: '#2563EB',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(37,99,235,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: {
    fontSize: 22,
  },
  cardText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#2563EB',
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 11,
    color: '#6B7280',
  },
  cardArrow: {
    fontSize: 22,
    color: '#2563EB',
    fontWeight: '300',
  },

  /* ── Modal ── */
  modalRoot: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  lessonBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(37,99,235,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonBadgeText: {
    fontSize: 17,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#11181C',
    flex: 1,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  canvasArea: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
