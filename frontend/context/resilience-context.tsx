import React, { createContext, useContext } from 'react';
import {
  useResilienceStream as useResilienceStreamHook,
} from '@/hooks/use-resilience-stream';
import type {
  ChatMessage,
  SubagentStatus,
} from '@/hooks/use-resilience-stream';

type ResilienceContextValue = ReturnType<typeof useResilienceStreamHook>;

const ResilienceContext = createContext<ResilienceContextValue | null>(null);

export function ResilienceProvider({ children }: { children: React.ReactNode }) {
  const value = useResilienceStreamHook();
  return (
    <ResilienceContext.Provider value={value}>
      {children}
    </ResilienceContext.Provider>
  );
}

export function useResilience(): ResilienceContextValue {
  const ctx = useContext(ResilienceContext);
  if (!ctx) throw new Error('useResilience must be inside ResilienceProvider');
  return ctx;
}
