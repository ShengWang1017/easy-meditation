import type { BreathingPhase, SessionSnapshot } from '@easy-meditation/shared';

export type BreathVisualKind =
  | 'ready'
  | 'inhale'
  | 'hold-full'
  | 'hold-empty'
  | 'exhale'
  | 'complete';

export type BreathMotion = {
  scale: number;
  bloom: number;
  rotate: number;
  lift: number;
  orbit: number;
};

export type BreathTimeline = {
  startedAtMs: number;
  durationMs: number;
  running: boolean;
  loop: boolean;
  frozenProgress: number;
};

export type OrganicBlobPoint = { x: number; y: number };

export type OrganicBlobOptions = {
  cx: number;
  cy: number;
  radius: number;
  points: number;
  amp: number;
  time: number;
  seed: number;
  scaleX?: number;
  scaleY?: number;
};

export type BreathTextureParticle = {
  angle: number;
  distance: number;
  size: number;
  alpha: number;
  drift: number;
};

export const BREATH_TEXTURE: BreathTextureParticle[] = Array.from(
  { length: 42 },
  (_, index) => ({
    angle: index * 1.618,
    distance: 0.08 + (((index * 37) % 100) / 100) * 0.82,
    size: 4 + ((index * 19) % 34),
    alpha: 0.015 + (((index * 23) % 100) / 100) * 0.04,
    drift: 0.4 + (((index * 29) % 100) / 100) * 1.2
  })
);

const REDUCED_MOTION_NEUTRAL: BreathMotion = {
  scale: 0.89,
  bloom: 0.71,
  rotate: -0.045,
  lift: 4,
  orbit: 0.38
};

export function resolveBreathVisualKind(
  phases: BreathingPhase[],
  phaseIndex: number,
  kind: SessionSnapshot['kind']
): BreathVisualKind {
  'worklet';
  if (kind !== 'hold') return kind;
  const previousIndex = (phaseIndex - 1 + phases.length) % phases.length;
  return phases[previousIndex]?.kind === 'exhale' ? 'hold-empty' : 'hold-full';
}

export function getBreathMotion(
  kind: BreathVisualKind,
  progress: number,
  visualTimeMs: number,
  reducedMotion = false
): BreathMotion {
  'worklet';
  const wave = Math.sin(visualTimeMs / 820);
  const slowWave = Math.sin(visualTimeMs / 1_450);
  let motion: BreathMotion;

  if (kind === 'ready') {
    motion = {
      scale: 0.7,
      bloom: 0.54,
      rotate: -0.13,
      lift: 12,
      orbit: 0.24
    };
  } else if (kind === 'inhale') {
    const clampedProgress = clamp01(progress);
    if (clampedProgress === 0) {
      motion = { scale: 0.7, bloom: 0.54, rotate: -0.13, lift: 12, orbit: 0.24 };
    } else if (clampedProgress === 1) {
      motion = { scale: 1.08, bloom: 0.88, rotate: 0.04, lift: -4, orbit: 0.52 };
    } else {
      const t = easeInOutCubic(clampedProgress);
      const endpointGuard = Math.sin(clampedProgress * Math.PI);
      motion = {
        scale: lerp(0.7, 1.08, t) + wave * 0.006 * endpointGuard,
        bloom: lerp(0.54, 0.88, t),
        rotate: lerp(-0.13, 0.04, t) + slowWave * 0.014 * endpointGuard,
        lift: lerp(12, -4, t),
        orbit: lerp(0.24, 0.52, t)
      };
    }
  } else if (kind === 'hold-full') {
    const swell = Math.sin(clamp01(progress) * Math.PI);
    motion = {
      scale: 1.08 + swell * 0.018,
      bloom: 0.88 + swell * 0.02,
      rotate: 0.04 + slowWave * 0.024 * swell,
      lift: -4 + wave * 3.2 * swell,
      orbit: 0.52 + swell * 0.16
    };
  } else if (kind === 'hold-empty') {
    const stillness = Math.sin(clamp01(progress) * Math.PI);
    motion = {
      scale: 0.7 + stillness * 0.014,
      bloom: 0.54 + stillness * 0.02,
      rotate: -0.13 + slowWave * 0.018 * stillness,
      lift: 12 + wave * 2 * stillness,
      orbit: 0.24 + stillness * 0.06
    };
  } else if (kind === 'exhale') {
    const t = easeInOutCubic(progress);
    motion = {
      scale: lerp(1.08, 0.7, t) + wave * 0.004,
      bloom: lerp(0.88, 0.54, t),
      rotate:
        lerp(0.04, -0.13, t) +
        slowWave * 0.012 * Math.sin(clamp01(progress) * Math.PI),
      lift: lerp(-4, 12, t),
      orbit: lerp(0.52, 0.24, t)
    };
  } else {
    motion = {
      scale: 0.84 + Math.sin(clamp01(progress) * Math.PI * 2) * 0.018,
      bloom: 0.62,
      rotate: slowWave * 0.02,
      lift: 7 + wave * 1.8,
      orbit: 0.3
    };
  }

  return reducedMotion
    ? mixBreathMotion(REDUCED_MOTION_NEUTRAL, motion, 0.35)
    : motion;
}

export function mixBreathMotion(
  from: BreathMotion,
  to: BreathMotion,
  amount: number
): BreathMotion {
  'worklet';
  const t = clamp01(amount);
  return {
    scale: lerp(from.scale, to.scale, t),
    bloom: lerp(from.bloom, to.bloom, t),
    rotate: lerp(from.rotate, to.rotate, t),
    lift: lerp(from.lift, to.lift, t),
    orbit: lerp(from.orbit, to.orbit, t)
  };
}

export function getBreathTransitionMs(reducedMotion: boolean): number {
  'worklet';
  return reducedMotion ? 520 : 260;
}

export function getBreathTimelineProgress(timeline: BreathTimeline, nowMs: number): number {
  'worklet';
  if (!timeline.running && !timeline.loop) return clamp01(timeline.frozenProgress);
  const durationMs = Math.max(1, timeline.durationMs);
  const rawProgress = timeline.loop
    ? ((nowMs - timeline.startedAtMs) % durationMs) / durationMs
    : clamp01((nowMs - timeline.startedAtMs) / durationMs);
  return rawProgress < 0 ? rawProgress + 1 : rawProgress;
}

export function buildOrganicBlobPoints(options: OrganicBlobOptions): OrganicBlobPoint[] {
  'worklet';
  return Array.from({ length: options.points }, (_, index) => {
    const angle = (index / options.points) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + options.time + options.seed) * 0.55 +
      Math.sin(angle * 5 - options.time * 1.21 + options.seed * 1.7) * 0.32 +
      Math.sin(angle * 7 + options.time * 0.72 + options.seed * 0.8) * 0.13;
    const localRadius = options.radius * (1 + noise * options.amp);
    return {
      x: options.cx + Math.cos(angle) * localRadius * (options.scaleX ?? 1),
      y: options.cy + Math.sin(angle) * localRadius * (options.scaleY ?? 1)
    };
  });
}

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, amount: number): number {
  'worklet';
  return start + (end - start) * amount;
}

function easeInOutCubic(value: number): number {
  'worklet';
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
