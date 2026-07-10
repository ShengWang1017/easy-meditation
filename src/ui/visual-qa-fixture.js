import fixture from '../../qa/fixtures/mobile-prototype.json' with { type: 'json' };
import { VISUAL_QA_STATES } from '../../scripts/visual-qa/states.mjs';
import {
  createFixedOffsetDateAdapter,
  createMemoryStorage
} from '../domain/records.js';

const RECORDS_STORAGE_KEY = 'easy-meditation.records.v1';
const NATIVE_ONLY_STATE_IDS = new Set(['login', 'register']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const METHOD_ID_MAP = {
  box: 'box',
  'four-seven-eight': 'fourSevenEight',
  coherent: 'coherent'
};
const FIXTURE_DATE_ADAPTER = createFixedOffsetDateAdapter(
  parseOffsetMinutes(fixture.now)
);

export const VISUAL_QA_FIXTURE = fixture;
export const VISUAL_QA_STATE_IDS = Object.freeze(
  VISUAL_QA_STATES.map(({ id }) => id)
);
export const WEB_REFERENCE_STATE_IDS = Object.freeze(
  VISUAL_QA_STATE_IDS.filter((id) => !NATIVE_ONLY_STATE_IDS.has(id))
);

validateFixtureStateWhitelist(VISUAL_QA_FIXTURE);

export function resolveVisualQaRequest(url) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { kind: 'normal' };
  }

  if (
    parsedUrl.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(parsedUrl.hostname) ||
    !parsedUrl.searchParams.has('visualQaState')
  ) {
    return { kind: 'normal' };
  }

  const values = parsedUrl.searchParams.getAll('visualQaState');
  if (values.length !== 1 || values[0].length === 0) {
    return {
      kind: 'invalid',
      stateId: values[0] ?? '',
      reason: 'Visual QA fixture URLs require exactly one visualQaState value.'
    };
  }

  const stateId = values[0];
  if (!VISUAL_QA_STATE_IDS.includes(stateId)) {
    return {
      kind: 'invalid',
      stateId,
      reason: `Unknown visual QA state: ${stateId}`
    };
  }
  if (NATIVE_ONLY_STATE_IDS.has(stateId)) {
    return {
      kind: 'native-only',
      stateId,
      reason: `${stateId} has no approved Web reference; capture it natively only.`
    };
  }

  return {
    kind: 'reference',
    stateId,
    manifest: cloneManifest(
      VISUAL_QA_STATES.find((candidate) => candidate.id === stateId)
    ),
    appOptions: createReferenceAppOptions(stateId)
  };
}

export function createVisualQaReadyPayload({
  document,
  manifest,
  stateId,
  pixelRatio = document?.defaultView?.devicePixelRatio
}) {
  if (!WEB_REFERENCE_STATE_IDS.includes(stateId)) {
    throw new Error(`Cannot report Web visual QA metrics for state: ${stateId}`);
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error('VISUAL_QA_READY pixelRatio must be positive.');
  }

  const primaryIds = manifest?.primaryElementIds ?? [];
  const textIds = new Set(manifest?.textElementIds ?? []);
  const requiredIds = [...new Set([...primaryIds, ...textIds])];
  const elements = {};

  for (const id of requiredIds) {
    const matches = document.querySelectorAll(`[data-od-id="${id}"]`);
    if (matches.length !== 1) {
      throw new Error(
        `Visual QA element ${id} must appear exactly once; found ${matches.length}.`
      );
    }
    const element = matches[0];
    const rect = measuredRect(element.getBoundingClientRect(), id);
    elements[id] = textIds.has(id)
      ? { ...rect, ...measuredTypography(element, rect, id) }
      : rect;
  }

  return {
    marker: 'VISUAL_QA_READY',
    state: stateId,
    pixelRatio,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    elements
  };
}

export function scheduleVisualQaReady({
  document,
  window,
  manifest,
  stateId,
  requestAnimationFrame = window.requestAnimationFrame.bind(window),
  onReady = (payload) => publishVisualQaReady({ window, payload }),
  onError = (payload) => publishVisualQaError({ window, payload })
}) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        onReady(
          createVisualQaReadyPayload({ document, manifest, stateId })
        );
      } catch (error) {
        onError({
          marker: 'VISUAL_QA_ERROR',
          kind: 'measurement-failed',
          state: stateId,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    });
  });
}

export function publishVisualQaReady({ window, payload, consoleTarget = window.console }) {
  delete window.__VISUAL_QA_ERROR__;
  window.__VISUAL_QA_READY__ = payload;
  window.dispatchEvent(
    new window.CustomEvent('visual-qa-ready', { detail: payload })
  );
  consoleTarget?.info?.(JSON.stringify(payload));
  return payload;
}

export function publishVisualQaError({
  window,
  payload,
  root,
  consoleTarget = window.console
}) {
  if (root) {
    root.innerHTML = `
      <section class="visual-qa-error" data-visual-qa-error="${payload.kind}">
        <h1>Visual QA fixture unavailable</h1>
        <p>${escapeHtml(payload.reason)}</p>
      </section>
    `;
  }
  delete window.__VISUAL_QA_READY__;
  window.__VISUAL_QA_ERROR__ = payload;
  window.dispatchEvent(
    new window.CustomEvent('visual-qa-error', { detail: payload })
  );
  consoleTarget?.error?.(JSON.stringify(payload));
  return payload;
}

function createReferenceAppOptions(stateId) {
  const fixtureState = VISUAL_QA_FIXTURE.states[stateId];
  const session = fixtureState.session;
  const customRhythm = VISUAL_QA_FIXTURE.preferences.customRhythm;
  const boxDurationMinutes =
    VISUAL_QA_FIXTURE.preferences.durationOverrides.box;
  const storage = createMemoryStorage();
  const records =
    stateId === 'records-populated'
      ? [
          ...VISUAL_QA_FIXTURE.api.sessions.populated.map(toWebRecord),
          ...VISUAL_QA_FIXTURE.preferences.localSessionLedger.map(
            toWebLedgerRecord
          )
        ]
      : [];
  const visualTimeMs = sessionVisualTimeMs(stateId, session);
  storage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(records));

  return {
    now: () => Date.parse(VISUAL_QA_FIXTURE.now),
    storage,
    dateAdapter: FIXTURE_DATE_ADAPTER,
    cuePlayer: createSilentCuePort(),
    runtime: createStaticRenderingRuntime(visualTimeMs),
    audioEnabled: VISUAL_QA_FIXTURE.preferences.soundEnabled,
    methods: createFixtureMethods(),
    initialization: {
      ...viewInitialization(stateId),
      methodId: stateId === 'custom' ? 'custom' : 'box',
      durationMinutes:
        stateId === 'custom'
          ? customRhythm.durationMinutes
          : boxDurationMinutes,
      methodDurations: {
        box: boxDurationMinutes
      },
      customSettings: {
        inhale: customRhythm.inhaleSeconds,
        hold: customRhythm.holdSeconds,
        exhale: customRhythm.exhaleSeconds,
        durationMinutes: customRhythm.durationMinutes
      },
      beforeCardVisible:
        !VISUAL_QA_FIXTURE.preferences.beforeStartDismissed,
      status: session?.status ?? 'idle',
      elapsedSeconds: session?.elapsedSeconds ?? 0
    },
    staticRendering: true,
    visualTimeMs
  };
}

function measuredRect(rect, id) {
  const measured = {
    x: rect.x ?? rect.left,
    y: rect.y ?? rect.top,
    width: rect.width,
    height: rect.height
  };
  for (const [key, value] of Object.entries(measured)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `Visual QA element ${id}.${key} must be finite and non-negative.`
      );
    }
    if (Object.is(value, -0)) measured[key] = 0;
  }
  return measured;
}

function measuredTypography(element, rect, id) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  const fontSize = Number.parseFloat(style.fontSize);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!style.fontFamily) {
    throw new Error(`Visual QA text ${id}.fontFamily is required.`);
  }
  if (!style.fontWeight) {
    throw new Error(`Visual QA text ${id}.fontWeight is required.`);
  }
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    throw new Error(`Visual QA text ${id}.fontSize must be positive.`);
  }
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    throw new Error(`Visual QA text ${id}.lineHeight must be positive.`);
  }
  return {
    fontFamily: stripMatchingQuotes(style.fontFamily.trim()),
    fontWeight: style.fontWeight,
    fontSize,
    lineHeight,
    lines: Math.max(1, Math.round(rect.height / lineHeight))
  };
}

function stripMatchingQuotes(value) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseOffsetMinutes(value) {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Visual QA fixture now must include an explicit UTC offset.');
  }
  const direction = match[1] === '-' ? -1 : 1;
  return direction * (Number(match[2]) * 60 + Number(match[3]));
}

function viewInitialization(stateId) {
  if (stateId === 'practice') {
    return { page: 'meditation', view: 'modeSelection' };
  }
  if (stateId === 'guide') {
    return { page: 'guide', view: 'guide' };
  }
  if (stateId === 'custom') {
    return { page: 'meditation', view: 'custom' };
  }
  if (stateId.startsWith('session-')) {
    return { page: 'meditation', view: 'focus' };
  }
  return { page: 'records', view: 'records' };
}

function createFixtureMethods() {
  const methods = Object.fromEntries(
    VISUAL_QA_FIXTURE.api.methods.map((method) => {
      const id = METHOD_ID_MAP[method.id];
      return [
        id,
        {
          id,
          category: method.category,
          title: method.title,
          rhythmLabel: method.phases
            .map((phase) => phase.durationSeconds)
            .join('-'),
          subtitle: method.subtitle,
          defaultMinutes: method.defaultDurationSeconds / 60,
          phases: method.phases.map((phase) => ({ ...phase }))
        }
      ];
    })
  );
  const custom = VISUAL_QA_FIXTURE.preferences.customRhythm;
  methods.custom = {
    id: 'custom',
    category: 'custom',
    title: custom.name,
    rhythmLabel: `${custom.inhaleSeconds}-${custom.holdSeconds}-${custom.exhaleSeconds}`,
    subtitle: '自定义呼吸节奏',
    defaultMinutes: custom.durationMinutes,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: custom.inhaleSeconds },
      { kind: 'hold', label: '屏息', durationSeconds: custom.holdSeconds },
      { kind: 'exhale', label: '呼气', durationSeconds: custom.exhaleSeconds }
    ]
  };
  return methods;
}

function toWebRecord(session) {
  return {
    id: session.id,
    methodId: session.methodId,
    methodTitle: session.methodTitleSnapshot,
    minutes: Math.round(session.actualDurationSeconds / 60),
    durationSeconds: session.actualDurationSeconds,
    completedAt: session.endedAt
  };
}

function toWebLedgerRecord(entry) {
  return {
    id: entry.clientSessionId,
    methodId: entry.methodId,
    methodTitle: entry.methodTitleSnapshot,
    minutes: Math.round(entry.actualDurationSeconds / 60),
    durationSeconds: entry.actualDurationSeconds,
    completedAt: entry.endedAt
  };
}

function sessionVisualTimeMs(stateId, session) {
  if (!session || stateId === 'session-ready' || stateId === 'session-completed') {
    return 0;
  }
  const method = VISUAL_QA_FIXTURE.api.methods.find(
    (candidate) => candidate.id === 'box'
  );
  const phase = phaseAtElapsed(method.phases, session.elapsedSeconds);
  return session.phaseProgress * phase.durationSeconds * 1_000;
}

function phaseAtElapsed(phases, elapsedSeconds) {
  const cycleSeconds = phases.reduce(
    (total, phase) => total + phase.durationSeconds,
    0
  );
  let cycleElapsed = elapsedSeconds % cycleSeconds;
  for (const phase of phases) {
    if (cycleElapsed < phase.durationSeconds) return phase;
    cycleElapsed -= phase.durationSeconds;
  }
  return phases.at(-1);
}

function createSilentCuePort() {
  return {
    unlock() {},
    startBackground() {},
    pauseBackground() {},
    stopBackground() {},
    play() {}
  };
}

function createStaticRenderingRuntime(visualTimeMs) {
  return Object.freeze({
    now: () => visualTimeMs,
    setTimeout() {
      throw new Error('Static visual QA fixtures cannot schedule timers.');
    },
    clearTimeout() {},
    requestAnimationFrame() {
      throw new Error(
        'Static visual QA fixtures cannot schedule animation frames.'
      );
    },
    cancelAnimationFrame() {}
  });
}

function cloneManifest(manifest) {
  return {
    id: manifest.id,
    primaryElementIds: [...manifest.primaryElementIds],
    textElementIds: [...manifest.textElementIds]
  };
}

function validateFixtureStateWhitelist(value) {
  const fixtureStateIds = Object.keys(value?.states ?? {});
  if (
    fixtureStateIds.length !== VISUAL_QA_STATE_IDS.length ||
    !VISUAL_QA_STATE_IDS.every(
      (stateId, index) => fixtureStateIds[index] === stateId
    )
  ) {
    throw new Error('Visual QA fixture must exactly match the 13-state whitelist.');
  }
}
