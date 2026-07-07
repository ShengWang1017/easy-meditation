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
  snapshot: () => SessionClockSnapshot;
};

export function createSessionClock(
  method: BreathingMethod,
  durationSeconds: number,
  now: () => number = () => Date.now()
): SessionClock {
  let status: SessionStatus = 'idle';
  let elapsedBeforeRun = 0;
  let startedAt = 0;

  function getElapsedSeconds() {
    if (status !== 'running') {
      return elapsedBeforeRun;
    }

    return elapsedBeforeRun + Math.floor((now() - startedAt) / 1000);
  }

  function snapshot(): SessionClockSnapshot {
    const elapsedSeconds = Math.min(durationSeconds, getElapsedSeconds());
    const phase = getSessionSnapshot(method, elapsedSeconds, durationSeconds);

    if (phase.isComplete && status === 'running') {
      status = 'completed';
      elapsedBeforeRun = durationSeconds;
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

      elapsedBeforeRun = getElapsedSeconds();
      status = 'paused';
    },
    resume() {
      if (status !== 'paused') {
        return;
      }

      status = 'running';
      startedAt = now();
    },
    snapshot
  };
}
