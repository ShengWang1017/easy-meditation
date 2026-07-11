import { describe, expect, test, vi } from 'vitest';
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

  test('emits an exact visual phase anchor without changing integer counters', () => {
    let time = 0;
    const clock = createSessionClock(getSeedMethod(0), 120, () => time);

    clock.start();
    time = 250;
    expect(clock.snapshot()).toMatchObject({
      elapsedSeconds: 0,
      remainingSeconds: 120,
      visual: {
        phaseKey: '0:0',
        phaseElapsedMs: 250,
        phaseDurationMs: 4_000,
        ambientElapsedMs: 250
      }
    });

    time = 3_999;
    expect(clock.snapshot().visual).toEqual({
      phaseKey: '0:0',
      phaseElapsedMs: 3_999,
      phaseDurationMs: 4_000,
      ambientElapsedMs: 3_999
    });

    time = 4_000;
    expect(clock.snapshot().visual).toEqual({
      phaseKey: '0:1',
      phaseElapsedMs: 0,
      phaseDurationMs: 4_000,
      ambientElapsedMs: 4_000
    });

    time = 16_250;
    expect(clock.snapshot().visual.phaseKey).toBe('1:0');
    expect(clock.snapshot().visual.phaseElapsedMs).toBe(250);
  });

  test('freezes exact phase and ambient milliseconds across pause', () => {
    let time = 0;
    const clock = createSessionClock(getSeedMethod(0), 120, () => time);
    clock.start();
    time = 1_375;
    clock.pause();
    const frozen = clock.snapshot().visual;

    time = 31_375;
    expect(clock.snapshot().visual).toEqual(frozen);

    clock.resume();
    time = 31_625;
    expect(clock.snapshot().visual).toMatchObject({
      phaseKey: '0:0',
      phaseElapsedMs: 1_625,
      ambientElapsedMs: 1_625
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

  test('keeps natural completion when pause wins the race with the refresh interval', () => {
    let time = 0;
    const clock = createSessionClock(getSeedMethod(0), 2, () => time);

    clock.start();
    time = 2_000;
    clock.pause();

    expect(clock.snapshot()).toMatchObject({
      status: 'completed',
      elapsedSeconds: 2,
      remainingSeconds: 0,
      phase: { isComplete: true }
    });
    expect(clock.freeze()).toMatchObject({ status: 'completed' });
  });

  test('samples wall time once when pausing below the completion boundary', () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_999)
      .mockReturnValueOnce(2_000);
    const clock = createSessionClock(getSeedMethod(0), 2, now);

    clock.start();
    clock.pause();

    expect(now).toHaveBeenCalledTimes(2);
    expect(clock.snapshot()).toMatchObject({
      status: 'paused',
      elapsedSeconds: 1,
      remainingSeconds: 1,
      phase: { isComplete: false }
    });
  });

  test('samples wall time once when freezing below the completion boundary', () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_999)
      .mockReturnValueOnce(2_000);
    const clock = createSessionClock(getSeedMethod(0), 2, now);

    clock.start();
    const frozen = clock.freeze();

    expect(now).toHaveBeenCalledTimes(2);
    expect(frozen).toMatchObject({
      status: 'paused',
      elapsedSeconds: 1,
      remainingSeconds: 1,
      phase: { isComplete: false }
    });
  });
});
