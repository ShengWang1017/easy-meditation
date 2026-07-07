import { describe, expect, test } from 'vitest';
import { BREATHING_METHODS_SEED, getSessionSnapshot, secondsToTimerLabel } from './breathing.js';
import type { BreathingMethod } from './schemas.js';

function getSeedMethod(index: number): BreathingMethod {
  const method = BREATHING_METHODS_SEED[index];
  expect(method).toBeDefined();
  return method!;
}

describe('shared breathing helpers', () => {
  test('seeds built-in breathing methods with stable ids', () => {
    expect(BREATHING_METHODS_SEED.map((method) => method.id)).toEqual([
      'box',
      'four-seven-eight',
      'coherent'
    ]);
  });

  test('calculates box breathing phases', () => {
    const method = getSeedMethod(0);

    expect(getSessionSnapshot(method, 0, 180)).toMatchObject({ label: '吸气', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 4, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 8, 180)).toMatchObject({ label: '呼气', remainingInPhase: 4 });
    expect(getSessionSnapshot(method, 12, 180)).toMatchObject({ label: '屏息', remainingInPhase: 4 });
  });

  test('marks completion exactly at total duration', () => {
    const method = getSeedMethod(1);

    expect(getSessionSnapshot(method, 120, 120)).toMatchObject({
      kind: 'complete',
      label: '完成',
      isComplete: true,
      remainingInSession: 0
    });
  });

  test('formats timer labels', () => {
    expect(secondsToTimerLabel(180)).toBe('03:00');
    expect(secondsToTimerLabel(61)).toBe('01:01');
    expect(secondsToTimerLabel(5)).toBe('00:05');
  });
});
