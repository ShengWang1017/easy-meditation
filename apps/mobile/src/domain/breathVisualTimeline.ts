import type { BreathVisualKind } from './breathMotion';
import type { SessionStatus, SessionVisualTiming } from './sessionClock';

export const BREATH_REANCHOR_TOLERANCE_MS = 100;
export const BREATH_CORRECTION_MS = 300;

export type BreathVisualInput = SessionVisualTiming & {
  kind: BreathVisualKind;
  status: SessionStatus;
  reducedMotion: boolean;
};

export type BreathVisualAnchor = BreathVisualInput & {
  visualCapturedAtMs: number;
  frameActive: boolean;
};

export type BreathVisualProjection = {
  kind: BreathVisualKind;
  phaseElapsedMs: number;
  phaseProgress: number;
  ambientTimeMs: number;
};

export type BreathVisualReconciliation = {
  directive: 'retain' | 'freeze' | 'correct' | 'reject';
  anchor: BreathVisualAnchor;
};

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function positiveModulo(value: number, divisor: number): number {
  'worklet';
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

export function easeOutCubic(value: number): number {
  'worklet';
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function createBreathVisualAnchor(
  input: BreathVisualInput,
  visualCapturedAtMs: number
): BreathVisualAnchor | null {
  'worklet';
  if (
    input.phaseKey.length === 0 ||
    !Number.isFinite(visualCapturedAtMs) ||
    !Number.isFinite(input.phaseElapsedMs) ||
    !Number.isFinite(input.phaseDurationMs) ||
    !Number.isFinite(input.ambientElapsedMs)
  ) {
    return null;
  }
  const phaseDurationMs = Math.max(1_000, input.phaseDurationMs);
  return {
    ...input,
    phaseElapsedMs: Math.max(0, Math.min(phaseDurationMs, input.phaseElapsedMs)),
    phaseDurationMs,
    ambientElapsedMs: Math.max(0, input.ambientElapsedMs),
    visualCapturedAtMs,
    frameActive: true
  };
}

export function projectBreathVisualAnchor(
  anchor: BreathVisualAnchor,
  frameTimeMs: number
): BreathVisualProjection {
  'worklet';
  const safeFrameTimeMs = Number.isFinite(frameTimeMs)
    ? Math.max(anchor.visualCapturedAtMs, frameTimeMs)
    : anchor.visualCapturedAtMs;
  const activeElapsedMs = safeFrameTimeMs - anchor.visualCapturedAtMs;
  const loop = anchor.status === 'idle' || anchor.status === 'completed';
  const phaseAdvances =
    anchor.frameActive && (anchor.status === 'running' || loop);
  const rawPhaseElapsedMs =
    anchor.phaseElapsedMs + (phaseAdvances ? activeElapsedMs : 0);
  const phaseElapsedMs = loop
    ? positiveModulo(rawPhaseElapsedMs, anchor.phaseDurationMs)
    : Math.max(0, Math.min(anchor.phaseDurationMs, rawPhaseElapsedMs));
  const ambientAdvances =
    anchor.frameActive && anchor.status !== 'paused' && !anchor.reducedMotion;

  return {
    kind: anchor.kind,
    phaseElapsedMs,
    phaseProgress: clamp01(phaseElapsedMs / anchor.phaseDurationMs),
    ambientTimeMs:
      anchor.ambientElapsedMs + (ambientAdvances ? activeElapsedMs : 0)
  };
}

export function reconcileBreathVisualAnchor(
  current: BreathVisualAnchor,
  next: BreathVisualInput,
  frameTimeMs: number
): BreathVisualReconciliation {
  'worklet';
  const projected = projectBreathVisualAnchor(current, frameTimeMs);
  const candidate = createBreathVisualAnchor(next, frameTimeMs);
  if (!candidate) return { directive: 'reject', anchor: current };

  const sameIdentity =
    current.frameActive &&
    current.phaseKey === next.phaseKey &&
    current.kind === next.kind &&
    current.status === next.status &&
    current.reducedMotion === next.reducedMotion;
  const timingErrorMs = Math.abs(next.phaseElapsedMs - projected.phaseElapsedMs);
  if (sameIdentity && timingErrorMs <= BREATH_REANCHOR_TOLERANCE_MS) {
    return { directive: 'retain', anchor: current };
  }

  if (next.status === 'paused') {
    return {
      directive: 'freeze',
      anchor: {
        ...candidate,
        phaseElapsedMs: projected.phaseElapsedMs,
        ambientElapsedMs: projected.ambientTimeMs
      }
    };
  }

  return {
    directive: 'correct',
    anchor: {
      ...candidate,
      ambientElapsedMs: projected.ambientTimeMs
    }
  };
}

export function freezeBreathVisualClock(
  anchor: BreathVisualAnchor,
  frameTimeMs: number
): BreathVisualAnchor {
  'worklet';
  const visible = projectBreathVisualAnchor(anchor, frameTimeMs);
  return {
    ...anchor,
    phaseElapsedMs: visible.phaseElapsedMs,
    ambientElapsedMs: visible.ambientTimeMs,
    visualCapturedAtMs: frameTimeMs,
    frameActive: false
  };
}

export function reanchorBreathVisualClock(
  anchor: BreathVisualAnchor,
  previousFrameTimeMs: number,
  nextFrameTimeMs: number
): BreathVisualAnchor {
  'worklet';
  const visible = projectBreathVisualAnchor(anchor, previousFrameTimeMs);
  return {
    ...anchor,
    phaseElapsedMs: visible.phaseElapsedMs,
    ambientElapsedMs: visible.ambientTimeMs,
    visualCapturedAtMs: nextFrameTimeMs
  };
}

export function getBreathCorrectionAmount(
  frameTimeMs: number,
  correctionStartedAtMs: number
): number {
  'worklet';
  return easeOutCubic(
    (frameTimeMs - correctionStartedAtMs) / BREATH_CORRECTION_MS
  );
}
