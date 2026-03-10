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

import CanvasCard from '@/components/resilience/canvas-card';
import ShockTimelineCard from '@/components/resilience/shock-timeline-card';
import type {
  CanvasData,
  ChatMessage,
  MessagePart,
  ShockData,
  ThinkingStep,
} from '@/hooks/use-resilience-stream';

// ─── Theme (mirrors page) ────────────────────────────────────────────────────
const T = {
  bg: '#060D1A',
  surface: '#0D1826',
  surfaceRaised: '#111F33',
  border: 'rgba(79,142,247,0.12)',
  accent: '#4F8EF7',
  green: '#0FB67C',
  amber: '#F5A623',
  red: '#FF4757',
  text: '#E8EEFF',
  textSecondary: '#7A90B5',
  textMuted: '#4A6080',
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
      return <Text style={styles.agentText}>{part.content}</Text>;

    case 'thinking':
      return <ThinkingBlock steps={part.steps} collapsed={part.collapsed} />;

    case 'tool_result': {
      const data = part.data;
      if (!data) return null;

      // Shock timeline
      if (data.card === 'shock') {
        return <ShockTimelineCard data={data as ShockData} />;
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
