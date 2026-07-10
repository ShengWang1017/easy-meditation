import type { BreathingPhase } from '@easy-meditation/shared';

import type { BuiltInMethodId } from './methodPresentation';
import type { LocalSessionLedgerEntry } from './sessionLedger';

export type ResolvedSessionMethod = {
  id: BuiltInMethodId | 'custom';
  title: string;
  phases: BreathingPhase[];
  plannedDurationSeconds: number;
  origin: 'built_in' | 'custom';
};

export function buildSessionLedgerEntry(options: {
  clientSessionId: string;
  method: ResolvedSessionMethod;
  actualDurationSeconds: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}): LocalSessionLedgerEntry | null {
  const actualDurationSeconds = Math.floor(options.actualDurationSeconds);
  if (!Number.isFinite(actualDurationSeconds) || actualDurationSeconds < 1) {
    return null;
  }

  const input = {
    clientSessionId: options.clientSessionId,
    methodType: options.method.origin === 'built_in' ? ('built_in' as const) : ('custom' as const),
    methodId: options.method.origin === 'built_in' ? options.method.id : null,
    customRhythmId: null,
    methodTitleSnapshot: options.method.title,
    rhythmSnapshot: options.method.phases.map((phase) => ({ ...phase })),
    plannedDurationSeconds: options.method.plannedDurationSeconds,
    actualDurationSeconds,
    completed: options.completed,
    startedAt: options.startedAt,
    endedAt: options.endedAt
  };

  if (options.method.origin === 'custom') {
    return {
      ...input,
      methodType: 'custom',
      methodId: null,
      origin: 'custom',
      state: 'local-only'
    };
  }

  return {
    ...input,
    methodType: 'built_in',
    methodId: options.method.id,
    origin: 'built_in',
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: options.endedAt,
    lastErrorCode: null
  };
}
