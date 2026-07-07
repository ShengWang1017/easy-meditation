import type { BreathingMethod } from './schemas.js';

export type BreathPhaseKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type SessionSnapshot = {
  kind: BreathPhaseKind;
  label: string;
  phaseIndex: number;
  phaseProgress: number;
  remainingInPhase: number;
  remainingInSession: number;
  elapsedSeconds: number;
  isComplete: boolean;
};

export const BREATHING_METHODS_SEED: [BreathingMethod, BreathingMethod, BreathingMethod] = [
  {
    id: 'box',
    slug: 'box',
    title: '盒式呼吸',
    subtitle: '吸气 · 屏息 · 呼气 · 屏息',
    category: 'classic',
    defaultDurationSeconds: 180,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 },
      { kind: 'exhale', label: '呼气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 }
    ],
    sortOrder: 10,
    isActive: true
  },
  {
    id: 'four-seven-eight',
    slug: 'four-seven-eight',
    title: '4-7-8 呼吸',
    subtitle: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
    category: 'classic',
    defaultDurationSeconds: 180,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 7 },
      { kind: 'exhale', label: '呼气', durationSeconds: 8 }
    ],
    sortOrder: 20,
    isActive: true
  },
  {
    id: 'coherent',
    slug: 'coherent',
    title: '共振呼吸',
    subtitle: '吸气 5 秒 · 呼气 5 秒',
    category: 'classic',
    defaultDurationSeconds: 300,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 5 },
      { kind: 'exhale', label: '呼气', durationSeconds: 5 }
    ],
    sortOrder: 30,
    isActive: true
  }
];

export function getSessionSnapshot(
  method: BreathingMethod,
  elapsedSeconds: number,
  totalSeconds: number
): SessionSnapshot {
  const elapsed = Math.max(0, Math.floor(elapsedSeconds));
  const total = Math.max(1, Math.floor(totalSeconds));

  if (elapsed >= total) {
    return {
      kind: 'complete',
      label: '完成',
      phaseIndex: Math.max(0, method.phases.length - 1),
      phaseProgress: 1,
      remainingInPhase: 0,
      remainingInSession: 0,
      elapsedSeconds: total,
      isComplete: true
    };
  }

  const cycleSeconds = method.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
  let cycleElapsed = elapsed % cycleSeconds;
  const remainingInSession = total - elapsed;

  for (let index = 0; index < method.phases.length; index += 1) {
    const phase = method.phases[index];
    if (!phase) break;

    if (cycleElapsed < phase.durationSeconds) {
      const remainingInPhase = phase.durationSeconds - cycleElapsed;
      return {
        kind: phase.kind,
        label: phase.label,
        phaseIndex: index,
        phaseProgress: cycleElapsed / phase.durationSeconds,
        remainingInPhase: Math.min(remainingInPhase, remainingInSession),
        remainingInSession,
        elapsedSeconds: elapsed,
        isComplete: false
      };
    }

    cycleElapsed -= phase.durationSeconds;
  }

  return getSessionSnapshot(method, total, total);
}

export function secondsToTimerLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
