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

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, amount: number): number {
  'worklet';
  if (amount === 0) return start;
  if (amount === 1) return end;
  return start + (end - start) * amount;
}

export function smootherstep(value: number): number {
  'worklet';
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
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

export function getBreathMotion(
  kind: BreathVisualKind,
  progress: number,
  visualTimeMs: number,
  reducedMotion = false
): BreathMotion {
  'worklet';
  const wave = Math.sin(visualTimeMs / 820);
  const slowWave = Math.sin(visualTimeMs / 1_450);
  const envelope = smootherstep(progress);
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
    motion = {
      scale: lerp(0.7, 1.08, envelope),
      bloom: lerp(0.54, 0.88, envelope),
      rotate: lerp(-0.13, 0.04, envelope),
      lift: lerp(12, -4, envelope),
      orbit: lerp(0.24, 0.52, envelope)
    };
  } else if (kind === 'hold-full') {
    const pulse = Math.sin(smootherstep(progress) * Math.PI) ** 2;
    motion = {
      scale: 1.08 * (1 + 0.015 * pulse),
      bloom: 0.88 + pulse * 0.02,
      rotate: 0.04 + slowWave * 0.024 * pulse,
      lift: -4 + wave * 3.2 * pulse,
      orbit: 0.52 + pulse * 0.16
    };
  } else if (kind === 'hold-empty') {
    const pulse = Math.sin(smootherstep(progress) * Math.PI) ** 2;
    motion = {
      scale: 0.7 * (1 + 0.01 * pulse),
      bloom: 0.54 + pulse * 0.02,
      rotate: -0.13 + slowWave * 0.018 * pulse,
      lift: 12 + wave * 2 * pulse,
      orbit: 0.24 + pulse * 0.06
    };
  } else if (kind === 'exhale') {
    motion = {
      scale: lerp(1.08, 0.7, envelope),
      bloom: lerp(0.88, 0.54, envelope),
      rotate: lerp(0.04, -0.13, envelope),
      lift: lerp(-4, 12, envelope),
      orbit: lerp(0.52, 0.24, envelope)
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

export function buildOrganicBlobPoints(options: OrganicBlobOptions): OrganicBlobPoint[] {
  'worklet';
  return Array.from({ length: options.points }, (_, index) => {
    const angle = (index / options.points) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + options.time + options.seed) * 0.52 +
      Math.sin(angle * 5 - options.time * 0.68 + options.seed * 1.7) * 0.31 +
      Math.sin(angle * 7 + options.time * 0.37 + options.seed * 0.8) * 0.17;
    const localRadius = options.radius * (1 + noise * options.amp);
    return {
      x: options.cx + Math.cos(angle) * localRadius * (options.scaleX ?? 1),
      y: options.cy + Math.sin(angle) * localRadius * (options.scaleY ?? 1)
    };
  });
}
