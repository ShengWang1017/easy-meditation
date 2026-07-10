import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import sharp from 'sharp';

import {
  buildAndroidCaptureCommands,
  buildIosCaptureCommands,
  executeNativeCapturePlan,
  main as runNativeCli,
  normalizeNative,
  parseNativeCliArgs,
  parseReadyLine,
  waitForReady,
  writeReadyMetrics
} from './capture-native.mjs';

const READY_PAYLOAD = {
  marker: 'VISUAL_QA_READY',
  state: 'practice',
  pixelRatio: 3,
  safeArea: { top: 47, right: 0, bottom: 34, left: 0 },
  elements: {
    'training-header': { x: 24, y: 55, width: 342, height: 50 },
    'training-intro': { x: 24, y: 151, width: 342, height: 33 },
    'mode-grid': { x: 24, y: 206, width: 342, height: 371 },
    'before-card': { x: 34, y: 601, width: 322, height: 112 },
    'bottom-nav': { x: 110, y: 746, width: 170, height: 42 },
    'training-title': {
      x: 119,
      y: 58,
      width: 152,
      height: 38,
      fontFamily: 'LXGWWenKai-Medium',
      fontWeight: 800,
      fontSize: 32,
      lineHeight: 38,
      lines: 1
    },
    'training-intro-copy': {
      x: 24,
      y: 151,
      width: 342,
      height: 33,
      fontFamily: 'LXGWWenKai-Medium',
      fontWeight: 800,
      fontSize: 26,
      lineHeight: 33,
      lines: 1
    }
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

test('requires every manifest element with non-negative finite rectangles', () => {
  const missing = structuredClone(READY_PAYLOAD);
  delete missing.elements['before-card'];
  assert.throws(
    () => parseReadyLine(JSON.stringify(missing), 'practice'),
    /VISUAL_QA_READY practice missing required element: before-card/
  );

  const negative = structuredClone(READY_PAYLOAD);
  negative.elements['mode-grid'].x = -1;
  assert.throws(
    () => parseReadyLine(JSON.stringify(negative), 'practice'),
    /VISUAL_QA_READY elements\.mode-grid\.x must be finite and non-negative/
  );
});

test('requires complete typography metadata for every text manifest ID', () => {
  const missingFamily = structuredClone(READY_PAYLOAD);
  delete missingFamily.elements['training-title'].fontFamily;
  assert.throws(
    () => parseReadyLine(JSON.stringify(missingFamily), 'practice'),
    /VISUAL_QA_READY text training-title\.fontFamily is required/
  );

  const invalidSize = structuredClone(READY_PAYLOAD);
  invalidSize.elements['training-title'].fontSize = null;
  assert.throws(
    () => parseReadyLine(JSON.stringify(invalidSize), 'practice'),
    /VISUAL_QA_READY text training-title\.fontSize must be finite and positive/
  );

  const invalidLines = structuredClone(READY_PAYLOAD);
  invalidLines.elements['training-title'].lines = 0;
  assert.throws(
    () => parseReadyLine(JSON.stringify(invalidLines), 'practice'),
    /VISUAL_QA_READY text training-title\.lines must be a positive integer/
  );
});

test('polling propagates malformed matching READY payloads immediately', async () => {
  const malformed = structuredClone(READY_PAYLOAD);
  delete malformed.elements['bottom-nav'];
  let sleeps = 0;
  await assert.rejects(
    waitForReady({
      state: 'practice',
      readLog: async () => JSON.stringify(malformed),
      now: () => 0,
      sleep: async () => {
        sleeps += 1;
      }
    }),
    /VISUAL_QA_READY practice missing required element: bottom-nav/
  );
  assert.equal(sleeps, 0);
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
        rawScreenshotPath: '/tmp/android.png'
      }),
    /Android serial is required/
  );

  const commands = buildAndroidCaptureCommands({
    serial: 'emulator-5554',
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    rawScreenshotPath: '/tmp/android.png'
  });
  assert.deepEqual(commands.readTimestamp, {
    command: 'adb',
    args: [
      '-s',
      'emulator-5554',
      'shell',
      'date',
      '+%m-%d %H:%M:%S.000'
    ]
  });
  assert.deepEqual(commands.launch.args.slice(0, 2), ['-s', 'emulator-5554']);
  assert.equal(commands.screenshot.stdoutPath, '/tmp/android.png');
  assert.equal(JSON.stringify(commands).includes('logcat","-c'), false);
  assert.equal(
    JSON.stringify(commands).includes('2026-07-10T12:00:00.000Z'),
    false
  );
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
    rawScreenshotPath: '/tmp/android.png'
  });
  const result = await executeNativeCapturePlan({
    commands,
    state: 'practice',
    adapter: {
      run: async (command) => calls.push(['run', command]),
      read: async (command) => {
        calls.push(['read', command]);
        if (command.args.includes('date')) {
          return '07-10 20:00:00.000\n';
        }
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
    ['read', 'run', 'read', 'capture']
  );
  assert.deepEqual(calls[0][1], commands.readTimestamp);
  assert.ok(calls[2][1].args.includes('-T'));
  assert.ok(calls[2][1].args.includes('07-10 20:00:00.000'));
  assert.equal(calls[2][1].args.includes('2026-07-10T12:00:00.000Z'), false);
  assert.equal(JSON.stringify(calls).includes('logcat","-c'), false);
});

test('rejects an invalid Android device timestamp before launch', async () => {
  const calls = [];
  const commands = buildAndroidCaptureCommands({
    serial: 'emulator-5554',
    nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
    rawScreenshotPath: '/tmp/android.png'
  });

  await assert.rejects(
    executeNativeCapturePlan({
      commands,
      state: 'practice',
      adapter: {
        read: async (command) => {
          calls.push(['read', command]);
          return '2026-07-10T12:00:00.000Z';
        },
        run: async (command) => calls.push(['run', command]),
        capture: async (command) => calls.push(['capture', command])
      }
    }),
    /Android device log timestamp must use MM-DD HH:MM:SS\.mmm/
  );
  assert.deepEqual(calls.map(([kind]) => kind), ['read']);
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
      '--raw',
      '/tmp/raw.png',
      '--output',
      '/tmp/logical.png',
      '--metrics',
      '/tmp/native-metrics.json'
    ]),
    {
      platform: 'android',
      selector: 'emulator-5554',
      state: 'practice',
      nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
      since: null,
      rawScreenshotPath: '/tmp/raw.png',
      outputPath: '/tmp/logical.png',
      metricsPath: '/tmp/native-metrics.json'
    }
  );

  assert.throws(
    () =>
      parseNativeCliArgs([
        'ios',
        '--udid',
        '00008110-001234567890001E',
        '--state',
        'practice',
        '--url',
        'easy-meditation:///practice?visualQaState=practice',
        '--raw',
        '/tmp/raw.png',
        '--output',
        '/tmp/logical.png',
        '--metrics',
        '/tmp/native-metrics.json'
      ]),
    /Missing required native capture argument: --since/
  );
});

test('requires an explicit absolute JSON metrics path', () => {
  const completeWithoutMetrics = [
    'ios',
    '--udid',
    '00008110-001234567890001E',
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
  ];
  assert.throws(
    () => parseNativeCliArgs(completeWithoutMetrics),
    /Missing required native capture argument: --metrics/
  );
  assert.throws(
    () =>
      parseNativeCliArgs([
        ...completeWithoutMetrics,
        '--metrics',
        'relative.json'
      ]),
    /Native metrics output must be an absolute JSON path/
  );
});

test('writes deterministic READY metrics and creates the parent directory', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-metrics-'));
  try {
    const metricsPath = path.join(directory, 'nested', 'native-metrics.json');
    await writeReadyMetrics(metricsPath, READY_PAYLOAD);
    assert.equal(
      await readFile(metricsPath, 'utf8'),
      `${JSON.stringify(READY_PAYLOAD, null, 2)}\n`
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('native CLI prepares fresh raw, normalized, and metrics directories before capture', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-cli-'));
  const rawPath = path.join(directory, 'raw', 'android', 'practice.png');
  const outputPath = path.join(
    directory,
    'normalized',
    'android',
    'practice.png'
  );
  const metricsPath = path.join(
    directory,
    'metrics',
    'android',
    'practice.json'
  );
  const calls = [];
  try {
    const result = await runNativeCli(
      [
        'android',
        '--serial',
        'emulator-5554',
        '--state',
        'practice',
        '--url',
        'easy-meditation:///practice?visualQaState=practice',
        '--raw',
        rawPath,
        '--output',
        outputPath,
        '--metrics',
        metricsPath
      ],
      {
        adapter: {
          run: async () => calls.push('run'),
          read: async (command) => {
            calls.push(command.args.includes('date') ? 'timestamp' : 'log');
            return command.args.includes('date')
              ? '07-10 20:00:00.000\n'
              : JSON.stringify(READY_PAYLOAD);
          },
          capture: async (command) => {
            calls.push('capture');
            await access(path.dirname(rawPath));
            await access(path.dirname(outputPath));
            await access(path.dirname(metricsPath));
            await writeFile(command.stdoutPath, 'android-png-stdout');
          }
        },
        normalize: async (rawScreenshotPath, normalizedPath) => {
          calls.push('normalize');
          assert.equal(
            await readFile(rawScreenshotPath, 'utf8'),
            'android-png-stdout'
          );
          await writeFile(normalizedPath, 'normalized-png');
        }
      }
    );

    assert.deepEqual(result, READY_PAYLOAD);
    assert.deepEqual(calls, [
      'timestamp',
      'run',
      'log',
      'capture',
      'normalize'
    ]);
    assert.equal(await readFile(outputPath, 'utf8'), 'normalized-png');
    assert.equal(
      await readFile(metricsPath, 'utf8'),
      `${JSON.stringify(READY_PAYLOAD, null, 2)}\n`
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
