import type { BreathingMethod, SessionSnapshot } from '@easy-meditation/shared';
import { getSessionSnapshot } from '@easy-meditation/shared';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed';

export type SessionClockSnapshot = {
  status: SessionStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: SessionSnapshot;
};

export type SessionClock = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  freeze: () => SessionClockSnapshot;
  snapshot: () => SessionClockSnapshot;
};

export function createSessionClock(
  method: BreathingMethod,
  durationSeconds: number,
  now: () => number = () => Date.now()
): SessionClock {
  let status: SessionStatus = 'idle';
  let elapsedBeforeRunMs = 0;
  let startedAt = 0;
  const durationMs = Math.max(1, durationSeconds) * 1_000;

  function getElapsedMilliseconds() {
    if (status !== 'running') {
      return elapsedBeforeRunMs;
    }

    return elapsedBeforeRunMs + Math.max(0, now() - startedAt);
  }

  function snapshot(): SessionClockSnapshot {
    const elapsedMilliseconds = Math.min(durationMs, getElapsedMilliseconds());
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1_000);
    const phase = getSessionSnapshot(method, elapsedSeconds, durationSeconds);

    if (phase.isComplete && status === 'running') {
      status = 'completed';
      elapsedBeforeRunMs = durationMs;
    }

    return {
      status,
      elapsedSeconds,
      remainingSeconds: phase.remainingInSession,
      phase
    };
  }

  return {
    start() {
      if (status !== 'idle') {
        return;
      }

      status = 'running';
      startedAt = now();
    },
    pause() {
      if (status !== 'running') {
        return;
      }

      elapsedBeforeRunMs = Math.min(durationMs, getElapsedMilliseconds());
      status = 'paused';
    },
    resume() {
      if (status !== 'paused') {
        return;
      }

      status = 'running';
      startedAt = now();
    },
    freeze() {
      const current = snapshot();
      if (status === 'running') {
        elapsedBeforeRunMs = Math.min(durationMs, getElapsedMilliseconds());
        status = 'paused';
        return snapshot();
      }
      return current;
    },
    snapshot
  };
}
