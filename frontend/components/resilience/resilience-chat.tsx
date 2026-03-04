import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import ActionChips from '@/components/resilience/action-chips';
import CanvasCard from '@/components/resilience/canvas-card';
import EmergencyAlertCard from '@/components/resilience/emergency-alert-card';
import ResilienceGaugeCard from '@/components/resilience/gauge-card';
import SavingsLadderCard from '@/components/resilience/savings-ladder-card';
import ShockTimelineCard from '@/components/resilience/shock-timeline-card';
import VitalSignsCard from '@/components/resilience/vitals-card';
import { useResilience } from '@/context/resilience-context';
import type { CardData, ChatMessage, MessagePart, ThinkingStep } from '@/hooks/use-resilience-stream';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ─────────── Markdown styles (dark theme) ─────────── */
const markdownStyles = StyleSheet.create({
  body: {
    color: '#B8C8E0',
    fontSize: 14,
    lineHeight: 22,
    backgroundColor: 'transparent',
  },
  paragraph: {
    color: '#B8C8E0',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 0,
    marginBottom: 6,
  },
  heading1: { color: '#E8EEFF', fontSize: 18, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  heading2: { color: '#E8EEFF', fontSize: 16, fontWeight: '700', marginBottom: 4, marginTop: 4 },
  heading3: { color: '#C8D8F0', fontSize: 15, fontWeight: '600', marginBottom: 4, marginTop: 4 },
  strong: { color: '#E8EEFF', fontWeight: '700' },
  em: { color: '#9BB0CC', fontStyle: 'italic' },
  bullet_list: { marginBottom: 4 },
  ordered_list: { marginBottom: 4 },
  list_item: { color: '#B8C8E0', fontSize: 14, lineHeight: 22, marginBottom: 2 },
  bullet_list_icon: { color: '#4F8EF7', marginRight: 6 },
  code_inline: {
    backgroundColor: 'rgba(79,142,247,0.12)',
    color: '#7EC8E3',
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fence: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  code_block: {
    color: '#B8C8E0',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  blockquote: {
    backgroundColor: 'rgba(79,142,247,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#4F8EF7',
    paddingLeft: 10,
    paddingVertical: 4,
    marginVertical: 4,
  },
  hr: { backgroundColor: 'rgba(255,255,255,0.1)', height: 1, marginVertical: 8 },
  link: { color: '#4F8EF7' },
  table: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginVertical: 6 },
  thead: { backgroundColor: 'rgba(79,142,247,0.12)' },
  th: { color: '#E8EEFF', fontWeight: '700', padding: 6, fontSize: 13 },
  tr: { borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  td: { color: '#B8C8E0', padding: 6, fontSize: 13 },
});

/* ─────────── Typing indicator ─────────── */
function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(d, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.typingRow}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: d }]} />
      ))}
    </View>
  );
}

/* ─────────── Subagent status chip ─────────── */
function SubagentChip({ status, step }: { status: string; step?: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  // Detect if this is the educator subagent or shock simulator
  const isLesson = status.startsWith('lesson:');
  const baseLabel = isLesson
    ? '📚 Building interactive lesson…'
    : `🔬 Simulating ${status.replace('_', ' ')} scenario…`;

  // Show intermediate step label if the educator has surfaced one
  const label = step ?? baseLabel;

  return (
    <Animated.View style={[styles.subagentChip, isLesson && styles.subagentChipLesson, { opacity }]}>
      <Text style={styles.subagentText}>{label}</Text>
    </Animated.View>
  );
}

/* ─────────── Tool loading row ─────────── */
function ToolLoadingRow({ toolName }: { toolName: string }) {
  const TOOL_LABELS: Record<string, string> = {
    display_vitals: 'Reading vital signs…',
    show_resilience_score: 'Calculating resilience score…',
    trigger_emergency_alert: 'Checking emergency signals…',
    show_savings_plan: 'Building savings plan…',
    suggest_actions: 'Generating actions…',
    simulate_shock: 'Simulating financial shock…',
  };

  return (
    <View style={styles.toolRow}>
      <TypingIndicator />
      <Text style={styles.toolLabel}>{TOOL_LABELS[toolName] ?? `Running ${toolName}…`}</Text>
    </View>
  );
}

/* ─────────── Card dispatcher ─────────── */
function CardDispatcher({ card, onChipPress }: { card: CardData; onChipPress: (t: string) => void }) {
  switch (card.card) {
    case 'vitals':
      return <VitalSignsCard data={card} />;
    case 'score':
      return <ResilienceGaugeCard data={card} />;
    case 'alert':
      return <EmergencyAlertCard data={card} />;
    case 'plan':
      return <SavingsLadderCard data={card} />;
    case 'chips':
      return <ActionChips data={card} onPress={onChipPress} />;
    case 'canvas':
      return <CanvasCard data={card} />;
    case 'shock':
      return <ShockTimelineCard data={card} />;
    default:
      return null;
  }
}

/* ─────────── HITL approval card ─────────── */
function HitlApprovalCard({
  message,
  topic,
  decision,
  onResolve,
}: {
  message: string;
  topic: string;
  decision?: 'approved' | 'rejected';
  onResolve: (approved: boolean) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale  = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true }),
    ]).start();
  }, []);

  const decided = decision != null;

  return (
    <Animated.View style={[styles.hitlCard, { opacity, transform: [{ scale }] }]}>
      {/* Icon row */}
      <View style={styles.hitlIconRow}>
        <View style={styles.hitlIconBadge}>
          <Text style={styles.hitlIconText}>📚</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hitlTitle}>Interactive Lesson</Text>
          <Text style={styles.hitlTopic} numberOfLines={2}>{topic}</Text>
        </View>
      </View>

      <Text style={styles.hitlMessage}>{message}</Text>

      {decided ? (
        <View style={styles.hitlDecidedRow}>
          <Text style={[
            styles.hitlDecidedText,
            decision === 'approved' ? styles.hitlApprovedText : styles.hitlRejectedText,
          ]}>
            {decision === 'approved' ? '✓ Lesson approved — building now…' : '× Skipped — answering directly…'}
          </Text>
        </View>
      ) : (
        <View style={styles.hitlButtonRow}>
          <Pressable
            style={[styles.hitlBtn, styles.hitlBtnApprove]}
            onPress={() => onResolve(true)}
          >
            <Text style={styles.hitlBtnApproveText}>✓ Open Lesson</Text>
          </Pressable>
          <Pressable
            style={[styles.hitlBtn, styles.hitlBtnReject]}
            onPress={() => onResolve(false)}
          >
            <Text style={styles.hitlBtnRejectText}>× Skip</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

/* ─────────── Inline subagent progress row ─────────── */
function SubagentProgressRow({ label, isLesson }: { label: string; isLesson: boolean }) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const accent = isLesson ? '#0FB67C' : '#F5A623';

  return (
    <View style={[styles.subagentProgressRow, { borderColor: accent + '33' }]}>
      <Animated.View style={[
        styles.subagentProgressDot,
        { backgroundColor: accent, opacity: pulse },
      ]} />
      <Text style={[styles.subagentProgressLabel, { color: accent }]}>{label}</Text>
    </View>
  );
}

/* ─────────── Collapsible thinking block ─────────── */
function ThinkingBlock({ steps, collapsed }: { steps: ThinkingStep[]; collapsed: boolean }) {
  const [expanded, setExpanded] = useState(!collapsed);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevCollapsed = useRef(collapsed);

  // Entry animation
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, []);

  // Pulse animation for active state
  useEffect(() => {
    if (!collapsed) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    }
  }, [collapsed]);

  // Auto-collapse when the backend signals completion
  useEffect(() => {
    if (collapsed && !prevCollapsed.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded(false);
    }
    prevCollapsed.current = collapsed;
  }, [collapsed]);

  if (steps.length === 0 && !collapsed) {
    // Still thinking, no steps yet — show minimal indicator
    return (
      <Animated.View style={[styles.thinkingContainer, { opacity: fadeAnim }]}>
        <View style={styles.thinkingSummaryRow}>
          <Animated.View style={[styles.thinkingDot, { opacity: pulseAnim }]} />
          <Text style={styles.thinkingSummaryText}>Thinking…</Text>
        </View>
      </Animated.View>
    );
  }

  if (steps.length === 0) return null;

  const isActive = !collapsed;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const latestRunning = steps.filter((s) => s.status === 'running').slice(-1)[0];
  const summaryText = isActive
    ? latestRunning?.label ?? `Processing (${doneCount}/${steps.length})…`
    : `Processed ${steps.length} step${steps.length > 1 ? 's' : ''}`;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <Animated.View style={[styles.thinkingContainer, { opacity: fadeAnim }]}>
      <Pressable onPress={toggleExpand} style={styles.thinkingSummaryRow}>
        {isActive ? (
          <Animated.View style={[styles.thinkingDot, { opacity: pulseAnim }]} />
        ) : (
          <Text style={styles.thinkingCheckmark}>✓</Text>
        )}
        <Text style={[styles.thinkingSummaryText, collapsed && styles.thinkingSummaryDone]}>
          {summaryText}
        </Text>
        <Text style={styles.thinkingChevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.thinkingStepsList}>
          {steps.map((step) => (
            <View key={step.id} style={styles.thinkingStepRow}>
              {step.status === 'done' ? (
                <Text style={styles.thinkingStepCheck}>✓</Text>
              ) : (
                <Animated.View style={[styles.thinkingStepDotActive, { opacity: pulseAnim }]} />
              )}
              <Text style={[
                styles.thinkingStepLabel,
                step.status === 'done' && styles.thinkingStepLabelDone,
              ]}>
                {step.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

/* ─────────── Part renderer ─────────── */
function PartView({
  part,
  onChipPress,
  onHitlResolve,
}: {
  part: MessagePart;
  onChipPress: (t: string) => void;
  onHitlResolve: (approved: boolean) => void;
}) {
  if (part.type === 'text' && part.content) {
    return (
      <View style={styles.agentBubble}>
        <Markdown style={markdownStyles}>{part.content}</Markdown>
      </View>
    );
  }

  if (part.type === 'thinking') {
    return <ThinkingBlock steps={part.steps} collapsed={part.collapsed} />;
  }

  if (part.type === 'tool_running') {
    return <ToolLoadingRow toolName={part.tool} />;
  }

  if (part.type === 'subagent_running') {
    return <SubagentProgressRow label={part.label} isLesson={part.isLesson} />;
  }

  if (part.type === 'hitl_approval') {
    return (
      <HitlApprovalCard
        message={part.message}
        topic={part.topic}
        decision={part.decision}
        onResolve={onHitlResolve}
      />
    );
  }

  if (part.type === 'tool_result') {
    return <CardDispatcher card={part.data} onChipPress={onChipPress} />;
  }

  return null;
}

/* ─────────── Message row ─────────── */
function MessageRow({
  message,
  onChipPress,
  onHitlResolve,
}: {
  message: ChatMessage;
  onChipPress: (t: string) => void;
  onHitlResolve: (approved: boolean) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const userText =
    message.role === 'user'
      ? message.parts
          .filter((p) => p.type === 'text')
          .map((p) => (p as { type: 'text'; content: string }).content)
          .join('')
      : '';

  if (message.role === 'user') {
    return (
      <Animated.View style={[styles.userRow, { opacity, transform: [{ translateY }] }]}>
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText}>{userText}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.agentRow, { opacity, transform: [{ translateY }] }]}>
      {message.parts.map((part, i) => (
        <PartView key={i} part={part} onChipPress={onChipPress} onHitlResolve={onHitlResolve} />
      ))}
    </Animated.View>
  );
}

/* ─────────── Main chat component ─────────── */
export default function ResilienceChat() {
  const { messages, isStreaming, subagentStatus, sendMessage, sendResume, triggerAutoScan } =
    useResilience();

  const [inputText, setInputText] = React.useState('');
  const flatRef = useRef<FlatList>(null);
  const hasScanFired = useRef(false);

  // Auto-scan on mount — fire exactly once, regardless of hook identity changes
  useEffect(() => {
    if (hasScanFired.current) return;
    hasScanFired.current = true;
    const timer = setTimeout(triggerAutoScan, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    setInputText('');
    sendMessage(text);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Subagent status banner */}
      {subagentStatus && (
        <SubagentChip status={subagentStatus.scenario} step={subagentStatus.step} />
      )}

      {/* Message list */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <MessageRow
            message={item}
            onChipPress={(t) => sendMessage(t)}
            onHitlResolve={(approved) => sendResume(approved)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isStreaming && messages[messages.length - 1]?.role === 'user' ? (
            <View style={styles.streamingIndicator}>
              <TypingIndicator />
            </View>
          ) : null
        }
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask anything… e.g. What if I lose my job?"
          placeholderTextColor="#4A6080"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
          editable={!isStreaming}
        />
        <Pressable
          style={[styles.sendButton, (!inputText.trim() || isStreaming) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || isStreaming}
        >
          <Text style={styles.sendIcon}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060D1A',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  userRow: {
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  userBubble: {
    backgroundColor: '#1A2F52',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.25)',
  },
  userBubbleText: {
    fontSize: 14,
    color: '#E8EEFF',
    lineHeight: 20,
  },
  agentRow: {
    alignItems: 'flex-start',
    marginBottom: 8,
    width: '100%',
  },
  agentBubble: {
    backgroundColor: '#0D1826',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '88%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 6,
  },
  agentBubbleText: {
    fontSize: 14,
    color: '#B8C8E0',
    lineHeight: 22,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  toolLabel: {
    fontSize: 12,
    color: '#4A6080',
    fontStyle: 'italic',
  },
  typingRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingVertical: 2,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4F8EF7',
  },
  streamingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  subagentProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(15,182,124,0.04)',
    alignSelf: 'flex-start',
    maxWidth: '88%',
  },
  subagentProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subagentProgressLabel: {
    fontSize: 13,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  /* ── HITL approval card ─────────────────────── */
  hitlCard: {
    backgroundColor: '#0D1826',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.3)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 6,
    maxWidth: '92%',
    gap: 10,
  },
  hitlIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hitlIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(79,142,247,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitlIconText: { fontSize: 20 },
  hitlTitle: {
    fontSize: 11,
    color: '#4F8EF7',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  hitlTopic: {
    fontSize: 14,
    color: '#E8EEFF',
    fontWeight: '600',
  },
  hitlMessage: {
    fontSize: 13,
    color: '#7A90B5',
    lineHeight: 19,
  },
  hitlButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  hitlBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hitlBtnApprove: {
    backgroundColor: '#0FB67C',
  },
  hitlBtnApproveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  hitlBtnReject: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hitlBtnRejectText: {
    color: '#7A90B5',
    fontSize: 14,
    fontWeight: '600',
  },
  hitlDecidedRow: { marginTop: 2 },
  hitlDecidedText: { fontSize: 13, fontStyle: 'italic' },
  hitlApprovedText: { color: '#0FB67C' },
  hitlRejectedText: { color: '#7A90B5' },
  subagentChip: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'rgba(79,142,247,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  subagentChipLesson: {
    backgroundColor: 'rgba(15,182,124,0.08)',
    borderColor: 'rgba(15,182,124,0.25)',
  },
  subagentText: {
    fontSize: 12,
    color: '#7A90B5',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#060D1A',
  },
  input: {
    flex: 1,
    backgroundColor: '#0D1826',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.2)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
    fontSize: 14,
    color: '#E8EEFF',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F8EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(79,142,247,0.25)',
  },
  sendIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
  },
  /* ── Thinking block ─────────────────────── */
  thinkingContainer: {
    backgroundColor: 'rgba(79,142,247,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(79,142,247,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    maxWidth: '92%',
    alignSelf: 'flex-start',
  },
  thinkingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4F8EF7',
  },
  thinkingCheckmark: {
    fontSize: 12,
    color: '#0FB67C',
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
  },
  thinkingSummaryText: {
    flex: 1,
    fontSize: 13,
    color: '#7A90B5',
    fontStyle: 'italic',
  },
  thinkingSummaryDone: {
    color: '#4A6080',
  },
  thinkingChevron: {
    fontSize: 12,
    color: '#4A6080',
    marginLeft: 4,
  },
  thinkingStepsList: {
    marginTop: 6,
    paddingLeft: 4,
    gap: 4,
  },
  thinkingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thinkingStepCheck: {
    fontSize: 11,
    color: '#0FB67C',
    fontWeight: '700',
    width: 16,
    textAlign: 'center',
  },
  thinkingStepDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4F8EF7',
    marginHorizontal: 5,
  },
  thinkingStepLabel: {
    fontSize: 12,
    color: '#7A90B5',
    flex: 1,
  },
  thinkingStepLabelDone: {
    color: '#4A6080',
  },
});
