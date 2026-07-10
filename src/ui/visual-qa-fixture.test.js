import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { createMeditationState } from './app-state.js';
import {
  VISUAL_QA_FIXTURE,
  VISUAL_QA_STATE_IDS,
  WEB_REFERENCE_STATE_IDS,
  createVisualQaReadyPayload,
  resolveVisualQaRequest,
  scheduleVisualQaReady
} from './visual-qa-fixture.js';

const LOOPBACK_ROOT = 'http://127.0.0.1:60323/?visualQaState=';
const EXPECTED_STATE_IDS = [
  'practice',
  'guide',
  'custom',
  'session-ready',
  'session-inhale',
  'session-hold',
  'session-exhale',
  'session-paused',
  'session-completed',
  'records-empty',
  'records-populated',
  'login',
  'register'
];
const EXPECTED_WEB_REFERENCE_IDS = EXPECTED_STATE_IDS.slice(0, 11);

describe('Web visual QA fixture request', () => {
  test('uses the exact 13-state whitelist and maps every supported Web state', () => {
    assert.deepEqual(VISUAL_QA_STATE_IDS, EXPECTED_STATE_IDS);
    assert.deepEqual(WEB_REFERENCE_STATE_IDS, EXPECTED_WEB_REFERENCE_IDS);

    const expectedViews = {
      practice: ['meditation', 'modeSelection'],
      guide: ['guide', 'guide'],
      custom: ['meditation', 'custom'],
      'session-ready': ['meditation', 'focus'],
      'session-inhale': ['meditation', 'focus'],
      'session-hold': ['meditation', 'focus'],
      'session-exhale': ['meditation', 'focus'],
      'session-paused': ['meditation', 'focus'],
      'session-completed': ['meditation', 'focus'],
      'records-empty': ['records', 'records'],
      'records-populated': ['records', 'records']
    };

    for (const stateId of WEB_REFERENCE_STATE_IDS) {
      const request = resolveVisualQaRequest(`${LOOPBACK_ROOT}${stateId}`);
      assert.equal(request.kind, 'reference');
      assert.equal(request.stateId, stateId);
      assert.equal(request.appOptions.staticRendering, true);
      assert.equal(request.appOptions.now(), Date.parse(VISUAL_QA_FIXTURE.now));
      assert.deepEqual(
        [request.appOptions.initialization.page, request.appOptions.initialization.view],
        expectedViews[stateId]
      );
      assert.ok(request.manifest.primaryElementIds.length > 0);
      assert.ok(request.manifest.textElementIds.length > 0);
    }
  });

  test('initializes every fixed session snapshot exactly without advancing time', () => {
    for (const stateId of WEB_REFERENCE_STATE_IDS.filter((id) => id.startsWith('session-'))) {
      const request = resolveVisualQaRequest(`${LOOPBACK_ROOT}${stateId}`);
      const state = createMeditationState(request.appOptions);
      const snapshot = state.getSnapshot();
      const expected = VISUAL_QA_FIXTURE.states[stateId].session;
      const boxMethod = VISUAL_QA_FIXTURE.api.methods.find(
        (method) => method.id === 'box'
      );
      const expectedVisualTimeMs =
        stateId === 'session-ready' || stateId === 'session-completed'
          ? 0
          : expected.phaseProgress *
            boxMethod.phases[snapshot.phase.phaseIndex].durationSeconds *
            1_000;

      assert.equal(snapshot.status, expected.status, stateId);
      assert.equal(snapshot.phase.kind, expected.phaseKind, stateId);
      assert.equal(snapshot.phase.phaseProgress, expected.phaseProgress, stateId);
      assert.equal(snapshot.phase.elapsedSeconds, expected.elapsedSeconds, stateId);
      assert.equal(snapshot.remainingInSession, expected.remainingSeconds, stateId);
      assert.equal(
        snapshot.durationMinutes,
        VISUAL_QA_FIXTURE.preferences.durationOverrides.box,
        stateId
      );
      assert.equal(snapshot.method.id, 'box', stateId);
      assert.equal(
        request.appOptions.visualTimeMs,
        expectedVisualTimeMs,
        stateId
      );
    }
  });

  test('seeds merged records with fixed +08 calendar semantics even under TZ=UTC', () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const emptyRequest = resolveVisualQaRequest(`${LOOPBACK_ROOT}records-empty`);
      const populatedRequest = resolveVisualQaRequest(
        `${LOOPBACK_ROOT}records-populated`
      );
      const empty = createMeditationState(emptyRequest.appOptions).getSnapshot();
      const populated = createMeditationState(
        populatedRequest.appOptions
      ).getSnapshot();
      const fixtureSession = VISUAL_QA_FIXTURE.api.sessions.populated[0];

      assert.equal(populatedRequest.appOptions.dateAdapter.timeZoneOffsetMinutes, 480);
      assert.equal(
        populatedRequest.appOptions.dateAdapter.dateKey(
          new Date('2026-07-09T17:00:00.000Z')
        ),
        '2026-07-10'
      );
      assert.equal(empty.stats.totalSessions, 0);
      assert.equal(empty.stats.completedSeconds, 0);
      assert.equal(populated.stats.totalSessions, 2);
      assert.equal(populated.stats.completedSeconds, 420);
      assert.equal(populated.stats.weeklySeconds, 420);
      assert.equal(populated.stats.currentStreak, 2);
      assert.deepEqual(
        populated.stats.calendarDays.slice(-2).map((day) => ({
          key: day.key,
          durationSeconds: day.durationSeconds
        })),
        [
          { key: '2026-07-09', durationSeconds: 120 },
          { key: '2026-07-10', durationSeconds: 300 }
        ]
      );
      assert.deepEqual(populated.stats.recentRecords[0], {
        id: fixtureSession.id,
        methodId: fixtureSession.methodId,
        methodTitle: fixtureSession.methodTitleSnapshot,
        minutes: 5,
        durationSeconds: fixtureSession.actualDurationSeconds,
        completedAt: fixtureSession.endedAt,
        completedDateLabel: '7月10日',
        durationLabel: '5 分钟'
      });
      assert.deepEqual(populated.stats.recentRecords[1], {
        id: VISUAL_QA_FIXTURE.preferences.localSessionLedger[0].clientSessionId,
        methodId: null,
        methodTitle: '自定义',
        minutes: 2,
        durationSeconds: 120,
        completedAt: '2026-07-09T04:02:00.000Z',
        completedDateLabel: '7月9日',
        durationLabel: '2 分钟'
      });
    } finally {
      process.env.TZ = originalTimezone;
    }
  });

  test('keeps normal mode untouched and rejects non-loopback or malformed fixture queries', () => {
    assert.deepEqual(resolveVisualQaRequest('http://127.0.0.1:60323/'), {
      kind: 'normal'
    });
    assert.deepEqual(
      resolveVisualQaRequest('https://127.0.0.1/?visualQaState=practice'),
      { kind: 'normal' }
    );
    assert.deepEqual(
      resolveVisualQaRequest('http://example.com/?visualQaState=practice'),
      { kind: 'normal' }
    );
    assert.deepEqual(
      resolveVisualQaRequest('http://127.0.0.1:60323/#visualQaState=practice'),
      { kind: 'normal' }
    );

    assert.deepEqual(
      resolveVisualQaRequest(
        'http://127.0.0.1:60323/?visualQaState='
      ),
      {
        kind: 'invalid',
        stateId: '',
        reason:
          'Visual QA fixture URLs require exactly one visualQaState value.'
      }
    );

    const unknown = resolveVisualQaRequest(
      'http://127.0.0.1:60323/?visualQaState=future-state'
    );
    assert.equal(unknown.kind, 'invalid');
    assert.equal(unknown.stateId, 'future-state');
    assert.match(unknown.reason, /Unknown visual QA state/);

    const duplicate = resolveVisualQaRequest(
      'http://127.0.0.1:60323/?visualQaState=practice&visualQaState=guide'
    );
    assert.equal(duplicate.kind, 'invalid');
    assert.match(duplicate.reason, /exactly one visualQaState/);
  });

  test('marks login and register native-only instead of returning Web reference options', () => {
    for (const stateId of ['login', 'register']) {
      assert.deepEqual(resolveVisualQaRequest(`${LOOPBACK_ROOT}${stateId}`), {
        kind: 'native-only',
        stateId,
        reason: `${stateId} has no approved Web reference; capture it natively only.`
      });
    }
  });

  test('measures the complete manifest with Web rect and font metadata', () => {
    const { document, window } = createMetricsDocument();
    const payload = createVisualQaReadyPayload({
      document,
      manifest: {
        primaryElementIds: ['panel', 'title'],
        textElementIds: ['title']
      },
      stateId: 'practice',
      pixelRatio: 1
    });

    assert.deepEqual(payload, {
      marker: 'VISUAL_QA_READY',
      state: 'practice',
      pixelRatio: 1,
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      elements: {
        panel: { x: 12, y: 34, width: 300, height: 120 },
        title: {
          x: 24,
          y: 48,
          width: 160,
          height: 48,
          fontFamily: 'Fixture Sans',
          fontWeight: '700',
          fontSize: 20,
          lineHeight: 24,
          lines: 2
        }
      }
    });

    document.querySelector('[data-od-id="panel"]').insertAdjacentHTML(
      'afterend',
      '<div data-od-id="panel"></div>'
    );
    assert.throws(
      () => createVisualQaReadyPayload({
        document,
        manifest: {
          primaryElementIds: ['panel'],
          textElementIds: []
        },
        stateId: 'practice',
        pixelRatio: window.devicePixelRatio
      }),
      /panel must appear exactly once; found 2/
    );
    assert.throws(
      () => createVisualQaReadyPayload({
        document,
        manifest: {
          primaryElementIds: ['missing'],
          textElementIds: []
        },
        stateId: 'practice',
        pixelRatio: 1
      }),
      /missing must appear exactly once; found 0/
    );
  });

  test('publishes READY only after exactly two animation frames', () => {
    const { document, window } = createMetricsDocument();
    const frames = [];
    const readyPayloads = [];
    const errors = [];
    scheduleVisualQaReady({
      document,
      window,
      manifest: {
        primaryElementIds: ['panel'],
        textElementIds: []
      },
      stateId: 'practice',
      requestAnimationFrame: (callback) => frames.push(callback),
      onReady: (payload) => readyPayloads.push(payload),
      onError: (payload) => errors.push(payload)
    });

    assert.equal(frames.length, 1);
    assert.equal(readyPayloads.length, 0);
    frames.shift()(16);
    assert.equal(frames.length, 1);
    assert.equal(readyPayloads.length, 0);
    frames.shift()(32);
    assert.equal(frames.length, 0);
    assert.equal(readyPayloads.length, 1);
    assert.equal(readyPayloads[0].marker, 'VISUAL_QA_READY');
    assert.deepEqual(errors, []);

    const failureFrames = [];
    scheduleVisualQaReady({
      document,
      window,
      manifest: {
        primaryElementIds: ['missing'],
        textElementIds: []
      },
      stateId: 'practice',
      requestAnimationFrame: (callback) => failureFrames.push(callback),
      onReady: (payload) => readyPayloads.push(payload),
      onError: (payload) => errors.push(payload)
    });
    failureFrames.shift()(48);
    failureFrames.shift()(64);
    assert.equal(readyPayloads.length, 1);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].marker, 'VISUAL_QA_ERROR');
    assert.equal(errors[0].kind, 'measurement-failed');
    assert.match(errors[0].reason, /missing must appear exactly once; found 0/);
  });
});

function createMetricsDocument() {
  const dom = new JSDOM(
    '<!doctype html><style>#title { font-family: "Fixture Sans"; font-weight: 700; font-size: 20px; line-height: 24px; }</style><div data-od-id="panel"></div><div id="title" data-od-id="title">two lines</div>',
    { pretendToBeVisual: true }
  );
  const document = dom.window.document;
  document.querySelector('[data-od-id="panel"]').getBoundingClientRect = () => ({
    x: 12, y: 34, left: 12, top: 34, width: 300, height: 120
  });
  document.querySelector('[data-od-id="title"]').getBoundingClientRect = () => ({
    x: 24, y: 48, left: 24, top: 48, width: 160, height: 48
  });
  return { document, window: dom.window };
}
