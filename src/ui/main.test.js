import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { bootstrapMeditationApp } from '../main.js';
import { resolveVisualQaRequest } from './visual-qa-fixture.js';

const LOOPBACK_ROOT = 'http://127.0.0.1:60323/';

describe('Web visual QA bootstrap', () => {
  test('preserves the normal app bootstrap when no valid fixture is requested', () => {
    const { window, document, root } = createDom(LOOPBACK_ROOT);
    const calls = [];
    const result = bootstrapMeditationApp({
      document,
      url: window.location.href,
      createApp: (...args) => {
        calls.push(args);
        return { kind: 'normal-app' };
      }
    });

    assert.equal(result.request.kind, 'normal');
    assert.deepEqual(result.app, { kind: 'normal-app' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 1);
    assert.equal(calls[0][0], root);
    assert.equal(window.__VISUAL_QA_READY__, undefined);
    assert.equal(window.__VISUAL_QA_ERROR__, undefined);
  });

  test('boots a reference fixture and reports its complete metrics after two frames', () => {
    const { window, document, root } = createDom(
      `${LOOPBACK_ROOT}?visualQaState=practice`
    );
    const request = resolveVisualQaRequest(window.location.href);
    const frames = [];
    const events = [];
    const logs = [];
    window.addEventListener('visual-qa-ready', (event) => {
      events.push(event.detail);
    });

    const result = bootstrapMeditationApp({
      document,
      url: window.location.href,
      requestAnimationFrame: (callback) => frames.push(callback),
      consoleTarget: {
        info: (line) => logs.push(line),
        error: (line) => logs.push(line)
      },
      createApp: (_root, options) => {
        assert.equal(options.staticRendering, true);
        installManifestElements(root, request.manifest);
        return { kind: 'fixture-app' };
      }
    });

    assert.equal(result.request.kind, 'reference');
    assert.equal(frames.length, 1);
    frames.shift()(16);
    assert.equal(events.length, 0);
    assert.equal(frames.length, 1);
    frames.shift()(32);

    assert.equal(events.length, 1);
    assert.equal(events[0].marker, 'VISUAL_QA_READY');
    assert.equal(events[0].state, 'practice');
    assert.deepEqual(
      Object.keys(events[0].elements),
      [...new Set([
        ...request.manifest.primaryElementIds,
        ...request.manifest.textElementIds
      ])]
    );
    assert.equal(window.__VISUAL_QA_READY__, events[0]);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /"marker":"VISUAL_QA_READY"/);
  });

  test('real fixture bootstrap reserves its injected RAF only for READY', () => {
    const { window, document } = createDom(
      `${LOOPBACK_ROOT}?visualQaState=session-inhale`
    );
    installThrowingGlobalSchedulers(window);
    window.HTMLCanvasElement.prototype.getContext = () => null;
    const frames = [];

    const result = bootstrapMeditationApp({
      document,
      url: window.location.href,
      requestAnimationFrame: (callback) => frames.push(callback),
      consoleTarget: { info() {}, error() {} }
    });

    assert.equal(result.request.kind, 'reference');
    assert.equal(result.app.getSnapshot().status, 'running');
    assert.equal(frames.length, 1);
    result.app.destroy();
  });

  test('renders and emits explicit errors for invalid and native-only requests without READY', () => {
    for (const [query, expectedKind] of [
      ['future-state', 'invalid'],
      ['login', 'native-only'],
      ['register', 'native-only']
    ]) {
      const { window, document, root } = createDom(
        `${LOOPBACK_ROOT}?visualQaState=${query}`
      );
      const errors = [];
      const consoleErrors = [];
      let appCalls = 0;
      let frameCalls = 0;
      window.__VISUAL_QA_READY__ = { stale: true };
      window.addEventListener('visual-qa-error', (event) => {
        errors.push(event.detail);
      });

      const result = bootstrapMeditationApp({
        document,
        url: window.location.href,
        createApp: () => {
          appCalls += 1;
        },
        requestAnimationFrame: () => {
          frameCalls += 1;
        },
        consoleTarget: {
          info() {},
          error: (line) => consoleErrors.push(line)
        }
      });

      assert.equal(result.request.kind, expectedKind);
      assert.equal(appCalls, 0);
      assert.equal(frameCalls, 0);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].marker, 'VISUAL_QA_ERROR');
      assert.equal(errors[0].kind, expectedKind);
      assert.equal(window.__VISUAL_QA_READY__, undefined);
      assert.equal(window.__VISUAL_QA_ERROR__, errors[0]);
      assert.equal(consoleErrors.length, 1);
      assert.match(root.textContent, /Visual QA fixture unavailable/);
      assert.match(root.textContent, new RegExp(query));
    }
  });
});

function createDom(url) {
  const dom = new JSDOM('<!doctype html><main id="app"></main>', {
    pretendToBeVisual: true,
    url
  });
  return {
    window: dom.window,
    document: dom.window.document,
    root: dom.window.document.querySelector('#app')
  };
}

function installManifestElements(root, manifest) {
  const textIds = new Set(manifest.textElementIds);
  for (const id of new Set([
    ...manifest.primaryElementIds,
    ...manifest.textElementIds
  ])) {
    const element = root.ownerDocument.createElement(textIds.has(id) ? 'strong' : 'div');
    element.dataset.odId = id;
    if (textIds.has(id)) {
      Object.assign(element.style, {
        fontFamily: 'Fixture Sans',
        fontWeight: '700',
        fontSize: '20px',
        lineHeight: '24px'
      });
    }
    element.getBoundingClientRect = () => ({
      x: 1,
      y: 2,
      left: 1,
      top: 2,
      width: 100,
      height: textIds.has(id) ? 24 : 80
    });
    root.append(element);
  }
}

function installThrowingGlobalSchedulers(window) {
  window.setTimeout = () => {
    throw new Error('fixture app touched global setTimeout');
  };
  window.clearTimeout = () => {
    throw new Error('fixture app touched global clearTimeout');
  };
  window.requestAnimationFrame = () => {
    throw new Error('fixture app touched global requestAnimationFrame');
  };
  window.cancelAnimationFrame = () => {
    throw new Error('fixture app touched global cancelAnimationFrame');
  };
}
