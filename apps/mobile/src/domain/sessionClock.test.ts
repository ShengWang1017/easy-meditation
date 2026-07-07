import { describe, expect, test } from 'vitest';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';
import { createSessionClock } from './sessionClock';

describe('mobile session clock', () => {
  test('starts, pauses, resumes, and completes from wall clock time', () => {
    let time = 0;
    const method = BREATHING_METHODS_SEED[0];

    expect(method).toBeDefined();

    const clock = createSessionClock(method!, 120, () => time);

    expect(clock.snapshot().status).toBe('idle');

    clock.start();
    time += 4_000;
    expect(clock.snapshot().phase.label).toBe('屏息');

    clock.pause();
    time += 10_000;
    expect(clock.snapshot().phase.label).toBe('屏息');

    clock.resume();
    time += 116_000;
    expect(clock.snapshot().status).toBe('completed');
  });
});
