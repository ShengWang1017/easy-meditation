import type { BreathingPhase } from '@easy-meditation/shared';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BREATH_TEXTURE,
  buildOrganicBlobPoints,
  getBreathMotion,
  getBreathTimelineProgress,
  getBreathTransitionMs,
  mixBreathMotion,
  resolveBreathVisualKind,
  smootherstep
} from './breathMotion';

const boxPhases: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 }
];

describe('resolveBreathVisualKind', () => {
  it('resolves a hold after inhale as hold-full', () => {
    expect(resolveBreathVisualKind(boxPhases, 1, 'hold')).toBe('hold-full');
  });

  it('resolves a hold after exhale as hold-empty', () => {
    expect(resolveBreathVisualKind(boxPhases, 3, 'hold')).toBe('hold-empty');
  });

  it('preserves inhale, exhale, and complete kinds', () => {
    expect(resolveBreathVisualKind(boxPhases, 0, 'inhale')).toBe('inhale');
    expect(resolveBreathVisualKind(boxPhases, 2, 'exhale')).toBe('exhale');
    expect(resolveBreathVisualKind(boxPhases, 3, 'complete')).toBe('complete');
  });
});

describe('getBreathMotion', () => {
  it('uses the exact smootherstep envelope', () => {
    expect(smootherstep(-1)).toBe(0);
    expect(smootherstep(0.25)).toBe(0.103515625);
    expect(smootherstep(0.5)).toBe(0.5);
    expect(smootherstep(0.75)).toBe(0.896484375);
    expect(smootherstep(2)).toBe(1);
  });

  it.each([0, 1_234, 9_876])(
    'keeps inhale and exhale endpoints exact at ambient time %s',
    (ambientTimeMs) => {
      expect(getBreathMotion('inhale', 0, ambientTimeMs).scale).toBe(0.7);
      expect(getBreathMotion('inhale', 1, ambientTimeMs).scale).toBe(1.08);
      expect(getBreathMotion('exhale', 0, ambientTimeMs).scale).toBe(1.08);
      expect(getBreathMotion('exhale', 1, ambientTimeMs).scale).toBe(0.7);
    }
  );

  it('keeps hold micro-swell inside the approved percentages', () => {
    const full = Array.from({ length: 121 }, (_, index) =>
      getBreathMotion('hold-full', index / 120, index * 16.67).scale
    );
    const empty = Array.from({ length: 121 }, (_, index) =>
      getBreathMotion('hold-empty', index / 120, index * 16.67).scale
    );
    expect(Math.max(...full)).toBeLessThanOrEqual(1.08 * 1.015);
    expect(Math.max(...empty)).toBeLessThanOrEqual(0.7 * 1.01);
  });

  it('matches the exact inhale endpoints from the Web renderer', () => {
    expect(getBreathMotion('inhale', 0, 0)).toEqual({
      scale: 0.7,
      bloom: 0.54,
      rotate: -0.13,
      lift: 12,
      orbit: 0.24
    });
    expect(getBreathMotion('inhale', 1, 0)).toEqual({
      scale: 1.08,
      bloom: 0.88,
      rotate: 0.04,
      lift: -4,
      orbit: 0.52
    });
  });

  it('is deterministic for the same progress and visual time', () => {
    expect(getBreathMotion('hold-full', 0.42, 1_234)).toEqual(
      getBreathMotion('hold-full', 0.42, 1_234)
    );
    expect(getBreathMotion('complete', 0.73, 9_876)).toEqual(
      getBreathMotion('complete', 0.73, 9_876)
    );
  });

  it('keeps reduced-motion phase displacement at 35 percent', () => {
    const normalStart = getBreathMotion('inhale', 0, 0);
    const normalEnd = getBreathMotion('inhale', 1, 0);
    const reducedStart = getBreathMotion('inhale', 0, 0, true);
    const reducedEnd = getBreathMotion('inhale', 1, 0, true);

    for (const key of ['scale', 'bloom', 'rotate', 'lift', 'orbit'] as const) {
      expect(reducedEnd[key] - reducedStart[key]).toBeCloseTo(
        (normalEnd[key] - normalStart[key]) * 0.35,
        8
      );
    }
  });

  it('declares worklet dependencies before getBreathMotion', () => {
    const source = readFileSync(
      `${process.cwd()}/src/domain/breathMotion.ts`,
      'utf8'
    );
    const motionWorklet = source.indexOf('export function getBreathMotion(');

    expect(motionWorklet).toBeGreaterThanOrEqual(0);
    for (const dependency of [
      'function clamp01(',
      'function lerp(',
      'export function smootherstep(',
      'export function mixBreathMotion('
    ]) {
      const dependencyIndex = source.indexOf(dependency);
      expect(dependencyIndex).toBeGreaterThanOrEqual(0);
      expect(dependencyIndex).toBeLessThan(motionWorklet);
    }
    expect(source).not.toContain('function easeInOutCubic(');
  });
});

describe('motion transitions and timing', () => {
  it('mixes every motion field deterministically', () => {
    expect(
      mixBreathMotion(
        { scale: 0.7, bloom: 0.54, rotate: -0.13, lift: 12, orbit: 0.24 },
        { scale: 1.08, bloom: 0.88, rotate: 0.04, lift: -4, orbit: 0.52 },
        0.5
      )
    ).toEqual({
      scale: 0.89,
      bloom: 0.71,
      rotate: -0.045,
      lift: 4,
      orbit: 0.38
    });
  });

  it('uses 260ms normally and 520ms for reduced motion', () => {
    expect(getBreathTransitionMs(false)).toBe(260);
    expect(getBreathTransitionMs(true)).toBe(520);
  });

  it('freezes paused progress while allowing ambient loops', () => {
    expect(
      getBreathTimelineProgress(
        {
          startedAtMs: 100,
          durationMs: 1_000,
          running: false,
          loop: false,
          frozenProgress: 0.42
        },
        900
      )
    ).toBe(0.42);
    expect(
      getBreathTimelineProgress(
        {
          startedAtMs: 100,
          durationMs: 1_000,
          running: false,
          loop: true,
          frozenProgress: 0
        },
        1_350
      )
    ).toBe(0.25);
  });
});

describe('organic geometry and texture', () => {
  it('ports the first and last organic points exactly', () => {
    const points = buildOrganicBlobPoints({
      cx: 320,
      cy: 320,
      radius: 100,
      points: 4,
      amp: 0.1,
      time: 0,
      seed: 0,
      scaleX: 1.2,
      scaleY: 0.8
    });

    expect(points).toHaveLength(4);
    expect(points[0]?.x).toBeCloseTo(440, 8);
    expect(points[0]?.y).toBeCloseTo(320, 8);
    expect(points[3]?.x).toBeCloseTo(320, 8);
    expect(points[3]?.y).toBeCloseTo(236.96, 8);
  });

  it('keeps coherent topology calm frame-to-frame while evolving over 15 seconds', () => {
    const options = {
      cx: 0,
      cy: 0,
      radius: 100,
      points: 42,
      amp: 0.075,
      seed: 1.2
    };
    const first = buildOrganicBlobPoints({ ...options, time: 0 });
    const nextFrame = buildOrganicBlobPoints({
      ...options,
      time: (1 / 60) * 0.4
    });
    const after15Seconds = buildOrganicBlobPoints({
      ...options,
      time: 15 * 0.4
    });
    const maximumAdjacentDelta = Math.max(
      ...first.map((point, index) =>
        Math.hypot(
          point.x - nextFrame[index]!.x,
          point.y - nextFrame[index]!.y
        )
      )
    );

    expect(first).toHaveLength(42);
    expect(nextFrame).toHaveLength(42);
    expect(after15Seconds).toHaveLength(42);
    expect(maximumAdjacentDelta).toBeLessThan(0.5);
    expect(after15Seconds).not.toEqual(first);
  });

  it('creates the exact 42 deterministic Web texture particles', () => {
    expect(BREATH_TEXTURE).toHaveLength(42);
    expect(BREATH_TEXTURE[0]).toEqual({
      angle: 0,
      distance: 0.08,
      size: 4,
      alpha: 0.015,
      drift: 0.4
    });
    expect(BREATH_TEXTURE[41]?.angle).toBeCloseTo(66.338, 10);
    expect(BREATH_TEXTURE[41]?.distance).toBeCloseTo(0.2194, 10);
    expect(BREATH_TEXTURE[41]?.size).toBe(35);
    expect(BREATH_TEXTURE[41]?.alpha).toBeCloseTo(0.0322, 10);
    expect(BREATH_TEXTURE[41]?.drift).toBeCloseTo(1.468, 10);
  });
});
