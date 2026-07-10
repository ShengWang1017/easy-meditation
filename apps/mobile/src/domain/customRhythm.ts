import type { BreathingMethod } from '@easy-meditation/shared';

export type CustomDurationMinutes = 2 | 3 | 5 | 10;

export type CustomRhythm = {
  name: '自定义';
  inhaleSeconds: number;
  holdSeconds: number;
  exhaleSeconds: number;
  durationMinutes: CustomDurationMinutes;
};

export const DEFAULT_CUSTOM_RHYTHM: CustomRhythm = {
  name: '自定义',
  inhaleSeconds: 4,
  holdSeconds: 2,
  exhaleSeconds: 5,
  durationMinutes: 5
};

const CUSTOM_PHASE_KEYS = ['inhaleSeconds', 'holdSeconds', 'exhaleSeconds'] as const;

function clampPhaseSeconds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(12, Math.round(value)));
}

export function redistributeCycleSeconds(
  rhythm: Pick<CustomRhythm, (typeof CUSTOM_PHASE_KEYS)[number]>,
  targetSeconds: number
): Pick<CustomRhythm, (typeof CUSTOM_PHASE_KEYS)[number]> {
  const target = Math.max(3, Math.min(36, Math.round(targetSeconds)));
  const normalized = CUSTOM_PHASE_KEYS.map((key) => clampPhaseSeconds(rhythm[key]));
  const currentTotal = normalized.reduce((sum, value) => sum + value, 0);
  const rawValues = normalized.map((value) => (value * target) / currentTotal);
  const nextValues = rawValues.map(clampPhaseSeconds);
  let difference = target - nextValues.reduce((sum, value) => sum + value, 0);

  while (difference !== 0) {
    const direction = difference > 0 ? 1 : -1;
    const candidate = nextValues
      .map((value, index) => ({
        index,
        value,
        score: direction > 0 ? rawValues[index]! - value : value - rawValues[index]!
      }))
      .filter(({ value }) => (direction > 0 ? value < 12 : value > 1))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0];

    if (!candidate) break;
    nextValues[candidate.index] = nextValues[candidate.index]! + direction;
    difference -= direction;
  }

  return {
    inhaleSeconds: nextValues[0]!,
    holdSeconds: nextValues[1]!,
    exhaleSeconds: nextValues[2]!
  };
}

export function toCustomBreathingMethod(rhythm: CustomRhythm): BreathingMethod {
  return {
    id: 'custom',
    slug: 'custom',
    title: '自定义',
    subtitle: `吸气 ${rhythm.inhaleSeconds} 秒 · 屏息 ${rhythm.holdSeconds} 秒 · 呼气 ${rhythm.exhaleSeconds} 秒`,
    category: 'system',
    defaultDurationSeconds: rhythm.durationMinutes * 60,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: rhythm.inhaleSeconds },
      { kind: 'hold', label: '屏息', durationSeconds: rhythm.holdSeconds },
      { kind: 'exhale', label: '呼气', durationSeconds: rhythm.exhaleSeconds }
    ],
    sortOrder: 40,
    isActive: true
  };
}
