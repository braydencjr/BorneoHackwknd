import React, { useEffect, useRef } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import ActionChips from '@/components/resilience/action-chips';
import EmergencyAlertCard from '@/components/resilience/emergency-alert-card';
import ResilienceGaugeCard from '@/components/resilience/gauge-card';
import SavingsLadderCard from '@/components/resilience/savings-ladder-card';
import ShockTimelineCard from '@/components/resilience/shock-timeline-card';
import VitalSignsCard from '@/components/resilience/vitals-card';
import { useResilience } from '@/context/resilience-context';
import type { CardData, ChatMessage, MessagePart } from '@/hooks/use-resilience-stream';

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
function SubagentChip({ status }: { status: string }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);

  return (
    <Animated.View style={[styles.subagentChip, { opacity }]}>
      <Text style={styles.subagentText}>🔬 {status}</Text>
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
    case 'shock':
      return <ShockTimelineCard data={card} />;
    default:
      return null;
  }
}

/* ─────────── Part renderer ─────────── */
function PartView({
  part,
  onChipPress,
}: {
  part: MessagePart;
  onChipPress: (t: string) => void;
}) {
  if (part.type === 'text' && part.content) {
    return (
      <View style={styles.agentBubble}>
        <Markdown style={markdownStyles}>{part.content}</Markdown>
      </View>
    );
  }

  if (part.type === 'tool_running') {
    return <ToolLoadingRow toolName={part.tool} />;
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
}: {
  message: ChatMessage;
  onChipPress: (t: string) => void;
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
        <PartView key={i} part={part} onChipPress={onChipPress} />
      ))}
    </Animated.View>
  );
}

/* ─────────── Main chat component ─────────── */
export default function ResilienceChat() {
  const { messages, isStreaming, subagentStatus, sendMessage, triggerAutoScan } =
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
        <SubagentChip status={subagentStatus.scenario} />
      )}

      {/* Message list */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <MessageRow message={item} onChipPress={(t) => sendMessage(t)} />
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
          editable={!isStreaming}
          multiline
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
});
