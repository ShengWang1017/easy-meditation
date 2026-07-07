import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createMemoryStorage } from '../domain/records.js';
import { createMeditationState } from './app-state.js';

describe('meditation state controller', () => {
  test('defaults to meditation mode selection with two primary pages', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });
    const snapshot = app.getSnapshot();

    assert.equal(snapshot.page, 'meditation');
    assert.equal(snapshot.view, 'modeSelection');
    assert.deepEqual(snapshot.pages.map((page) => page.id), ['meditation', 'records']);
    assert.deepEqual(snapshot.availableModes.map((method) => method.id), ['box', 'fourSevenEight', 'coherent', 'custom']);
  });

  test('selecting a classic mode enters focus view with start as the only primary action', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.selectMode('box');

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'meditation');
    assert.equal(snapshot.view, 'focus');
    assert.equal(snapshot.method.id, 'box');
    assert.equal(snapshot.status, 'idle');
    assert.equal(snapshot.focusDurationLabel, '3 分钟');
    assert.deepEqual(snapshot.focusActions, ['start']);
  });

  test('selecting custom mode opens a custom rhythm setup page', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.selectMode('custom');

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'meditation');
    assert.equal(snapshot.view, 'custom');
    assert.equal(snapshot.method.id, 'custom');
    assert.deepEqual(snapshot.customSettings, {
      inhale: 4,
      hold: 2,
      exhale: 5,
      durationMinutes: 5
    });
  });

  test('custom rhythm settings apply to the focused session', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.selectMode('custom');
    app.setCustomPhase('inhale', 5);
    app.setCustomPhase('hold', 3);
    app.setCustomPhase('exhale', 7);
    app.setCustomDuration(5);
    app.startCustomSession();

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.view, 'focus');
    assert.equal(snapshot.method.id, 'custom');
    assert.equal(snapshot.focusDurationLabel, '5 分钟');
    assert.deepEqual(snapshot.method.phases.map((phase) => phase.durationSeconds), [5, 3, 7]);
    assert.equal(snapshot.title, '5 分钟自定义节奏');
  });

  test('mode selection duration edits stay with each breathing mode', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.setModeDuration('box', 17);
    app.setModeDuration('custom', 42);

    let snapshot = app.getSnapshot();
    assert.equal(snapshot.availableModes.find((method) => method.id === 'box').defaultMinutes, 17);
    assert.equal(snapshot.availableModes.find((method) => method.id === 'custom').defaultMinutes, 42);

    app.selectMode('box');
    snapshot = app.getSnapshot();
    assert.equal(snapshot.focusDurationLabel, '17 分钟');
    assert.equal(snapshot.title, '17 分钟盒式呼吸');

    app.backToModes();
    app.selectMode('custom');
    snapshot = app.getSnapshot();
    assert.equal(snapshot.customSettings.durationMinutes, 42);
    assert.equal(snapshot.focusDurationLabel, '42 分钟');
  });

  test('custom cycle total redistributes the breathing phases exactly', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.selectMode('custom');
    app.setCustomCycleTotal(14);

    let snapshot = app.getSnapshot();
    assert.deepEqual(snapshot.customSettings, {
      inhale: 5,
      hold: 3,
      exhale: 6,
      durationMinutes: 5
    });
    assert.equal(snapshot.method.rhythmLabel, '5-3-6');

    app.setCustomCycleTotal(3);

    snapshot = app.getSnapshot();
    assert.deepEqual(snapshot.customSettings, {
      inhale: 1,
      hold: 1,
      exhale: 1,
      durationMinutes: 5
    });
  });

  test('ending early saves the actual practiced seconds instead of the planned minutes', () => {
    const clock = createClock();
    const cuePlayer = createFakeCuePlayer();
    const app = createMeditationState({
      storage: createMemoryStorage(),
      now: clock.now,
      cuePlayer
    });

    app.selectMode('box');
    app.start();
    clock.advance(50000);
    app.sync();

    assert.equal(app.getSnapshot().status, 'running');
    assert.deepEqual(app.getSnapshot().focusActions, ['pause', 'end']);

    app.endSession();

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'meditation');
    assert.equal(snapshot.view, 'modeSelection');
    assert.equal(snapshot.status, 'idle');
    assert.equal(snapshot.stats.totalSessions, 1);
    assert.equal(snapshot.stats.recentRecords[0].durationSeconds, 50);
    assert.notEqual(snapshot.stats.recentRecords[0].minutes, 3);
    assert.equal(cuePlayer.events.at(-1), 'stopBackground');
  });

  test('records page is the only secondary page', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.setPage('records');

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'records');
    assert.equal(snapshot.view, 'records');
  });

  test('before-you-start card can be dismissed from the mode selection page', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    assert.equal(app.getSnapshot().beforeCardVisible, true);

    app.dismissBeforeCard();

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'meditation');
    assert.equal(snapshot.view, 'modeSelection');
    assert.equal(snapshot.beforeCardVisible, false);
  });

  test('guide page opens from the training header without changing bottom nav pages', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.openGuide();

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.page, 'guide');
    assert.equal(snapshot.view, 'guide');
    assert.deepEqual(snapshot.pages.map((page) => page.id), ['meditation', 'records']);

    app.backToModes();
    assert.equal(app.getSnapshot().view, 'modeSelection');
  });

  test('starts, pauses, and resumes a box breathing session', () => {
    const clock = createClock();
    const app = createMeditationState({ storage: createMemoryStorage(), now: clock.now, audioEnabled: false });

    app.start();
    assert.equal(app.getSnapshot().phase.label, '吸气');

    clock.advance(4000);
    app.sync();
    assert.equal(app.getSnapshot().phase.label, '屏息');

    app.pause();
    clock.advance(8000);
    app.sync();
    assert.equal(app.getSnapshot().phase.label, '屏息');

    app.start();
    clock.advance(4000);
    app.sync();
    assert.equal(app.getSnapshot().phase.label, '呼气');
  });

  test('changes method and duration from controls', () => {
    const app = createMeditationState({ storage: createMemoryStorage(), audioEnabled: false });

    app.selectMode('custom');
    app.setDuration(5);

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.method.id, 'custom');
    assert.equal(snapshot.durationMinutes, 5);
    assert.equal(snapshot.title, '5 分钟自定义节奏');
  });

  test('completion saves a record and updates stats once', () => {
    const clock = createClock();
    const app = createMeditationState({
      storage: createMemoryStorage(),
      now: clock.now,
      audioEnabled: false,
      initialDurationMinutes: 2
    });

    app.start();
    clock.advance(120000);
    app.sync();
    app.sync();

    const snapshot = app.getSnapshot();
    assert.equal(snapshot.status, 'completed');
    assert.equal(snapshot.phase.label, '完成');
    assert.equal(snapshot.stats.weeklyMinutes, 2);
    assert.equal(snapshot.stats.totalSessions, 1);
    assert.equal(snapshot.stats.recentRecords[0].durationSeconds, 120);
  });

  test('plays ambient background during a session and cues only at phase transitions', () => {
    const clock = createClock();
    const cuePlayer = createFakeCuePlayer();
    const app = createMeditationState({
      storage: createMemoryStorage(),
      now: clock.now,
      cuePlayer
    });

    app.start();
    clock.advance(1000);
    app.sync();
    clock.advance(1000);
    app.sync();
    clock.advance(2000);
    app.sync();
    clock.advance(1000);
    app.sync();

    assert.deepEqual(cuePlayer.events, [
      'unlock',
      'startBackground',
      'play:inhale',
      'play:hold'
    ]);

    app.pause();
    assert.equal(cuePlayer.events.at(-1), 'pauseBackground');
  });

  test('stops ambient background when resetting or completing', () => {
    const clock = createClock();
    const cuePlayer = createFakeCuePlayer();
    const app = createMeditationState({
      storage: createMemoryStorage(),
      now: clock.now,
      cuePlayer,
      initialDurationMinutes: 2
    });

    app.start();
    app.reset();
    assert.equal(cuePlayer.events.at(-1), 'stopBackground');

    app.start();
    clock.advance(120000);
    app.sync();

    assert.deepEqual(cuePlayer.events.slice(-2), ['stopBackground', 'play:complete']);
  });
});

function createClock() {
  let time = Date.parse('2026-07-04T12:00:00+08:00');
  return {
    now: () => time,
    advance: (milliseconds) => {
      time += milliseconds;
    }
  };
}

function createFakeCuePlayer() {
  const events = [];
  return {
    events,
    unlock() {
      events.push('unlock');
    },
    startBackground() {
      events.push('startBackground');
    },
    pauseBackground() {
      events.push('pauseBackground');
    },
    stopBackground() {
      events.push('stopBackground');
    },
    play(kind) {
      events.push(`play:${kind}`);
    }
  };
}
