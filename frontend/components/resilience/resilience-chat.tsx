/**
 * ResilienceChat — renders chat messages for the resilience agent.
 *
 * Displays:
 *  - Agent text (streamed markdown)
 *  - Thinking block (collapsible step indicators)
 *  - Shock timeline cards
 *  - Canvas / lesson cards
 *  - HITL approval cards
 *  - User message bubbles
 *
 * Dashboard cards (vitals, score, alert, plan, chips) are rendered
 * by the parent page as fixed sections and are excluded from this component.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import CanvasCard from '@/components/resilience/canvas-card';
import ShockTimelineCard from '@/components/resilience/shock-timeline-card';
import StressTestCard from '@/components/resilience/stress-test-card';
import type {
  CanvasData,
  ChatMessage,
  MessagePart,
  ShockData,
  StressTestData,
  ThinkingStep,
} from '@/hooks/use-resilience-stream';

// ─── Theme (mirrors page) ────────────────────────────────────────────────────
const T = {
  bg: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceRaised: '#F0F4FF',
  border: 'rgba(30,58,138,0.1)',
  accent: '#2563EB',
  green: '#16A34A',
  amber: '#D97706',
  red: '#DC2626',
  text: '#11181C',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  userBubble: '#1E3A8A',
};

// ─── Thinking Block ─────────────────────────────────────────────────────────
function ThinkingBlock({
  steps,
  collapsed,
}: {
  steps: ThinkingStep[];
  collapsed: boolean;
}) {
  if (steps.length === 0) return null;

  if (collapsed) {
    const doneCount = steps.filter((s) => s.status === 'done').length;
    return (
      <View style={styles.thinkingCollapsed}>
        <Ionicons name="checkmark-circle" size={14} color={T.green} />
        <Text style={styles.thinkingCollapsedText}>
          {doneCount} step{doneCount !== 1 ? 's' : ''} completed
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.thinkingBlock}>
      {steps.map((step) => (
        <View key={step.id} style={styles.thinkingStep}>
          {step.status === 'running' ? (
            <View style={styles.stepSpinner}>
              <Ionicons name="ellipse" size={6} color={T.accent} />
            </View>
          ) : (
            <Ionicons name="checkmark-circle" size={14} color={T.green} />
          )}
          <Text
            style={[
              styles.stepLabel,
              step.status === 'done' && styles.stepLabelDone,
            ]}
          >
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── HITL Approval Card ─────────────────────────────────────────────────────
function HITLCard({
  topic,
  message,
  decision,
  onApprove,
}: {
  topic: string;
  message: string;
  decision?: 'approved' | 'rejected';
  onApprove: (approved: boolean) => void;
}) {
  const hasDecision = decision != null;

  return (
    <View style={[styles.hitlCard, hasDecision && styles.hitlCardDecided]}>
      <View style={styles.hitlHeader}>
        <Text style={styles.hitlIcon}>📚</Text>
        <View style={styles.hitlHeaderText}>
          <Text style={styles.hitlTitle}>Interactive Lesson</Text>
          <Text style={styles.hitlTopic}>{topic}</Text>
        </View>
      </View>

      <Text style={styles.hitlMessage}>{message}</Text>

      {hasDecision ? (
        <View style={styles.hitlDecision}>
          <Ionicons
            name={decision === 'approved' ? 'checkmark-circle' : 'close-circle'}
            size={18}
            color={decision === 'approved' ? T.green : T.red}
          />
          <Text
            style={[
              styles.hitlDecisionText,
              { color: decision === 'approved' ? T.green : T.red },
            ]}
          >
            {decision === 'approved' ? 'Approved' : 'Skipped'}
          </Text>
        </View>
      ) : (
        <View style={styles.hitlBtns}>
          <Pressable
            onPress={() => onApprove(true)}
            style={[styles.hitlBtn, styles.hitlBtnApprove]}
          >
            <Ionicons name="checkmark" size={16} color="#fff" />
            <Text style={styles.hitlBtnText}>Open Lesson</Text>
          </Pressable>
          <Pressable
            onPress={() => onApprove(false)}
            style={[styles.hitlBtn, styles.hitlBtnReject]}
          >
            <Text style={[styles.hitlBtnText, { color: T.textSecondary }]}>Skip</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Subagent Progress ──────────────────────────────────────────────────────
function SubagentProgress({ label, isLesson }: { label: string; isLesson: boolean }) {
  return (
    <View style={styles.subagentRow}>
      <View style={styles.subagentSpinner}>
        <Ionicons name="sync" size={14} color={T.accent} />
      </View>
      <Text style={styles.subagentLabel}>{label}</Text>
    </View>
  );
}

// ─── Message Part Renderer ──────────────────────────────────────────────────
function RenderPart({
  part,
  onChipPress,
  onApprove,
}: {
  part: MessagePart;
  onChipPress: (text: string) => void;
  onApprove: (approved: boolean) => void;
}) {
  switch (part.type) {
    case 'text':
      if (!part.content.trim()) return null;
      return <Markdown style={markdownStyles}>{part.content}</Markdown>;

    case 'thinking':
      return <ThinkingBlock steps={part.steps} collapsed={part.collapsed} />;

    case 'tool_result': {
      const data = part.data;
      if (!data) return null;

      // Shock timeline
      if (data.card === 'shock') {
        return <ShockTimelineCard data={data as ShockData} />;
      }

      // Stress-test comparison
      if (data.card === 'stress_test') {
        return <StressTestCard data={data as StressTestData} />;
      }

      // Canvas / lesson
      if (data.card === 'canvas') {
        return <CanvasCard data={data as CanvasData} />;
      }

      // Chips are rendered by parent page; skip here
      if (data.card === 'chips') return null;

      return null;
    }

    case 'tool_running':
      return null; // Handled by thinking block

    case 'subagent_running':
      return <SubagentProgress label={part.label} isLesson={part.isLesson} />;

    case 'hitl_approval':
      return (
        <HITLCard
          topic={part.topic}
          message={part.message}
          decision={part.decision}
          onApprove={onApprove}
        />
      );

    default:
      return null;
  }
}

// ─── Agent Message Bubble ───────────────────────────────────────────────────
function AgentMessage({
  parts,
  onChipPress,
  onApprove,
}: {
  parts: MessagePart[];
  onChipPress: (text: string) => void;
  onApprove: (approved: boolean) => void;
}) {
  // Skip rendering if all parts are empty/null
  const hasContent = parts.some((p) => {
    if (p.type === 'text') return p.content.trim().length > 0;
    if (p.type === 'thinking') return p.steps.length > 0;
    if (p.type === 'tool_result') return p.data != null;
    if (p.type === 'hitl_approval') return true;
    if (p.type === 'subagent_running') return true;
    return false;
  });

  if (!hasContent) return null;

  return (
    <View style={styles.agentBubbleWrapper}>
      <View style={styles.agentAvatar}>
        <Ionicons name="shield-checkmark" size={14} color={T.accent} />
      </View>
      <View style={styles.agentBubbleContent}>
        {parts.map((part, idx) => (
          <RenderPart
            key={idx}
            part={part}
            onChipPress={onChipPress}
            onApprove={onApprove}
          />
        ))}
      </View>
    </View>
  );
}

// ─── User Message Bubble ─────────────────────────────────────────────────────
function UserMessage({ text }: { text: string }) {
  return (
    <View style={styles.userBubbleWrapper}>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>{text}</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ResilienceChat Component
// ═══════════════════════════════════════════════════════════════════════════════

type Props = {
  messages: ChatMessage[];
  onChipPress: (text: string) => void;
  onApprove: (approved: boolean) => void;
};

export default function ResilienceChat({ messages, onChipPress, onApprove }: Props) {
  return (
    <View style={styles.chatContainer}>
      {messages.map((msg) => {
        if (msg.role === 'user') {
          const textPart = msg.parts.find((p) => p.type === 'text');
          if (!textPart || textPart.type !== 'text') return null;
          return <UserMessage key={msg.id} text={textPart.content} />;
        }

        return (
          <AgentMessage
            key={msg.id}
            parts={msg.parts}
            onChipPress={onChipPress}
            onApprove={onApprove}
          />
        );
      })}
    </View>
  );
}

// ─── Markdown styles (light theme) ──────────────────────────────────────────
const markdownStyles = {
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: T.text,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
    fontSize: 14,
    lineHeight: 21,
    color: T.text,
  },
  strong: {
    fontWeight: '700' as const,
    color: T.text,
  },
  em: {
    fontStyle: 'italic' as const,
    color: T.textSecondary,
  },
  bullet_list: {
    marginBottom: 6,
  },
  ordered_list: {
    marginBottom: 6,
  },
  list_item: {
    fontSize: 14,
    lineHeight: 21,
    color: T.text,
  },
  bullet_list_icon: {
    color: T.accent,
    fontSize: 14,
    lineHeight: 21,
  },
  code_inline: {
    backgroundColor: 'rgba(37,99,235,0.08)',
    color: T.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: T.text,
    fontFamily: 'monospace',
  },
  fence: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: T.text,
    fontFamily: 'monospace',
  },
  heading1: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: T.text,
    marginBottom: 6,
    marginTop: 4,
  },
  heading2: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: T.text,
    marginBottom: 4,
    marginTop: 4,
  },
  heading3: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: T.textSecondary,
    marginBottom: 4,
    marginTop: 4,
  },
  blockquote: {
    backgroundColor: 'rgba(37,99,235,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: T.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  hr: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    height: 1,
    marginVertical: 8,
  },
  link: {
    color: T.accent,
    textDecorationLine: 'underline' as const,
  },
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  chatContainer: {
    gap: 10,
  },

  // ── Agent Message ──
  agentBubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  agentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: T.accent + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  agentBubbleContent: {
    flex: 1,
    gap: 6,
  },
  agentText: {
    fontSize: 14,
    lineHeight: 21,
    color: T.text,
  },

  // ── User Message ──
  userBubbleWrapper: {
    alignItems: 'flex-end',
  },
  userBubble: {
    backgroundColor: T.userBubble,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userBubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#fff',
  },

  // ── Thinking ──
  thinkingBlock: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
    gap: 8,
  },
  thinkingCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  thinkingCollapsedText: {
    fontSize: 11,
    color: T.textMuted,
  },
  thinkingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepSpinner: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 12,
    color: T.textSecondary,
  },
  stepLabelDone: {
    color: T.textMuted,
    textDecorationLine: 'line-through',
    textDecorationColor: T.textMuted,
  },

  // ── HITL Approval ──
  hitlCard: {
    backgroundColor: T.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.accent + '33',
    padding: 16,
    gap: 12,
  },
  hitlCardDecided: {
    opacity: 0.7,
  },
  hitlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hitlIcon: {
    fontSize: 24,
  },
  hitlHeaderText: {
    flex: 1,
  },
  hitlTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: T.accent,
    letterSpacing: 0.5,
  },
  hitlTopic: {
    fontSize: 11,
    color: T.textSecondary,
    marginTop: 2,
  },
  hitlMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: T.textSecondary,
  },
  hitlBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  hitlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  hitlBtnApprove: {
    backgroundColor: T.accent,
  },
  hitlBtnReject: {
    backgroundColor: T.surfaceRaised,
    borderWidth: 1,
    borderColor: T.border,
  },
  hitlBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  hitlDecision: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hitlDecisionText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Subagent Progress ──
  subagentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  subagentSpinner: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subagentLabel: {
    fontSize: 12,
    color: T.textSecondary,
    flex: 1,
  },
});
