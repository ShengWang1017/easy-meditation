import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { getVisualQaState } from './states.mjs';

const execFile = promisify(execFileCallback);
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 250;

function validateSafeArea(safeArea) {
  const normalized = {};
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const value = safeArea?.[edge];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`VISUAL_QA_READY safeArea.${edge} must be non-negative`);
    }
    normalized[edge] = value;
  }
  return normalized;
}

function validateElements(elements, expectedState) {
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) {
    throw new Error('VISUAL_QA_READY elements must be an object');
  }
  for (const [id, rect] of Object.entries(elements)) {
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(rect?.[key]) || rect[key] < 0) {
        throw new Error(
          `VISUAL_QA_READY elements.${id}.${key} must be finite and non-negative`
        );
      }
    }
  }

  const manifest = getVisualQaState(expectedState);
  for (const id of [
    ...manifest.primaryElementIds,
    ...manifest.textElementIds
  ]) {
    if (!elements[id]) {
      throw new Error(
        `VISUAL_QA_READY ${expectedState} missing required element: ${id}`
      );
    }
  }
  for (const id of manifest.textElementIds) {
    const text = elements[id];
    if (typeof text.fontFamily !== 'string' || text.fontFamily.length === 0) {
      throw new Error(`VISUAL_QA_READY text ${id}.fontFamily is required`);
    }
    if (
      !(
        (typeof text.fontWeight === 'string' && text.fontWeight.length > 0) ||
        Number.isFinite(text.fontWeight)
      )
    ) {
      throw new Error(`VISUAL_QA_READY text ${id}.fontWeight is required`);
    }
    for (const key of ['fontSize', 'lineHeight']) {
      if (!Number.isFinite(text[key]) || text[key] <= 0) {
        throw new Error(
          `VISUAL_QA_READY text ${id}.${key} must be finite and positive`
        );
      }
    }
    if (!Number.isInteger(text.lines) || text.lines <= 0) {
      throw new Error(
        `VISUAL_QA_READY text ${id}.lines must be a positive integer`
      );
    }
  }
}

function validateReadyPayload(payload, expectedState) {
  if (payload?.marker !== 'VISUAL_QA_READY') {
    throw new Error('Invalid VISUAL_QA_READY marker');
  }
  if (typeof payload.state !== 'string') {
    throw new Error('VISUAL_QA_READY state is required');
  }
  getVisualQaState(payload.state);
  if (!Number.isFinite(payload.pixelRatio) || payload.pixelRatio <= 0) {
    throw new Error('VISUAL_QA_READY pixelRatio must be positive');
  }
  validateSafeArea(payload.safeArea);
  validateElements(payload.elements, expectedState);
  return payload;
}

export function parseReadyLine(line, expectedState) {
  getVisualQaState(expectedState);
  const markerIndex = line.indexOf('"marker":"VISUAL_QA_READY"');
  if (markerIndex < 0) {
    return null;
  }
  const jsonStart = line.lastIndexOf('{', markerIndex);
  if (jsonStart < 0) {
    throw new Error('Malformed VISUAL_QA_READY JSON');
  }

  let payload;
  try {
    payload = JSON.parse(line.slice(jsonStart));
  } catch {
    throw new Error('Malformed VISUAL_QA_READY JSON');
  }
  if (payload?.marker !== 'VISUAL_QA_READY') {
    throw new Error('Invalid VISUAL_QA_READY marker');
  }
  if (typeof payload.state !== 'string') {
    throw new Error('VISUAL_QA_READY state is required');
  }
  getVisualQaState(payload.state);
  if (payload.state !== expectedState) {
    return null;
  }
  return validateReadyPayload(payload, expectedState);
}

export async function waitForReady({
  readLog,
  state,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
  now = Date.now,
  sleep = (delayMs) =>
    new Promise((resolve) => setTimeout(resolve, delayMs))
}) {
  getVisualQaState(state);
  const startedAt = now();
  const deadline = startedAt + timeoutMs;

  while (now() < deadline) {
    const output = await readLog();
    for (const line of output.split('\n')) {
      const payload = parseReadyLine(line, state);
      if (payload) {
        return payload;
      }
    }
    const remainingMs = deadline - now();
    if (remainingMs > 0) {
      await sleep(Math.min(pollMs, remainingMs));
    }
  }

  throw new Error(
    `VISUAL_QA_READY timeout after ${timeoutMs}ms for ${state}`
  );
}

export async function normalizeNative(rawPath, outputPath, metrics) {
  if (!Number.isFinite(metrics?.pixelRatio) || metrics.pixelRatio <= 0) {
    throw new Error('Native pixelRatio must be positive');
  }
  const safeArea = validateSafeArea(metrics.safeArea);
  const metadata = await sharp(rawPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Native screenshot dimensions are unavailable');
  }
  const logicalWidth = Math.round(metadata.width / metrics.pixelRatio);
  const logicalHeight = Math.round(metadata.height / metrics.pixelRatio);
  if (
    safeArea.left + safeArea.right >= logicalWidth ||
    safeArea.top + safeArea.bottom >= logicalHeight
  ) {
    throw new Error('Native safe area removes the full logical screenshot');
  }

  // Preserve the full logical screenshot. compare.mjs owns the single
  // safe-area crop/coordinate translation so offsets cannot be applied twice.
  await sharp(rawPath)
    .resize(logicalWidth, logicalHeight, { fit: 'fill' })
    .png()
    .toFile(outputPath);

  return { logicalWidth, logicalHeight, safeArea };
}

function validateMetricsPath(metricsPath) {
  if (!path.isAbsolute(metricsPath) || path.extname(metricsPath) !== '.json') {
    throw new Error('Native metrics output must be an absolute JSON path');
  }
}

export async function writeReadyMetrics(metricsPath, metrics) {
  validateMetricsPath(metricsPath);
  await mkdir(path.dirname(metricsPath), { recursive: true });
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
}

function validateSince(since) {
  if (typeof since !== 'string' || !Number.isFinite(Date.parse(since))) {
    throw new Error('A valid since-launch timestamp is required');
  }
}

function validateNativeUrl(nativeUrl) {
  let parsed;
  try {
    parsed = new URL(nativeUrl);
  } catch {
    throw new Error('A valid easy-meditation native URL is required');
  }
  if (parsed.protocol !== 'easy-meditation:') {
    throw new Error('A valid easy-meditation native URL is required');
  }
}

function validateScreenshotPath(rawScreenshotPath) {
  if (
    !path.isAbsolute(rawScreenshotPath) ||
    path.extname(rawScreenshotPath) !== '.png'
  ) {
    throw new Error('Native raw screenshot must be an absolute PNG path');
  }
}

function validateOutputPath(outputPath) {
  if (!path.isAbsolute(outputPath) || path.extname(outputPath) !== '.png') {
    throw new Error(
      'Native normalized screenshot must be an absolute PNG path'
    );
  }
}

function validateAndroidSerial(serial) {
  if (
    typeof serial !== 'string' ||
    serial.length === 0 ||
    serial === 'booted' ||
    !/^[A-Za-z0-9._:-]+$/.test(serial)
  ) {
    throw new Error('Android serial is required');
  }
}

function validateIosUdid(udid) {
  if (
    typeof udid !== 'string' ||
    udid === 'booted' ||
    !/^(?=.{16,64}$)[0-9A-Fa-f-]+$/.test(udid)
  ) {
    throw new Error('iOS UDID is required');
  }
}

export function buildAndroidCaptureCommands({
  serial,
  nativeUrl,
  rawScreenshotPath,
  packageName = 'com.easymeditation.app'
}) {
  validateAndroidSerial(serial);
  validateNativeUrl(nativeUrl);
  validateScreenshotPath(rawScreenshotPath);

  return {
    platform: 'android',
    serial,
    readTimestamp: {
      command: 'adb',
      args: [
        '-s',
        serial,
        'shell',
        'date',
        '+%m-%d %H:%M:%S.000'
      ]
    },
    launch: {
      command: 'adb',
      args: [
        '-s',
        serial,
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        nativeUrl,
        packageName
      ]
    },
    screenshot: {
      command: 'adb',
      args: ['-s', serial, 'exec-out', 'screencap', '-p'],
      stdoutPath: rawScreenshotPath
    }
  };
}

function validateAndroidLogTimestamp(output) {
  if (typeof output !== 'string') {
    throw new Error(
      'Android device log timestamp must use MM-DD HH:MM:SS.mmm'
    );
  }
  const timestamp = output.endsWith('\r\n')
    ? output.slice(0, -2)
    : output.endsWith('\n')
      ? output.slice(0, -1)
      : output;
  if (
    !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}$/.test(
      timestamp
    )
  ) {
    throw new Error(
      'Android device log timestamp must use MM-DD HH:MM:SS.mmm'
    );
  }
  return timestamp;
}

function buildAndroidReadLogCommand(serial, deviceTimestamp) {
  validateAndroidSerial(serial);
  const timestamp = validateAndroidLogTimestamp(deviceTimestamp);
  return {
    command: 'adb',
    args: [
      '-s',
      serial,
      'logcat',
      '-d',
      '-v',
      'raw',
      '-T',
      timestamp,
      'ReactNativeJS:I',
      '*:S'
    ]
  };
}

export function buildIosCaptureCommands({
  udid,
  nativeUrl,
  since,
  rawScreenshotPath
}) {
  validateIosUdid(udid);
  validateNativeUrl(nativeUrl);
  validateSince(since);
  validateScreenshotPath(rawScreenshotPath);

  return {
    platform: 'ios',
    launch: {
      command: 'xcrun',
      args: ['simctl', 'openurl', udid, nativeUrl]
    },
    readLog: {
      command: 'xcrun',
      args: [
        'simctl',
        'spawn',
        udid,
        'log',
        'show',
        '--start',
        since,
        '--style',
        'compact',
        '--predicate',
        'eventMessage CONTAINS "VISUAL_QA_READY"'
      ]
    },
    screenshot: {
      command: 'xcrun',
      args: ['simctl', 'io', udid, 'screenshot', rawScreenshotPath]
    }
  };
}

export async function executeNativeCapturePlan({
  commands,
  state,
  adapter,
  now,
  sleep
}) {
  for (const method of ['run', 'read', 'capture']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`Native capture adapter.${method} is required.`);
    }
  }
  let readLogCommand = commands.readLog;
  if (commands.platform === 'android') {
    const deviceTimestamp = await adapter.read(commands.readTimestamp);
    readLogCommand = buildAndroidReadLogCommand(
      commands.serial,
      deviceTimestamp
    );
  }
  if (!readLogCommand) {
    throw new Error('Native capture log command is required');
  }
  await adapter.run(commands.launch);
  const metrics = await waitForReady({
    state,
    readLog: () => adapter.read(readLogCommand),
    now,
    sleep
  });
  await adapter.capture(commands.screenshot);
  return metrics;
}

function parseFlags(args) {
  const flags = new Map();
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid native capture argument: ${flag ?? '(missing)'}`);
    }
    flags.set(flag, value);
  }
  return flags;
}

export function parseNativeCliArgs(args) {
  const platform = args[0];
  if (!['android', 'ios'].includes(platform)) {
    throw new Error('Native capture platform must be android or ios');
  }
  const flags = parseFlags(args);
  const selectorFlag = platform === 'android' ? '--serial' : '--udid';
  const requiredFlags = [
    selectorFlag,
    '--state',
    '--url',
    '--raw',
    '--output',
    '--metrics'
  ];
  if (platform === 'ios') {
    requiredFlags.push('--since');
  }
  for (const required of requiredFlags) {
    if (!flags.get(required)) {
      throw new Error(`Missing required native capture argument: ${required}`);
    }
  }
  const selector = flags.get(selectorFlag);
  if (platform === 'android') {
    validateAndroidSerial(selector);
  } else {
    validateIosUdid(selector);
  }
  const state = flags.get('--state');
  getVisualQaState(state);
  const nativeUrl = flags.get('--url');
  const rawScreenshotPath = flags.get('--raw');
  const outputPath = flags.get('--output');
  const metricsPath = flags.get('--metrics');
  validateNativeUrl(nativeUrl);
  validateScreenshotPath(rawScreenshotPath);
  validateOutputPath(outputPath);
  validateMetricsPath(metricsPath);
  if (platform === 'ios') {
    validateSince(flags.get('--since'));
  }

  return {
    platform,
    selector,
    state,
    nativeUrl,
    since: platform === 'ios' ? flags.get('--since') : null,
    rawScreenshotPath,
    outputPath,
    metricsPath
  };
}

export async function prepareNativeCaptureDirectories(
  { rawScreenshotPath, outputPath, metricsPath },
  { makeDirectory = mkdir } = {}
) {
  validateScreenshotPath(rawScreenshotPath);
  validateOutputPath(outputPath);
  validateMetricsPath(metricsPath);
  const directories = new Set([
    path.dirname(rawScreenshotPath),
    path.dirname(outputPath),
    path.dirname(metricsPath)
  ]);
  await Promise.all(
    [...directories].map((directory) =>
      makeDirectory(directory, { recursive: true })
    )
  );
}

function createExecAdapter() {
  return {
    async run({ command, args }) {
      await execFile(command, args);
    },
    async read({ command, args }) {
      const { stdout } = await execFile(command, args, { encoding: 'utf8' });
      return stdout;
    },
    async capture({ command, args, stdoutPath }) {
      if (stdoutPath) {
        const { stdout } = await execFile(command, args, {
          encoding: 'buffer',
          maxBuffer: 20 * 1024 * 1024
        });
        await writeFile(stdoutPath, stdout);
        return;
      }
      await execFile(command, args);
    }
  };
}

export async function main(args, dependencies = {}) {
  const options = parseNativeCliArgs(args);
  await (dependencies.prepareDirectories ?? prepareNativeCaptureDirectories)(
    options
  );
  const commands =
    options.platform === 'android'
      ? buildAndroidCaptureCommands({
          serial: options.selector,
          nativeUrl: options.nativeUrl,
          rawScreenshotPath: options.rawScreenshotPath
        })
      : buildIosCaptureCommands({
          udid: options.selector,
          nativeUrl: options.nativeUrl,
          since: options.since,
          rawScreenshotPath: options.rawScreenshotPath
        });
  const metrics = await executeNativeCapturePlan({
    commands,
    state: options.state,
    adapter: dependencies.adapter ?? createExecAdapter()
  });
  await (dependencies.normalize ?? normalizeNative)(
    options.rawScreenshotPath,
    options.outputPath,
    metrics
  );
  await (dependencies.writeMetrics ?? writeReadyMetrics)(
    options.metricsPath,
    metrics
  );
  return metrics;
}

const directlyExecuted =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
