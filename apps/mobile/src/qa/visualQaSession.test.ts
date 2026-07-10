import type { BreathingPhase } from '@easy-meditation/shared';

import { createVisualQaSessionOverride } from './visualQaSession';
import type { VisualQaSessionSnapshot } from './visualQa';

const phases: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 },
  { kind: 'hold', label: '屏息', durationSeconds: 4 }
];

type SessionCase = {
  snapshot: VisualQaSessionSnapshot;
  phaseIndex: number;
  remainingInPhase: number;
  isComplete: boolean;
  expectedVisualTimeMs: number;
};

const snapshots = [
  {
    snapshot: {
      status: 'idle',
      phaseKind: 'inhale',
      phaseProgress: 0,
      elapsedSeconds: 0,
      remainingSeconds: 300
    },
    phaseIndex: 0,
    remainingInPhase: 4,
    isComplete: false,
    expectedVisualTimeMs: 0
  },
  {
    snapshot: {
      status: 'running',
      phaseKind: 'inhale',
      phaseProgress: 0.5,
      elapsedSeconds: 2,
      remainingSeconds: 298
    },
    phaseIndex: 0,
    remainingInPhase: 2,
    isComplete: false,
    expectedVisualTimeMs: 2_000
  },
  {
    snapshot: {
      status: 'running',
      phaseKind: 'hold',
      phaseProgress: 0.5,
      elapsedSeconds: 6,
      remainingSeconds: 294
    },
    phaseIndex: 1,
    remainingInPhase: 2,
    isComplete: false,
    expectedVisualTimeMs: 2_000
  },
  {
    snapshot: {
      status: 'running',
      phaseKind: 'exhale',
      phaseProgress: 0.5,
      elapsedSeconds: 10,
      remainingSeconds: 290
    },
    phaseIndex: 2,
    remainingInPhase: 2,
    isComplete: false,
    expectedVisualTimeMs: 2_000
  },
  {
    snapshot: {
      status: 'paused',
      phaseKind: 'exhale',
      phaseProgress: 0.25,
      elapsedSeconds: 9,
      remainingSeconds: 291
    },
    phaseIndex: 2,
    remainingInPhase: 3,
    isComplete: false,
    expectedVisualTimeMs: 1_000
  },
  {
    snapshot: {
      status: 'completed',
      phaseKind: 'complete',
      phaseProgress: 1,
      elapsedSeconds: 300,
      remainingSeconds: 0
    },
    phaseIndex: 3,
    remainingInPhase: 0,
    isComplete: true,
    expectedVisualTimeMs: 0
  }
] satisfies readonly SessionCase[];

describe('visual QA session override', () => {
  it.each(snapshots)(
    'builds a fixed $snapshot.status/$snapshot.phaseKind snapshot without a live clock',
    ({
      snapshot,
      phaseIndex,
      remainingInPhase,
      isComplete,
      expectedVisualTimeMs
    }) => {
      const override = createVisualQaSessionOverride({
        snapshot,
        phases
      });

      expect(override.controller.snapshot).toEqual({
        status: snapshot.status,
        elapsedSeconds: snapshot.elapsedSeconds,
        remainingSeconds: snapshot.remainingSeconds,
        phase: {
          kind: snapshot.phaseKind,
          label: isComplete ? '完成' : phases[phaseIndex]!.label,
          phaseIndex,
          phaseProgress: snapshot.phaseProgress,
          remainingInPhase,
          remainingInSession: snapshot.remainingSeconds,
          elapsedSeconds: snapshot.elapsedSeconds,
          isComplete
        }
      });
      expect(override.fixtureVisualTimeMs).toBe(expectedVisualTimeMs);
    }
  );

  it('keeps every control inert and never exposes persistence work', async () => {
    const override = createVisualQaSessionOverride({
      snapshot: {
        status: 'running',
        phaseKind: 'inhale',
        phaseProgress: 0.5,
        elapsedSeconds: 2,
        remainingSeconds: 298
      },
      phases
    });
    const before = structuredClone(override.controller.snapshot);

    override.controller.start();
    override.controller.pause();
    override.controller.resume();
    await override.controller.persistIntentionalEnd();
    await override.controller.retryPersistence();
    await override.controller.replay();

    expect(override.controller.snapshot).toEqual(before);
    expect(override.controller.isPersisting).toBe(false);
    expect(override.controller.persistenceError).toBeNull();
    expect(override.controller.controlsUnlocked).toBe(true);
  });
});
