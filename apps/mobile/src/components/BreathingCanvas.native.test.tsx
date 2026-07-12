import type { BreathingPhase } from '@easy-meditation/shared';
import { readFileSync } from 'node:fs';
import { resolveBreathingCanvasFrame } from './BreathingCanvas';

const phases: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 }
];

const base = {
  phases,
  phaseIndex: 0,
  phaseKind: 'inhale' as const,
  status: 'running' as const,
  reducedMotion: false,
  visualTiming: {
    phaseKey: '0:0',
    phaseElapsedMs: 1_000,
    phaseDurationMs: 4_000,
    ambientElapsedMs: 1_000
  }
};

describe('BreathingCanvas continuous timing contract', () => {
  it('projects running motion continuously from frame time', () => {
    expect(resolveBreathingCanvasFrame(base, 0).progress).toBe(0.25);
    expect(resolveBreathingCanvasFrame(base, 250).progress).toBe(0.3125);
    expect(resolveBreathingCanvasFrame(base, 500).progress).toBe(0.375);
  });

  it('keeps paused progress and ambient outline identical', () => {
    const paused = { ...base, status: 'paused' as const };
    expect(resolveBreathingCanvasFrame(paused, 250)).toEqual(
      resolveBreathingCanvasFrame(paused, 30_000)
    );
  });

  it('does not use spring or timing animations for the authoritative clock', () => {
    const source = readFileSync(
      `${process.cwd()}/src/components/useBreathVisualTimeline.ts`,
      'utf8'
    );
    expect(source).not.toMatch(/withSpring|withTiming/);
  });

  it('loops ambient progress only for ready and complete states', () => {
    const ready = resolveBreathingCanvasFrame(
      {
        ...base,
        status: 'idle',
        visualTiming: {
          phaseKey: 'idle',
          phaseElapsedMs: 0,
          phaseDurationMs: 4_000,
          ambientElapsedMs: 0
        }
      },
      2_300
    );
    const complete = resolveBreathingCanvasFrame(
      {
        ...base,
        phaseIndex: 3,
        phaseKind: 'complete',
        status: 'completed',
        visualTiming: {
          phaseKey: 'completed',
          phaseElapsedMs: 0,
          phaseDurationMs: 4_000,
          ambientElapsedMs: 0
        }
      },
      2_000
    );

    expect(ready).toMatchObject({ kind: 'ready', progress: 0.5 });
    expect(complete).toMatchObject({ kind: 'complete', progress: 0.5 });
  });

  it('forces completed status to the complete visual even with a stale phase kind', () => {
    const frame = resolveBreathingCanvasFrame(
      {
        ...base,
        phaseIndex: 2,
        phaseKind: 'exhale',
        status: 'completed',
        visualTiming: {
          phaseKey: 'completed',
          phaseElapsedMs: 0,
          phaseDurationMs: 4_000,
          ambientElapsedMs: 0
        }
      },
      2_000
    );

    expect(frame.kind).toBe('complete');
  });

  it('keeps paused complete-kind input frozen until status becomes completed', () => {
    const pausedCompleteProps = {
      ...base,
      phaseIndex: 3,
      phaseKind: 'complete' as const,
      status: 'paused' as const,
      visualTiming: {
        phaseKey: '0:3',
        phaseElapsedMs: 4_000,
        phaseDurationMs: 4_000,
        ambientElapsedMs: 16_000
      }
    };

    const early = resolveBreathingCanvasFrame(pausedCompleteProps, 250);
    const late = resolveBreathingCanvasFrame(pausedCompleteProps, 3_250);
    expect(early).toEqual(late);
    expect(early).toMatchObject({ kind: 'complete', progress: 1 });
  });
});
