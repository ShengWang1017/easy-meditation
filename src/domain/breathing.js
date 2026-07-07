export const BREATHING_METHODS = {
  box: {
    id: 'box',
    category: 'classic',
    title: '盒式呼吸',
    rhythmLabel: '4-4-4-4',
    subtitle: '吸气 · 屏息 · 呼气 · 屏息',
    defaultMinutes: 3,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 },
      { kind: 'exhale', label: '呼气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 4 }
    ]
  },
  fourSevenEight: {
    id: 'fourSevenEight',
    category: 'classic',
    title: '4-7-8 呼吸',
    rhythmLabel: '4-7-8',
    subtitle: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
    defaultMinutes: 3,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 7 },
      { kind: 'exhale', label: '呼气', durationSeconds: 8 }
    ]
  },
  coherent: {
    id: 'coherent',
    category: 'classic',
    title: '共振呼吸',
    rhythmLabel: '5-5',
    subtitle: '吸气 5 秒 · 呼气 5 秒',
    defaultMinutes: 5,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 5 },
      { kind: 'exhale', label: '呼气', durationSeconds: 5 }
    ]
  },
  custom: {
    id: 'custom',
    category: 'custom',
    title: '自定义节奏',
    rhythmLabel: '4-2-5',
    subtitle: '吸气 4 秒 · 屏息 2 秒 · 呼气 5 秒',
    defaultMinutes: 5,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: 4 },
      { kind: 'hold', label: '屏息', durationSeconds: 2 },
      { kind: 'exhale', label: '呼气', durationSeconds: 5 }
    ]
  }
};

export const DURATIONS_MINUTES = [2, 3, 5, 10];

export function getSessionSnapshot(method, elapsedSeconds, totalSeconds) {
  const normalizedElapsed = Math.max(0, Math.floor(elapsedSeconds));
  if (normalizedElapsed >= totalSeconds) {
    return {
      kind: 'complete',
      label: '完成',
      phaseIndex: method.phases.length - 1,
      phaseProgress: 1,
      remainingInPhase: 0,
      remainingInSession: 0,
      elapsedSeconds: totalSeconds,
      isComplete: true
    };
  }

  return getPhaseAtElapsed(method, normalizedElapsed, totalSeconds);
}

export function getPhaseAtElapsed(method, elapsedSeconds, totalSeconds) {
  const cycleSeconds = method.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0);
  let cycleElapsed = Math.max(0, Math.floor(elapsedSeconds)) % cycleSeconds;
  const remainingInSession = Math.max(0, totalSeconds - Math.floor(elapsedSeconds));

  for (let index = 0; index < method.phases.length; index += 1) {
    const phase = method.phases[index];
    if (cycleElapsed < phase.durationSeconds) {
      const phaseRemaining = phase.durationSeconds - cycleElapsed;
      return {
        kind: phase.kind,
        label: phase.label,
        phaseIndex: index,
        phaseProgress: cycleElapsed / phase.durationSeconds,
        remainingInPhase: Math.min(phaseRemaining, remainingInSession),
        remainingInSession,
        elapsedSeconds: Math.max(0, Math.floor(elapsedSeconds)),
        isComplete: false
      };
    }

    cycleElapsed -= phase.durationSeconds;
  }

  return getSessionSnapshot(method, elapsedSeconds, totalSeconds);
}

export function secondsToLabel(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
