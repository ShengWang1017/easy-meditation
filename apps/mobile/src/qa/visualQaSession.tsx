import {
  createContext,
  useContext,
  type PropsWithChildren
} from 'react';
import type { BreathingPhase } from '@easy-meditation/shared';

import type { FocusSessionController } from '../hooks/useFocusSession';
import type { VisualQaSessionSnapshot } from './visualQa';

export type VisualQaSessionOverride = {
  controller: FocusSessionController;
  fixtureVisualTimeMs: number;
};

const VisualQaSessionOverrideContext =
  createContext<VisualQaSessionOverride | null>(null);

export function VisualQaSessionOverrideProvider({
  children,
  value
}: PropsWithChildren<{ value: VisualQaSessionOverride | null }>) {
  return (
    <VisualQaSessionOverrideContext.Provider value={value}>
      {children}
    </VisualQaSessionOverrideContext.Provider>
  );
}

export function useVisualQaSessionOverride(): VisualQaSessionOverride | null {
  return useContext(VisualQaSessionOverrideContext);
}

export function createVisualQaSessionOverride({
  snapshot,
  phases
}: {
  snapshot: VisualQaSessionSnapshot;
  phases: BreathingPhase[];
}): VisualQaSessionOverride {
  const phaseIndex = resolvePhaseIndex(phases, snapshot);
  const phase = phases[phaseIndex];
  const isComplete = snapshot.status === 'completed';
  const remainingInPhase = isComplete
    ? 0
    : Math.max(
        0,
        Math.ceil(
          (phase?.durationSeconds ?? 0) * (1 - snapshot.phaseProgress)
        )
      );
  const fixedSnapshot = {
    status: snapshot.status,
    elapsedSeconds: snapshot.elapsedSeconds,
    remainingSeconds: snapshot.remainingSeconds,
    phase: {
      kind: snapshot.phaseKind,
      label: isComplete ? '完成' : (phase?.label ?? snapshot.phaseKind),
      phaseIndex,
      phaseProgress: snapshot.phaseProgress,
      remainingInPhase,
      remainingInSession: snapshot.remainingSeconds,
      elapsedSeconds: snapshot.elapsedSeconds,
      isComplete
    }
  } as const;
  const noOp = () => undefined;
  const noOpAsync = async () => undefined;

  return {
    fixtureVisualTimeMs:
      snapshot.status === 'idle' || snapshot.status === 'completed'
        ? 0
        : Math.round(
            snapshot.phaseProgress * (phase?.durationSeconds ?? 0) * 1_000
          ),
    controller: {
      snapshot: fixedSnapshot,
      clientSessionId: 'visual-qa-session',
      isPersisting: false,
      persistenceError: null,
      controlsUnlocked: true,
      start: noOp,
      pause: noOp,
      resume: noOp,
      persistIntentionalEnd: noOpAsync,
      retryPersistence: noOpAsync,
      replay: noOpAsync
    }
  };
}

function resolvePhaseIndex(
  phases: BreathingPhase[],
  snapshot: VisualQaSessionSnapshot
): number {
  if (snapshot.status === 'completed') {
    return Math.max(0, phases.length - 1);
  }
  const cycleSeconds = phases.reduce(
    (total, phase) => total + phase.durationSeconds,
    0
  );
  let cycleElapsed = snapshot.elapsedSeconds % Math.max(1, cycleSeconds);
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (!phase) continue;
    if (cycleElapsed < phase.durationSeconds) return index;
    cycleElapsed -= phase.durationSeconds;
  }
  return 0;
}
