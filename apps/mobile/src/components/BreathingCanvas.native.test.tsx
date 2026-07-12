import type { BreathingPhase } from '@easy-meditation/shared';
import {
  resolveBreathTransitionDirective,
  resolveBreathingCanvasFrame
} from './BreathingCanvas';

const phases: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 }
];

describe('BreathingCanvas legacy timing contract', () => {
  it('uses authoritative phase progress and freezes it while paused', () => {
    const base = {
      phases,
      phaseIndex: 0,
      phaseKind: 'inhale' as const,
      phaseProgress: 0.37,
      phaseDurationMs: 4_000,
      reducedMotion: false
    };

    expect(resolveBreathingCanvasFrame({ ...base, status: 'running' }, 250).progress).toBe(
      0.37
    );
    expect(resolveBreathingCanvasFrame({ ...base, status: 'running' }, 3_250).progress).toBe(
      0.37
    );
    expect(resolveBreathingCanvasFrame({ ...base, status: 'paused' }, 9_250).progress).toBe(
      0.37
    );
  });

  it('loops ambient progress only for ready and complete states', () => {
    const ready = resolveBreathingCanvasFrame(
      {
        phases,
        phaseIndex: 0,
        phaseKind: 'inhale',
        phaseProgress: 0,
        phaseDurationMs: 4_000,
        status: 'idle',
        reducedMotion: false
      },
      2_300
    );
    const complete = resolveBreathingCanvasFrame(
      {
        phases,
        phaseIndex: 3,
        phaseKind: 'complete',
        phaseProgress: 1,
        phaseDurationMs: 4_000,
        status: 'completed',
        reducedMotion: false
      },
      2_000
    );

    expect(ready).toMatchObject({ kind: 'ready', progress: 0.5 });
    expect(complete).toMatchObject({ kind: 'complete', progress: 0.5 });
  });

  it('forces completed status to the complete visual even with a stale phase kind', () => {
    const frame = resolveBreathingCanvasFrame(
      {
        phases,
        phaseIndex: 2,
        phaseKind: 'exhale',
        phaseProgress: 1,
        phaseDurationMs: 4_000,
        status: 'completed',
        reducedMotion: false
      },
      2_000
    );

    expect(frame.kind).toBe('complete');
  });

  it('freezes paused motion instead of applying ambient visual-time waves', () => {
    const pausedProps = {
      phases,
      phaseIndex: 0,
      phaseKind: 'inhale' as const,
      phaseProgress: 0.37,
      phaseDurationMs: 4_000,
      status: 'paused' as const,
      reducedMotion: false
    };

    expect(resolveBreathingCanvasFrame(pausedProps, 250)).toEqual(
      resolveBreathingCanvasFrame(pausedProps, 3_250)
    );
  });

  it('keeps paused complete-kind input frozen until status becomes completed', () => {
    const pausedCompleteProps = {
      phases,
      phaseIndex: 3,
      phaseKind: 'complete' as const,
      phaseProgress: 1,
      phaseDurationMs: 4_000,
      status: 'paused' as const,
      reducedMotion: false
    };

    const early = resolveBreathingCanvasFrame(pausedCompleteProps, 250);
    const late = resolveBreathingCanvasFrame(pausedCompleteProps, 3_250);
    expect(early).toEqual(late);
    expect(early).toMatchObject({ kind: 'complete', progress: 1 });
  });

  it('snaps an in-flight transition on pause and starts resumed frames settled', () => {
    const running = {
      kind: 'inhale' as const,
      reducedMotion: false,
      status: 'running' as const
    };
    const paused = { ...running, status: 'paused' as const };

    expect(resolveBreathTransitionDirective(running, paused)).toBe('snap');
    expect(resolveBreathTransitionDirective(paused, running)).toBe('none');
    expect(
      resolveBreathTransitionDirective(running, {
        ...running,
        kind: 'exhale'
      })
    ).toBe('animate');
    expect(
      resolveBreathTransitionDirective(paused, {
        ...paused,
        kind: 'hold-full'
      })
    ).toBe('snap');
  });
});
