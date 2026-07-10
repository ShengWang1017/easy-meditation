import { describe, expect, test } from 'vitest';
import {
  DEFAULT_CUSTOM_RHYTHM,
  redistributeCycleSeconds,
  toCustomBreathingMethod
} from './customRhythm';
import type { CustomRhythm } from './customRhythm';

describe('custom rhythm', () => {
  test('uses the approved prototype defaults', () => {
    expect(DEFAULT_CUSTOM_RHYTHM).toEqual({
      name: '自定义',
      inhaleSeconds: 4,
      holdSeconds: 2,
      exhaleSeconds: 5,
      durationMinutes: 5
    });
  });

  test('converts the current rhythm to a complete breathing method', () => {
    const rhythm: CustomRhythm = {
      name: '自定义',
      inhaleSeconds: 7,
      holdSeconds: 1,
      exhaleSeconds: 9,
      durationMinutes: 10
    };

    expect(toCustomBreathingMethod(rhythm)).toEqual({
      id: 'custom',
      slug: 'custom',
      title: '自定义',
      subtitle: '吸气 7 秒 · 屏息 1 秒 · 呼气 9 秒',
      category: 'system',
      defaultDurationSeconds: 600,
      phases: [
        { kind: 'inhale', label: '吸气', durationSeconds: 7 },
        { kind: 'hold', label: '屏息', durationSeconds: 1 },
        { kind: 'exhale', label: '呼气', durationSeconds: 9 }
      ],
      sortOrder: 40,
      isActive: true
    });
  });

  test.each([
    [3, { inhaleSeconds: 1, holdSeconds: 1, exhaleSeconds: 1 }],
    [14, { inhaleSeconds: 5, holdSeconds: 3, exhaleSeconds: 6 }],
    [36, { inhaleSeconds: 12, holdSeconds: 12, exhaleSeconds: 12 }]
  ] as const)('redistributes the default cycle to %i seconds', (targetSeconds, expected) => {
    expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, targetSeconds)).toEqual(expected);
  });

  test('clamps target seconds to the supported cycle range', () => {
    expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, Number.NEGATIVE_INFINITY)).toEqual({
      inhaleSeconds: 1,
      holdSeconds: 1,
      exhaleSeconds: 1
    });
    expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, Number.POSITIVE_INFINITY)).toEqual({
      inhaleSeconds: 12,
      holdSeconds: 12,
      exhaleSeconds: 12
    });
  });

  test('normalizes nonfinite phase values before redistribution', () => {
    expect(
      redistributeCycleSeconds(
        {
          inhaleSeconds: Number.NaN,
          holdSeconds: Number.POSITIVE_INFINITY,
          exhaleSeconds: Number.NEGATIVE_INFINITY
        },
        6
      )
    ).toEqual({ inhaleSeconds: 2, holdSeconds: 2, exhaleSeconds: 2 });
  });

  test('preserves the specified JavaScript behavior for a nonfinite target', () => {
    expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, Number.NaN)).toEqual({
      inhaleSeconds: 1,
      holdSeconds: 1,
      exhaleSeconds: 1
    });
  });
});
