import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getBreathMotion, mixBreathMotion } from './breathMotion';
import {
  BREATH_CORRECTION_MS,
  createBreathVisualAnchor,
  freezeBreathVisualClock,
  getBreathCorrectionAmount,
  projectBreathVisualAnchor,
  reanchorBreathVisualClock,
  reconcileBreathVisualAnchor,
  type BreathVisualInput
} from './breathVisualTimeline';

const inhale: BreathVisualInput = {
  phaseKey: '0:0',
  kind: 'inhale',
  phaseElapsedMs: 0,
  phaseDurationMs: 4_000,
  ambientElapsedMs: 0,
  status: 'running',
  reducedMotion: false
};

function getExportedFunctionSource(source: string, name: string): string {
  const functionStart = source.indexOf(`export function ${name}(`);
  if (functionStart < 0) return '';
  const nextFunctionStart = source.indexOf(
    '\nexport function ',
    functionStart + 1
  );
  return source.slice(
    functionStart,
    nextFunctionStart < 0 ? source.length : nextFunctionStart
  );
}

describe('breath visual timeline', () => {
  it('projects continuous monotonic progress from absolute frame time', () => {
    const anchor = createBreathVisualAnchor(inhale, 1_000)!;
    const samples = Array.from({ length: 241 }, (_, index) =>
      projectBreathVisualAnchor(anchor, 1_000 + index * (1_000 / 60))
    );

    expect(samples[0]?.phaseProgress).toBe(0);
    expect(samples.at(-1)?.phaseProgress).toBe(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.phaseProgress).toBeGreaterThan(
        samples[index - 1]!.phaseProgress
      );
    }
  });

  it('keeps a same-phase refresh inside 100ms without resetting the anchor', () => {
    const anchor = createBreathVisualAnchor(inhale, 0)!;
    const result = reconcileBreathVisualAnchor(
      anchor,
      { ...inhale, phaseElapsedMs: 250 },
      250
    );
    expect(result.directive).toBe('retain');
    expect(result.anchor).toBe(anchor);
  });

  it('corrects a late new phase from the authoritative non-zero elapsed time', () => {
    const anchor = createBreathVisualAnchor(inhale, 0)!;
    const result = reconcileBreathVisualAnchor(
      anchor,
      {
        ...inhale,
        phaseKey: '0:1',
        kind: 'hold-full',
        phaseElapsedMs: 180,
        ambientElapsedMs: 4_180
      },
      4_180
    );
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(180);
    expect(result.anchor.ambientElapsedMs).toBe(4_180);
  });

  it('freezes pause and resumes from the exact visible phase and outline', () => {
    const running = createBreathVisualAnchor(inhale, 0)!;
    const paused = reconcileBreathVisualAnchor(
      running,
      { ...inhale, status: 'paused', phaseElapsedMs: 1_500 },
      1_500
    );
    expect(paused.directive).toBe('freeze');
    expect(projectBreathVisualAnchor(paused.anchor, 90_000)).toEqual(
      projectBreathVisualAnchor(paused.anchor, 1_500)
    );

    const resumed = reconcileBreathVisualAnchor(
      paused.anchor,
      { ...inhale, phaseElapsedMs: 1_500 },
      90_000
    );
    expect(resumed.directive).toBe('correct');
    expect(projectBreathVisualAnchor(resumed.anchor, 90_000)).toMatchObject({
      phaseElapsedMs: 1_500,
      ambientTimeMs: 1_500
    });
  });

  it('corrects a new phase that arrives already paused from authoritative time', () => {
    const running = createBreathVisualAnchor(inhale, 0)!;
    const paused = reconcileBreathVisualAnchor(
      running,
      {
        ...inhale,
        phaseKey: '0:1',
        kind: 'hold-full',
        phaseElapsedMs: 180,
        ambientElapsedMs: 4_180,
        status: 'paused'
      },
      4_180
    );

    expect(paused.directive).toBe('correct');
    expect(paused.anchor).toMatchObject({
      phaseElapsedMs: 180,
      ambientElapsedMs: 4_180,
      status: 'paused'
    });
    expect(projectBreathVisualAnchor(paused.anchor, 90_000)).toMatchObject({
      phaseElapsedMs: 180,
      ambientTimeMs: 4_180
    });
  });

  it('corrects a paused same-phase timing gap above 100ms', () => {
    const current = createBreathVisualAnchor(
      {
        ...inhale,
        status: 'paused',
        phaseElapsedMs: 1_500,
        ambientElapsedMs: 1_500
      },
      1_500
    )!;
    const paused = reconcileBreathVisualAnchor(
      current,
      { ...inhale, status: 'paused', phaseElapsedMs: 1_650 },
      2_000
    );

    expect(paused.directive).toBe('correct');
    expect(paused.anchor).toMatchObject({
      phaseElapsedMs: 1_650,
      ambientElapsedMs: 1_500,
      status: 'paused'
    });
    expect(projectBreathVisualAnchor(paused.anchor, 90_000)).toMatchObject({
      phaseElapsedMs: 1_650,
      ambientTimeMs: 1_500
    });
  });

  it('uses authoritative foreground phase time without catching ambient time up', () => {
    const beforeBackground = createBreathVisualAnchor(
      { ...inhale, phaseElapsedMs: 1_250, ambientElapsedMs: 1_250 },
      1_250
    )!;
    const inactive = freezeBreathVisualClock(beforeBackground, 1_250);
    expect(projectBreathVisualAnchor(inactive, 10_000).ambientTimeMs).toBe(1_250);
    const result = reconcileBreathVisualAnchor(
      inactive,
      { ...inhale, phaseElapsedMs: 2_000, ambientElapsedMs: 10_000 },
      10_000
    );
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(2_000);
    expect(result.anchor.ambientElapsedMs).toBe(1_250);
  });

  it('resets replay phase timing while preserving completed ambient time', () => {
    const completed = createBreathVisualAnchor(
      {
        ...inhale,
        phaseKey: 'completed',
        kind: 'complete',
        phaseElapsedMs: 0,
        ambientElapsedMs: 60_000,
        status: 'completed'
      },
      0
    )!;
    const result = reconcileBreathVisualAnchor(completed, inhale, 500);
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(0);
    expect(result.anchor.ambientElapsedMs).toBe(60_500);
  });

  it('freezes only ambient drift for reduced motion', () => {
    const reduced = createBreathVisualAnchor(
      { ...inhale, reducedMotion: true, ambientElapsedMs: 900 },
      100
    )!;
    expect(projectBreathVisualAnchor(reduced, 1_100)).toMatchObject({
      phaseElapsedMs: 1_000,
      phaseProgress: 0.25,
      ambientTimeMs: 900
    });
  });

  it('rejects invalid anchors and safely rebases a backwards clock', () => {
    expect(
      createBreathVisualAnchor({ ...inhale, phaseElapsedMs: Number.NaN }, 0)
    ).toBeNull();
    const anchor = createBreathVisualAnchor(inhale, 100)!;
    const rebased = reanchorBreathVisualClock(anchor, 600, 50);
    expect(projectBreathVisualAnchor(rebased, 50)).toEqual(
      projectBreathVisualAnchor(anchor, 600)
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'retains the last valid anchor when freeze time is non-finite',
    (frameTimeMs) => {
      const anchor = createBreathVisualAnchor(inhale, 100)!;

      expect(freezeBreathVisualClock(anchor, frameTimeMs)).toBe(anchor);
    }
  );

  it.each([
    { previousFrameTimeMs: Number.NaN, nextFrameTimeMs: 50 },
    { previousFrameTimeMs: 600, nextFrameTimeMs: Number.POSITIVE_INFINITY },
    { previousFrameTimeMs: Number.NEGATIVE_INFINITY, nextFrameTimeMs: 50 },
    { previousFrameTimeMs: 600, nextFrameTimeMs: Number.NEGATIVE_INFINITY }
  ])(
    'retains the last valid anchor when a reanchor time is non-finite',
    ({ previousFrameTimeMs, nextFrameTimeMs }) => {
      const anchor = createBreathVisualAnchor(inhale, 100)!;

      expect(
        reanchorBreathVisualClock(
          anchor,
          previousFrameTimeMs,
          nextFrameTimeMs
        )
      ).toBe(anchor);
    }
  );

  it('uses a fixed non-overshooting 300ms correction envelope', () => {
    expect(BREATH_CORRECTION_MS).toBe(300);
    expect(getBreathCorrectionAmount(1_000, 1_000)).toBe(0);
    expect(getBreathCorrectionAmount(1_150, 1_000)).toBe(0.875);
    expect(getBreathCorrectionAmount(1_300, 1_000)).toBe(1);
    expect(getBreathCorrectionAmount(2_000, 1_000)).toBe(1);
  });

  it('keeps timeline projection deterministic and worklet-safe', () => {
    const source = readFileSync(
      `${process.cwd()}/src/domain/breathVisualTimeline.ts`,
      'utf8'
    );
    expect(source).not.toMatch(/Date\.now|Math\.random/);
    const misleadingSource = [
      'export function missingDirective() { return 0; }',
      "export function downstreamWorklet() { 'worklet'; return 1; }"
    ].join('\n');
    expect(
      getExportedFunctionSource(misleadingSource, 'missingDirective')
    ).not.toContain("'worklet';");

    for (const name of [
      'easeOutCubic',
      'createBreathVisualAnchor',
      'projectBreathVisualAnchor',
      'freezeBreathVisualClock',
      'reconcileBreathVisualAnchor',
      'reanchorBreathVisualClock',
      'getBreathCorrectionAmount'
    ]) {
      expect(getExportedFunctionSource(source, name)).toMatch(
        new RegExp(`^export function ${name}\\([\\s\\S]*?\\{\\s*'worklet';`)
      );
    }
  });

  it('blends toward the advancing phase target without overshoot', () => {
    const from = getBreathMotion('inhale', 1, 4_000);
    const targetAt150 = getBreathMotion('hold-full', 330 / 4_000, 4_330);
    const at150 = mixBreathMotion(
      from,
      targetAt150,
      getBreathCorrectionAmount(4_330, 4_180)
    );
    for (const key of ['scale', 'bloom', 'rotate', 'lift', 'orbit'] as const) {
      expect(at150[key]).toBeGreaterThanOrEqual(
        Math.min(from[key], targetAt150[key])
      );
      expect(at150[key]).toBeLessThanOrEqual(
        Math.max(from[key], targetAt150[key])
      );
    }

    const targetAt300 = getBreathMotion('hold-full', 480 / 4_000, 4_480);
    expect(
      mixBreathMotion(
        from,
        targetAt300,
        getBreathCorrectionAmount(4_480, 4_180)
      )
    ).toEqual(targetAt300);
  });

  it('clamps duration and corrects timing errors above the tolerance', () => {
    const clamped = createBreathVisualAnchor(
      { ...inhale, phaseDurationMs: 0 },
      0
    )!;
    expect(clamped.phaseDurationMs).toBe(1_000);

    const current = createBreathVisualAnchor(inhale, 0)!;
    expect(
      reconcileBreathVisualAnchor(
        current,
        { ...inhale, phaseElapsedMs: 351 },
        250
      ).directive
    ).toBe('correct');
  });

  it.each([
    { status: 'idle' as const, kind: 'ready' as const },
    { status: 'completed' as const, kind: 'complete' as const }
  ])('loops $status progress inside zero and one', ({ status, kind }) => {
    const anchor = createBreathVisualAnchor(
      { ...inhale, phaseKey: status, status, kind },
      1_000
    )!;
    expect(projectBreathVisualAnchor(anchor, 5_500).phaseProgress).toBe(0.125);
    expect(projectBreathVisualAnchor(anchor, -10).phaseProgress).toBe(0);
  });

  it('corrects start and completion state changes', () => {
    const ready = createBreathVisualAnchor(
      { ...inhale, phaseKey: 'idle', kind: 'ready', status: 'idle' },
      0
    )!;
    const started = reconcileBreathVisualAnchor(ready, inhale, 100);
    expect(started.directive).toBe('correct');
    expect(started.anchor.ambientElapsedMs).toBe(100);
    const running = createBreathVisualAnchor(inhale, 0)!;
    const completed = reconcileBreathVisualAnchor(
      running,
      {
        ...inhale,
        phaseKey: 'completed',
        kind: 'complete',
        status: 'completed'
      },
      4_000
    );
    expect(completed.directive).toBe('correct');
    expect(completed.anchor.ambientElapsedMs).toBe(4_000);
  });
});
