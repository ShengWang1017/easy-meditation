import { BREATHING_METHODS, getSessionSnapshot } from '../domain/breathing.js';
import { createPracticeStore } from '../domain/records.js';

const PAGES = [
  { id: 'meditation', label: '冥想' },
  { id: 'records', label: '记录' }
];

const CUSTOM_PHASE_KEYS = ['inhale', 'hold', 'exhale'];

const DEFAULT_CUSTOM_SETTINGS = {
  inhale: 4,
  hold: 2,
  exhale: 5,
  durationMinutes: BREATHING_METHODS.custom.defaultMinutes
};

function createDefaultMethodDurations() {
  return Object.fromEntries(
    Object.values(BREATHING_METHODS).map((method) => [method.id, method.defaultMinutes])
  );
}

function normalizeMinutes(minutes, fallback) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value);
}

export function createMeditationState(options = {}) {
  const now = options.now ?? (() => Date.now());
  const store = createPracticeStore(options.storage);
  const cuePlayer = options.cuePlayer ?? createNoopCuePlayer();
  const methodDurations = createDefaultMethodDurations();
  methodDurations.box = normalizeMinutes(options.initialDurationMinutes ?? methodDurations.box, methodDurations.box);
  const state = {
    method: BREATHING_METHODS.box,
    durationMinutes: methodDurations.box,
    status: 'idle',
    elapsedBeforeRun: 0,
    runStartedAt: 0,
    controlsOpen: false,
    soundEnabled: options.audioEnabled ?? true,
    page: 'meditation',
    view: 'modeSelection',
    beforeCardVisible: true,
    lastCueKey: '',
    methodDurations,
    customSettings: { ...DEFAULT_CUSTOM_SETTINGS }
  };

  function elapsedSeconds() {
    if (state.status !== 'running') return state.elapsedBeforeRun;
    return state.elapsedBeforeRun + Math.floor((now() - state.runStartedAt) / 1000);
  }

  function totalSeconds() {
    return state.durationMinutes * 60;
  }

  function sync() {
    const phase = getSessionSnapshot(getActiveMethod(), elapsedSeconds(), totalSeconds());
    if (state.status === 'running') {
      cueIfNeeded(phase);
      if (phase.isComplete) completeSession();
    }
    return getSnapshot();
  }

  function getSnapshot() {
    const method = getActiveMethod();
    const phase = getSessionSnapshot(method, elapsedSeconds(), totalSeconds());
    return {
      method,
      durationMinutes: state.durationMinutes,
      title: `${state.durationMinutes} 分钟${method.title}`,
      status: state.status,
      phase,
      remainingInSession: phase.remainingInSession,
      controlsOpen: state.controlsOpen,
      soundEnabled: state.soundEnabled,
      page: state.page,
      view: state.page === 'records' || state.page === 'guide' ? state.page : state.view,
      beforeCardVisible: state.beforeCardVisible,
      pages: PAGES,
      availableModes: Object.values(BREATHING_METHODS).map((availableMethod) => ({
        ...availableMethod,
        defaultMinutes: getModeDuration(availableMethod.id)
      })),
      customSettings: { ...state.customSettings },
      focusDurationLabel: `${state.durationMinutes} 分钟`,
      focusActions: getFocusActions(),
      stats: store.getStats(new Date(now()))
    };
  }

  function start() {
    if (state.status === 'running') return getSnapshot();
    state.page = 'meditation';
    state.view = 'focus';
    if (state.status === 'completed') {
      state.elapsedBeforeRun = 0;
      state.lastCueKey = '';
    }
    state.status = 'running';
    state.runStartedAt = now();
    cuePlayer.unlock?.();
    if (state.soundEnabled) {
      cuePlayer.startBackground?.();
    }
    return sync();
  }

  function pause() {
    if (state.status === 'running') {
      state.elapsedBeforeRun = elapsedSeconds();
      state.status = 'paused';
      cuePlayer.pauseBackground?.();
    }
    return getSnapshot();
  }

  function reset() {
    resetTiming();
    return getSnapshot();
  }

  function selectMode(methodId) {
    state.method = BREATHING_METHODS[methodId] ?? state.method;
    state.durationMinutes = getModeDuration(state.method.id);
    state.page = 'meditation';
    state.view = state.method.id === 'custom' ? 'custom' : 'focus';
    if (state.method.id === 'custom') {
      state.customSettings.durationMinutes = state.durationMinutes;
    }
    resetTiming();
    return getSnapshot();
  }

  function setDuration(minutes) {
    state.durationMinutes = normalizeMinutes(minutes, getModeDuration(state.method.id));
    state.methodDurations[state.method.id] = state.durationMinutes;
    if (state.method.id === 'custom') {
      state.customSettings.durationMinutes = state.durationMinutes;
    }
    reset();
    return getSnapshot();
  }

  function setModeDuration(methodId, minutes) {
    const method = BREATHING_METHODS[methodId];
    if (!method) return getSnapshot();
    const nextMinutes = normalizeMinutes(minutes, getModeDuration(methodId));
    state.methodDurations[methodId] = nextMinutes;
    if (methodId === 'custom') {
      state.customSettings.durationMinutes = nextMinutes;
    }
    if (state.method.id === methodId) {
      state.durationMinutes = nextMinutes;
      resetTiming();
    }
    return getSnapshot();
  }

  function setCustomPhase(kind, seconds) {
    if (!CUSTOM_PHASE_KEYS.includes(kind)) return getSnapshot();
    state.customSettings[kind] = clampSeconds(seconds);
    return getSnapshot();
  }

  function setCustomCycleTotal(seconds) {
    const cycleSeconds = clampCycleSeconds(seconds);
    const nextValues = distributeCycleSeconds(
      CUSTOM_PHASE_KEYS.map((key) => state.customSettings[key]),
      cycleSeconds
    );
    CUSTOM_PHASE_KEYS.forEach((key, index) => {
      state.customSettings[key] = nextValues[index];
    });
    return getSnapshot();
  }

  function setCustomDuration(minutes) {
    state.customSettings.durationMinutes = normalizeMinutes(minutes, state.customSettings.durationMinutes);
    state.methodDurations.custom = state.customSettings.durationMinutes;
    state.durationMinutes = state.customSettings.durationMinutes;
    return getSnapshot();
  }

  function startCustomSession() {
    state.method = BREATHING_METHODS.custom;
    state.durationMinutes = state.customSettings.durationMinutes;
    state.methodDurations.custom = state.durationMinutes;
    state.page = 'meditation';
    state.view = 'focus';
    return start();
  }

  function setPage(page) {
    if (!PAGES.some((item) => item.id === page)) return getSnapshot();
    if (state.page === 'meditation' && ['focus', 'custom'].includes(state.view)) {
      resetTiming();
    }
    state.page = page;
    state.view = page === 'records' ? 'records' : 'modeSelection';
    return getSnapshot();
  }

  function openGuide() {
    if (state.page === 'meditation' && ['focus', 'custom'].includes(state.view)) {
      resetTiming();
    }
    state.page = 'guide';
    state.view = 'guide';
    return getSnapshot();
  }

  function dismissBeforeCard() {
    state.beforeCardVisible = false;
    return getSnapshot();
  }

  function backToModes() {
    state.page = 'meditation';
    state.view = 'modeSelection';
    resetTiming();
    return getSnapshot();
  }

  function endSession() {
    if (state.page === 'meditation' && state.view === 'focus' && ['running', 'paused'].includes(state.status)) {
      saveSessionRecord(elapsedSeconds());
    }
    return backToModes();
  }

  function setMethod(methodId) {
    return selectMode(methodId);
  }

  function setTab(tab) {
    if (tab === 'records') return setPage('records');
    return setPage('meditation');
  }

  function getFocusActions() {
    if (state.page !== 'meditation' || state.view !== 'focus') return [];
    if (state.status === 'running') return ['pause', 'end'];
    if (state.status === 'paused') return ['resume', 'end'];
    if (state.status === 'completed') return ['start', 'end'];
    return ['start'];
  }

  function resetTiming() {
    state.status = 'idle';
    state.elapsedBeforeRun = 0;
    state.runStartedAt = 0;
    state.lastCueKey = '';
    cuePlayer.stopBackground?.();
    return getSnapshot();
  }

  function toggleControls() {
    state.controlsOpen = !state.controlsOpen;
    return getSnapshot();
  }

  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    if (state.status === 'running') {
      if (state.soundEnabled) {
        cuePlayer.startBackground?.();
      } else {
        cuePlayer.stopBackground?.();
      }
    }
    return getSnapshot();
  }

  function completeSession() {
    if (state.status === 'completed') return;
    state.status = 'completed';
    state.elapsedBeforeRun = totalSeconds();
    saveSessionRecord(totalSeconds());
    cuePlayer.stopBackground?.();
    cuePlayer.play?.('complete');
  }

  function saveSessionRecord(durationSeconds) {
    const actualSeconds = Math.max(0, Math.floor(durationSeconds));
    if (actualSeconds <= 0) return;
    const method = getActiveMethod();
    store.addCompletedSession(
      { methodId: method.id, methodTitle: method.title, durationSeconds: actualSeconds },
      new Date(now())
    );
  }

  function cueIfNeeded(phase) {
    if (!state.soundEnabled || phase.isComplete) return;
    const key = phaseCueKey(getActiveMethod(), phase);
    if (key !== state.lastCueKey) {
      state.lastCueKey = key;
      cuePlayer.play?.(phase.kind);
    }
  }

  function getActiveMethod() {
    if (state.method.id === 'custom') return getCustomMethod(state.customSettings);
    return state.method;
  }

  function getModeDuration(methodId) {
    return state.methodDurations[methodId] ?? BREATHING_METHODS[methodId]?.defaultMinutes ?? state.durationMinutes;
  }

  return {
    getSnapshot,
    sync,
    start,
    pause,
    reset,
    setMethod,
    selectMode,
    setDuration,
    setModeDuration,
    setCustomPhase,
    setCustomCycleTotal,
    setCustomDuration,
    startCustomSession,
    setTab,
    setPage,
    openGuide,
    dismissBeforeCard,
    backToModes,
    endSession,
    toggleControls,
    toggleSound,
    getRecords: store.getRecords
  };
}

function getCustomMethod(settings) {
  return {
    ...BREATHING_METHODS.custom,
    rhythmLabel: `${settings.inhale}-${settings.hold}-${settings.exhale}`,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: settings.inhale },
      { kind: 'hold', label: '屏息', durationSeconds: settings.hold },
      { kind: 'exhale', label: '呼气', durationSeconds: settings.exhale }
    ]
  };
}

function clampSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return 1;
  return Math.max(1, Math.min(12, Math.round(seconds)));
}

function clampCycleSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return CUSTOM_PHASE_KEYS.length;
  return Math.max(CUSTOM_PHASE_KEYS.length, Math.min(CUSTOM_PHASE_KEYS.length * 12, Math.round(seconds)));
}

function distributeCycleSeconds(values, targetTotal) {
  const normalized = values.map(clampSeconds);
  const currentTotal = normalized.reduce((sum, value) => sum + value, 0) || CUSTOM_PHASE_KEYS.length;
  const rawValues = normalized.map((value) => (value * targetTotal) / currentTotal);
  const nextValues = rawValues.map((value) => clampSeconds(value));
  let difference = targetTotal - nextValues.reduce((sum, value) => sum + value, 0);

  while (difference !== 0) {
    const direction = difference > 0 ? 1 : -1;
    const candidates = nextValues
      .map((value, index) => ({
        index,
        value,
        score: direction > 0 ? rawValues[index] - value : value - rawValues[index]
      }))
      .filter((item) => (direction > 0 ? item.value < 12 : item.value > 1))
      .sort((a, b) => b.score - a.score || a.index - b.index);

    if (!candidates.length) break;
    nextValues[candidates[0].index] += direction;
    difference -= direction;
  }

  return nextValues;
}

function createNoopCuePlayer() {
  return {
    unlock() {},
    startBackground() {},
    pauseBackground() {},
    stopBackground() {},
    play() {}
  };
}

function phaseCueKey(method, phase) {
  const cycleSeconds = method.phases.reduce((sum, item) => sum + item.durationSeconds, 0);
  const cycleIndex = Math.floor(phase.elapsedSeconds / cycleSeconds);
  return `${cycleIndex}-${phase.phaseIndex}-${phase.kind}`;
}
