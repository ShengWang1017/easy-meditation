import type { BreathingMethod, SessionSnapshot } from '@easy-meditation/shared';
import { getSessionSnapshot } from '@easy-meditation/shared';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'completed';

export type SessionVisualTiming = {
  phaseKey: string;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  ambientElapsedMs: number;
};

export type SessionClockSnapshot = {
  status: SessionStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: SessionSnapshot;
  visual: SessionVisualTiming;
};

export type SessionClock = {
  start: () => void;
  pause: () => void;
  resume: () => void;
  freeze: () => SessionClockSnapshot;
  snapshot: () => SessionClockSnapshot;
};

export function resolveSessionVisualTiming(
  method: BreathingMethod,
  elapsedMilliseconds: number,
  status: SessionStatus
): SessionVisualTiming {
  const ambientElapsedMs = Math.max(0, elapsedMilliseconds);
  const phaseDurationsMs = method.phases.map((phase) =>
    Math.max(1_000, phase.durationSeconds * 1_000)
  );
  const fallbackDurationMs = phaseDurationsMs[0] ?? 1_000;

  if (status === 'idle') {
    return {
      phaseKey: 'idle',
      phaseElapsedMs: 0,
      phaseDurationMs: fallbackDurationMs,
      ambientElapsedMs: 0
    };
  }

  if (status === 'completed') {
    return {
      phaseKey: 'completed',
      phaseElapsedMs: 0,
      phaseDurationMs: phaseDurationsMs.at(-1) ?? fallbackDurationMs,
      ambientElapsedMs
    };
  }

  const cycleDurationMs = Math.max(
    1_000,
    phaseDurationsMs.reduce((total, durationMs) => total + durationMs, 0)
  );
  const cycleIndex = Math.floor(ambientElapsedMs / cycleDurationMs);
  let cycleElapsedMs = ambientElapsedMs - cycleIndex * cycleDurationMs;
  let phaseIndex = 0;

  for (let index = 0; index < phaseDurationsMs.length; index += 1) {
    const durationMs = phaseDurationsMs[index] ?? fallbackDurationMs;
    if (cycleElapsedMs < durationMs) {
      phaseIndex = index;
      break;
    }
    cycleElapsedMs -= durationMs;
  }

  return {
    phaseKey: `${cycleIndex}:${phaseIndex}`,
    phaseElapsedMs: cycleElapsedMs,
    phaseDurationMs: phaseDurationsMs[phaseIndex] ?? fallbackDurationMs,
    ambientElapsedMs
  };
}

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

  function buildSnapshot(elapsedMilliseconds: number): SessionClockSnapshot {
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1_000);
    const phase = getSessionSnapshot(method, elapsedSeconds, durationSeconds);

    return {
      status,
      elapsedSeconds,
      remainingSeconds: phase.remainingInSession,
      phase,
      visual: resolveSessionVisualTiming(method, elapsedMilliseconds, status)
    };
  }

  function snapshot(): SessionClockSnapshot {
    const elapsedMilliseconds = Math.min(durationMs, getElapsedMilliseconds());
    if (status === 'running' && elapsedMilliseconds >= durationMs) {
      status = 'completed';
      elapsedBeforeRunMs = durationMs;
      return buildSnapshot(durationMs);
    }
    return buildSnapshot(elapsedMilliseconds);
  }

  function stopRunning(): SessionClockSnapshot {
    const elapsedMilliseconds = Math.min(durationMs, getElapsedMilliseconds());
    if (elapsedMilliseconds >= durationMs) {
      elapsedBeforeRunMs = durationMs;
      status = 'completed';
    } else {
      elapsedBeforeRunMs = elapsedMilliseconds;
      status = 'paused';
    }
    return buildSnapshot(elapsedBeforeRunMs);
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

      stopRunning();
    },
    resume() {
      if (status !== 'paused') {
        return;
      }

      status = 'running';
      startedAt = now();
    },
    freeze() {
      if (status === 'running') {
        return stopRunning();
      }
      return snapshot();
    },
    snapshot
  };
}
