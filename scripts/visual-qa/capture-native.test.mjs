import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import {
  buildAndroidCaptureCommands,
  buildIosCaptureCommands,
  executeNativeCapturePlan,
  normalizeNative,
  parseNativeCliArgs,
  parseReadyLine,
  waitForReady
} from './capture-native.mjs';

const READY_PAYLOAD = {
  marker: 'VISUAL_QA_READY',
  state: 'practice',
  pixelRatio: 3,
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
  elements: {
    'mode-grid': { x: 24, y: 180, width: 342, height: 371 }
  }
};

test('parses a valid READY line and ignores other states or log lines', () => {
  assert.deepEqual(
    parseReadyLine(`ReactNativeJS: ${JSON.stringify(READY_PAYLOAD)}`, 'practice'),
    READY_PAYLOAD
  );
  assert.equal(parseReadyLine('ordinary log line', 'practice'), null);
  assert.equal(
    parseReadyLine(`ReactNativeJS: ${JSON.stringify(READY_PAYLOAD)}`, 'guide'),
    null
  );
});

test('rejects malformed READY payloads explicitly', () => {
  assert.throws(
    () => parseReadyLine('ReactNativeJS: {"marker":"VISUAL_QA_READY"', 'practice'),
    /Malformed VISUAL_QA_READY JSON/
  );
  assert.throws(
    () =>
      parseReadyLine(
        JSON.stringify({ ...READY_PAYLOAD, pixelRatio: 0 }),
        'practice'
      ),
    /pixelRatio must be positive/
  );
});

test('polls injected logs until READY without using wall-clock sleeps', async () => {
  let nowMs = 0;
  let reads = 0;
  const result = await waitForReady({
    state: 'practice',
    timeoutMs: 30_000,
    pollMs: 250,
    now: () => nowMs,
    sleep: async (delayMs) => {
      nowMs += delayMs;
    },
    readLog: async () => {
      reads += 1;
      return reads === 3
        ? `prefix ${JSON.stringify(READY_PAYLOAD)}`
        : 'not ready';
    }
  });

  assert.deepEqual(result, READY_PAYLOAD);
  assert.equal(reads, 3);
  assert.equal(nowMs, 500);
});

test('times out after 30 seconds using the injected clock', async () => {
  let nowMs = 0;
  await assert.rejects(
    waitForReady({
      state: 'practice',
      timeoutMs: 30_000,
      pollMs: 10_000,
      now: () => nowMs,
      sleep: async (delayMs) => {
        nowMs += delayMs;
      },
      readLog: async () => 'not ready'
    }),
    /VISUAL_QA_READY timeout after 30000ms for practice/
  );
  assert.equal(nowMs, 30_000);
});

test('normalizes physical pixels to logical 1x while preserving the safe-area frame', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-native-'));
  try {
    const rawPath = path.join(directory, 'raw.png');
    const outputPath = path.join(directory, 'logical.png');
    await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 4,
        background: '#14283cff'
      }
    })
      .png()
      .toFile(rawPath);

    const result = await normalizeNative(rawPath, outputPath, {
      pixelRatio: 2,
      safeArea: { top: 1, right: 1, bottom: 1, left: 1 }
    });
    const metadata = await sharp(outputPath).metadata();

    assert.deepEqual(result, {
      logicalWidth: 6,
      logicalHeight: 6,
      safeArea: { top: 1, right: 1, bottom: 1, left: 1 }
    });
    assert.equal(metadata.width, 6);
    assert.equal(metadata.height, 6);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('requires explicit selectors and builds non-destructive Android argv', () => {
  assert.throws(
    () =>
      buildAndroidCaptureCommands({
        serial: '',
        nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
        since: '2026-07-10T12:00:00.000Z',
        rawScreenshotPath: '/tmp/android.png'
      }),
    /Android serial is required/
  );

  const commands = buildAndroidCaptureCommands({
    serial: 'emulator-5554',
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    since: '2026-07-10T12:00:00.000Z',
    rawScreenshotPath: '/tmp/android.png'
  });
  assert.deepEqual(commands.launch.args.slice(0, 2), ['-s', 'emulator-5554']);
  assert.deepEqual(commands.readLog.args.slice(0, 2), ['-s', 'emulator-5554']);
  assert.ok(commands.readLog.args.includes('-T'));
  assert.ok(commands.readLog.args.includes('2026-07-10T12:00:00.000Z'));
  assert.equal(commands.screenshot.stdoutPath, '/tmp/android.png');
  assert.equal(JSON.stringify(commands).includes('logcat","-c'), false);
  assert.equal(JSON.stringify(commands).includes('booted'), false);
});

test('requires an explicit UDID and builds non-destructive iOS argv', () => {
  assert.throws(
    () =>
      buildIosCaptureCommands({
        udid: 'booted',
        nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
        since: '2026-07-10T12:00:00.000Z',
        rawScreenshotPath: '/tmp/ios.png'
      }),
    /iOS UDID is required/
  );

  const udid = '00008110-001234567890001E';
  const commands = buildIosCaptureCommands({
    udid,
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    since: '2026-07-10T12:00:00.000Z',
    rawScreenshotPath: '/tmp/ios.png'
  });
  assert.deepEqual(commands.launch.args.slice(0, 3), ['simctl', 'openurl', udid]);
  assert.ok(commands.readLog.args.includes('--start'));
  assert.ok(commands.readLog.args.includes('2026-07-10T12:00:00.000Z'));
  assert.ok(commands.screenshot.args.includes(udid));
  assert.equal(JSON.stringify(commands).includes('log erase'), false);
  assert.equal(JSON.stringify(commands).includes('booted'), false);
});

test('executes a native plan only through an injected adapter', async () => {
  const calls = [];
  const commands = buildAndroidCaptureCommands({
    serial: 'emulator-5554',
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    since: '2026-07-10T12:00:00.000Z',
    rawScreenshotPath: '/tmp/android.png'
  });
  const result = await executeNativeCapturePlan({
    commands,
    state: 'practice',
    adapter: {
      run: async (command) => calls.push(['run', command]),
      read: async (command) => {
        calls.push(['read', command]);
        return JSON.stringify(READY_PAYLOAD);
      },
      capture: async (command) => calls.push(['capture', command])
    },
    now: () => 0,
    sleep: async () => {}
  });

  assert.deepEqual(result, READY_PAYLOAD);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['run', 'read', 'capture']
  );
});

test('requires complete direct-execution arguments before an adapter can run', () => {
  assert.throws(
    () => parseNativeCliArgs(['android', '--serial', 'emulator-5554']),
    /Missing required native capture argument: --state/
  );

  assert.deepEqual(
    parseNativeCliArgs([
      'android',
      '--serial',
      'emulator-5554',
      '--state',
      'practice',
      '--url',
      'easy-meditation:///practice?visualQaState=practice',
      '--since',
      '2026-07-10T12:00:00.000Z',
      '--raw',
      '/tmp/raw.png',
      '--output',
      '/tmp/logical.png'
    ]),
    {
      platform: 'android',
      selector: 'emulator-5554',
      state: 'practice',
      nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
      since: '2026-07-10T12:00:00.000Z',
      rawScreenshotPath: '/tmp/raw.png',
      outputPath: '/tmp/logical.png'
    }
  );
});
