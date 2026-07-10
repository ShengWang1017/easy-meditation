import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildWebCapturePlan,
  executeWebCapturePlan
} from './capture-web.mjs';

const WEB_REFERENCE_STATES = [
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
  'records-populated'
];

test('validates loopback URL, approved viewport, state, and PNG output path', () => {
  assert.deepEqual(
    buildWebCapturePlan({
      state: 'practice',
      url: 'http://127.0.0.1:60323/?visualQaState=practice',
      viewport: '390x844',
      outputPath: '/tmp/practice.png'
    }),
    {
      state: 'practice',
      url: 'http://127.0.0.1:60323/?visualQaState=practice',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      outputPath: '/tmp/practice.png'
    }
  );

  assert.throws(
    () =>
      buildWebCapturePlan({
        state: 'practice',
        url: 'https://example.com/',
        viewport: '390x844',
        outputPath: '/tmp/practice.png'
      }),
    /Web capture URL must use loopback HTTP/
  );
  assert.throws(
    () =>
      buildWebCapturePlan({
        state: 'practice',
        url: 'http://127.0.0.1:60323/',
        viewport: '400x800',
        outputPath: '/tmp/practice.png'
      }),
    /Unsupported visual QA viewport: 400x800/
  );
  assert.throws(
    () =>
      buildWebCapturePlan({
        state: 'practice',
        url: 'http://127.0.0.1:60323/',
        viewport: '390x844',
        outputPath: '/tmp/practice.jpg'
      }),
    /Web capture output must be a PNG path/
  );
});

test('builds plans for all 11 states with approved Web references', () => {
  for (const state of WEB_REFERENCE_STATES) {
    const outputPath = `/tmp/${state}.png`;
    assert.deepEqual(
      buildWebCapturePlan({
        state,
        url: `http://127.0.0.1:60323/?visualQaState=${state}`,
        viewport: '390x844',
        outputPath
      }),
      {
        state,
        url: `http://127.0.0.1:60323/?visualQaState=${state}`,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        outputPath
      }
    );
  }
});

test('rejects login and register as native-only Web capture states', () => {
  for (const state of ['login', 'register']) {
    assert.throws(
      () =>
        buildWebCapturePlan({
          state,
          url: `http://127.0.0.1:60323/?visualQaState=${state}`,
          viewport: '390x844',
          outputPath: `/tmp/${state}.png`
        }),
      new RegExp(
        `${state} has no approved Web reference; capture it natively only`
      )
    );
  }
});

test('drives capture only through an injected Playwright-shaped adapter', async () => {
  const plan = buildWebCapturePlan({
    state: 'practice',
    url: 'http://127.0.0.1:60323/?visualQaState=practice',
    viewport: '412x915',
    outputPath: '/tmp/practice.png'
  });
  const calls = [];
  const metrics = { elements: { 'mode-grid': { x: 24, y: 180 } } };
  const result = await executeWebCapturePlan({
    plan,
    adapter: {
      open: async (options) => calls.push(['open', options]),
      waitForReady: async (state) => calls.push(['ready', state]),
      collectMetrics: async (state) => {
        calls.push(['metrics', state]);
        return metrics;
      },
      screenshot: async (outputPath) => calls.push(['screenshot', outputPath])
    }
  });

  assert.deepEqual(result, metrics);
  assert.deepEqual(calls, [
    [
      'open',
      {
        url: plan.url,
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 1
      }
    ],
    ['ready', 'practice'],
    ['metrics', 'practice'],
    ['screenshot', '/tmp/practice.png']
  ]);
});

test('direct execution fails explicitly instead of pretending a browser was captured', () => {
  const modulePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'capture-web.mjs'
  );
  const result = spawnSync(process.execPath, [modulePath], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /Web capture is unavailable in the host-only foundation; explicit browser authorization and an injected Playwright adapter are required/
  );
});
