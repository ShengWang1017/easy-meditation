import { describe, expect, test } from 'vitest';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import type { BreathingMethod } from '@easy-meditation/shared';
import { createSessionClock } from './sessionClock';

function getSeedMethod(index: number): BreathingMethod {
  const method = BREATHING_METHODS_SEED[index];
  expect(method).toBeDefined();
  return method!;
}

describe('mobile session clock', () => {
  test('starts, pauses, resumes, and completes from wall clock time', () => {
    let time = 0;
    const clock = createSessionClock(getSeedMethod(0), 120, () => time);

    expect(clock.snapshot()).toMatchObject({
      status: 'idle',
      elapsedSeconds: 0,
      remainingSeconds: 120,
      phase: {
        isComplete: false,
        elapsedSeconds: 0,
        remainingInSession: 120,
        remainingInPhase: 4
      }
    });

    clock.start();
    time += 4_000;
    expect(clock.snapshot()).toMatchObject({
      status: 'running',
      elapsedSeconds: 4,
      remainingSeconds: 116,
      phase: {
        label: '屏息',
        elapsedSeconds: 4,
        remainingInSession: 116,
        remainingInPhase: 4,
        isComplete: false
      }
    });

    clock.pause();
    expect(clock.snapshot()).toMatchObject({
      status: 'paused',
      elapsedSeconds: 4,
      remainingSeconds: 116,
      phase: {
        elapsedSeconds: 4,
        remainingInSession: 116,
        isComplete: false
      }
    });

    time += 10_000;
    expect(clock.snapshot()).toMatchObject({
      status: 'paused',
      elapsedSeconds: 4,
      remainingSeconds: 116,
      phase: {
        label: '屏息',
        elapsedSeconds: 4,
        remainingInSession: 116,
        isComplete: false
      }
    });

    clock.resume();
    time += 1_000;
    expect(clock.snapshot()).toMatchObject({
      status: 'running',
      elapsedSeconds: 5,
      remainingSeconds: 115,
      phase: {
        label: '屏息',
        elapsedSeconds: 5,
        remainingInSession: 115,
        remainingInPhase: 3,
        isComplete: false
      }
    });

    time += 115_000;
    expect(clock.snapshot()).toMatchObject({
      status: 'completed',
      elapsedSeconds: 120,
      remainingSeconds: 0,
      phase: {
        kind: 'complete',
        label: '完成',
        elapsedSeconds: 120,
        remainingInSession: 0,
        remainingInPhase: 0,
        isComplete: true
      }
    });
  });

  test('preserves sub-second wall time across pause and resume boundaries', () => {
    let time = 0;
    const clock = createSessionClock(getSeedMethod(0), 120, () => time);

    clock.start();
    time = 600;
    clock.pause();
    expect(clock.snapshot().elapsedSeconds).toBe(0);

    time = 10_600;
    clock.resume();
    time = 11_000;

    expect(clock.snapshot()).toMatchObject({
      status: 'running',
      elapsedSeconds: 1,
      remainingSeconds: 119
    });
  });

  test('freezes intentional endings at the 999ms and 1000ms persistence boundary', () => {
    let time = 0;
    const belowBoundary = createSessionClock(getSeedMethod(0), 120, () => time);
    belowBoundary.start();
    time = 999;
    expect(belowBoundary.freeze()).toMatchObject({ status: 'paused', elapsedSeconds: 0 });
    time = 30_000;
    expect(belowBoundary.snapshot().elapsedSeconds).toBe(0);

    time = 0;
    const atBoundary = createSessionClock(getSeedMethod(0), 120, () => time);
    atBoundary.start();
    time = 1_000;
    expect(atBoundary.freeze()).toMatchObject({ status: 'paused', elapsedSeconds: 1 });
    time = 30_000;
    expect(atBoundary.snapshot().elapsedSeconds).toBe(1);
  });

  test('uses wall time after a long background jump and freezes natural completion', () => {
    let time = 1_000;
    const clock = createSessionClock(getSeedMethod(0), 3, () => time);
    clock.start();
    time = 9_000;

    expect(clock.snapshot()).toMatchObject({
      status: 'completed',
      elapsedSeconds: 3,
      remainingSeconds: 0
    });

    time = 90_000;
    expect(clock.snapshot()).toMatchObject({ status: 'completed', elapsedSeconds: 3 });
  });
});
