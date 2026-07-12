import { describe, expect, it } from 'vitest';
import { getBreathMotion } from './breathMotion';
import {
  resolveBreathingCanvasSize,
  resolveLogicalCoreRadius
} from './breathRenderGeometry';

function maximumRadiusDelta(durationMs: number, kind: 'inhale' | 'exhale') {
  const canvasSize = resolveBreathingCanvasSize(412);
  const samples = Array.from(
    { length: Math.ceil(durationMs / (1_000 / 60)) + 1 },
    (_, index) => {
      const elapsedMs = Math.min(durationMs, index * (1_000 / 60));
      const scale = getBreathMotion(kind, elapsedMs / durationMs, elapsedMs).scale;
      return resolveLogicalCoreRadius(canvasSize, scale);
    }
  );
  return Math.max(
    ...samples.slice(1).map((radius, index) =>
      Math.abs(radius - samples[index]!)
    )
  );
}

describe('breath render geometry', () => {
  it('resolves the approved viewport Canvas sizes and cap', () => {
    expect(resolveBreathingCanvasSize(411)).toBeCloseTo(320.58, 8);
    expect(resolveBreathingCanvasSize(412)).toBeCloseTo(321.36, 8);
    expect(resolveBreathingCanvasSize(500)).toBe(342);
  });

  it('meets default and one-second 60Hz logical-radius gates', () => {
    expect(maximumRadiusDelta(4_000, 'inhale')).toBeLessThanOrEqual(1);
    expect(maximumRadiusDelta(4_000, 'exhale')).toBeLessThanOrEqual(1);
    expect(maximumRadiusDelta(1_000, 'inhale')).toBeLessThanOrEqual(1.5);
    expect(maximumRadiusDelta(1_000, 'exhale')).toBeLessThanOrEqual(1.5);
  });
});
