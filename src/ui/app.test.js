import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { createMemoryStorage } from '../domain/records.js';
import { createMeditationApp } from './app.js';
import {
  WEB_REFERENCE_STATE_IDS,
  resolveVisualQaRequest
} from './visual-qa-fixture.js';

const LOOPBACK_ROOT = 'http://127.0.0.1:60323/?visualQaState=';
const originalWindow = globalThis.window;
const originalAudioContext = globalThis.AudioContext;
const originalWebkitAudioContext = globalThis.webkitAudioContext;
const openApps = [];

afterEach(() => {
  while (openApps.length > 0) openApps.pop().destroy();
  globalThis.window = originalWindow;
  restoreGlobal('AudioContext', originalAudioContext);
  restoreGlobal('webkitAudioContext', originalWebkitAudioContext);
});

describe('meditation app initialization', () => {
  test('renders every supported fixture manifest from its deterministic snapshot', () => {
    for (const stateId of WEB_REFERENCE_STATE_IDS) {
      const { window, root } = createDom();
      installThrowingGlobalSchedulers(window);
      globalThis.window = window;
      const request = resolveVisualQaRequest(`${LOOPBACK_ROOT}${stateId}`);
      const runtime = createStaticRuntime();
      const app = createMeditationApp(root, {
        ...request.appOptions,
        runtime
      });
      openApps.push(app);

      assert.equal(app.getSnapshot().view, request.appOptions.initialization.view);
      for (const id of [
        ...request.manifest.primaryElementIds,
        ...request.manifest.textElementIds
      ]) {
        assert.equal(
          root.querySelectorAll(`[data-od-id="${id}"]`).length,
          1,
          `${stateId} must render ${id} exactly once`
        );
      }
      assert.deepEqual(runtime.calls, []);
      if (stateId === 'custom') {
        const customStart = root.querySelector('[data-od-id="custom-start"]');
        assert.equal(customStart.tagName, 'BUTTON');
        assert.equal(customStart.dataset.action, 'custom-start');
        assert.ok(customStart.classList.contains('custom-start-action'));
        customStart.click();
        assert.equal(app.getSnapshot().view, 'focus');
        assert.equal(app.getSnapshot().status, 'running');
        assert.equal(app.getSnapshot().method.id, 'custom');
        assert.deepEqual(runtime.calls, []);
      }
      if (stateId === 'session-ready') {
        assert.equal(
          root.querySelector('[data-od-id="focus-title"]').tagName,
          'STRONG'
        );
        assert.equal(
          root.querySelector('[data-od-id="focus-duration"]').tagName,
          'STRONG'
        );
      }

      app.destroy();
      openApps.pop();
    }
  });

  test('keeps normal mode interactive with injected clock, storage, cues, and scheduler', () => {
    const { window, root } = createDom();
    globalThis.window = window;
    const runtime = createRuntime();
    const cueCalls = [];
    const cuePlayer = {
      unlock: () => cueCalls.push('unlock'),
      startBackground: () => cueCalls.push('background:start'),
      pauseBackground: () => cueCalls.push('background:pause'),
      stopBackground: () => cueCalls.push('background:stop'),
      play: (kind) => cueCalls.push(`play:${kind}`)
    };
    const app = createMeditationApp(root, {
      audioEnabled: true,
      cuePlayer,
      now: () => 10_000,
      runtime,
      storage: createMemoryStorage()
    });
    openApps.push(app);

    root.querySelector('[data-method="box"]').click();
    root.querySelector('[data-action="focus-start"]').click();

    assert.equal(app.getSnapshot().status, 'running');
    assert.deepEqual(cueCalls.slice(0, 3), [
      'background:stop',
      'unlock',
      'background:start'
    ]);
    assert.ok(cueCalls.includes('play:inhale'));
    assert.equal(runtime.calls.filter((call) => call === 'timeout').length, 1);
    assert.ok(runtime.calls.includes('animation-frame'));
  });

  test('renders fixed +08 record dates under a UTC host timezone', () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const { window, root } = createDom();
      globalThis.window = window;
      const request = resolveVisualQaRequest(
        `${LOOPBACK_ROOT}records-populated`
      );
      const app = createMeditationApp(root, {
        ...request.appOptions,
        runtime: createRuntime()
      });
      openApps.push(app);

      const recordDates = [...root.querySelectorAll('.record-row small')].map(
        (element) => element.textContent
      );
      assert.deepEqual(recordDates, ['7月10日', '7月9日']);
    } finally {
      process.env.TZ = originalTimezone;
    }
  });
});

function createDom() {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', {
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:60323/'
  });
  dom.window.HTMLCanvasElement.prototype.getContext = () => null;
  return {
    window: dom.window,
    root: dom.window.document.querySelector('#app')
  };
}

function createRuntime() {
  let nextId = 1;
  const calls = [];
  return {
    calls,
    now: () => 2_000,
    setTimeout: () => {
      calls.push('timeout');
      return nextId++;
    },
    clearTimeout: () => {},
    requestAnimationFrame: () => {
      calls.push('animation-frame');
      return nextId++;
    },
    cancelAnimationFrame: () => {}
  };
}

function createStaticRuntime() {
  return {
    calls: [],
    now() {
      throw new Error('static fixture read the live runtime clock');
    },
    setTimeout() {
      throw new Error('static fixture scheduled a timer');
    },
    clearTimeout() {},
    requestAnimationFrame() {
      throw new Error('static fixture scheduled an animation frame');
    },
    cancelAnimationFrame() {}
  };
}

function installThrowingGlobalSchedulers(window) {
  const ThrowingAudioContext = function ThrowingAudioContext() {
    throw new Error('static fixture touched global audio');
  };
  window.AudioContext = ThrowingAudioContext;
  window.webkitAudioContext = ThrowingAudioContext;
  globalThis.AudioContext = ThrowingAudioContext;
  globalThis.webkitAudioContext = ThrowingAudioContext;
  window.setTimeout = () => {
    throw new Error('static fixture touched the global timer');
  };
  window.clearTimeout = () => {
    throw new Error('static fixture touched the global timer');
  };
  window.requestAnimationFrame = () => {
    throw new Error('static fixture touched the global animation frame');
  };
  window.cancelAnimationFrame = () => {
    throw new Error('static fixture touched the global animation frame');
  };
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    delete globalThis[name];
  } else {
    globalThis[name] = value;
  }
}
