import { execFile as execFileCallback } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
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

function validateElements(elements) {
  if (!elements || typeof elements !== 'object' || Array.isArray(elements)) {
    throw new Error('VISUAL_QA_READY elements must be an object');
  }
  for (const [id, rect] of Object.entries(elements)) {
    for (const key of ['x', 'y', 'width', 'height']) {
      if (!Number.isFinite(rect?.[key])) {
        throw new Error(`VISUAL_QA_READY elements.${id}.${key} must be finite`);
      }
    }
  }
}

function validateReadyPayload(payload) {
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
  validateElements(payload.elements);
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
  validateReadyPayload(payload);
  return payload.state === expectedState ? payload : null;
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
  since,
  rawScreenshotPath,
  packageName = 'com.easymeditation.app'
}) {
  validateAndroidSerial(serial);
  validateNativeUrl(nativeUrl);
  validateSince(since);
  validateScreenshotPath(rawScreenshotPath);

  return {
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
    readLog: {
      command: 'adb',
      args: [
        '-s',
        serial,
        'logcat',
        '-d',
        '-v',
        'raw',
        '-T',
        since,
        'ReactNativeJS:I',
        '*:S'
      ]
    },
    screenshot: {
      command: 'adb',
      args: ['-s', serial, 'exec-out', 'screencap', '-p'],
      stdoutPath: rawScreenshotPath
    }
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
  await adapter.run(commands.launch);
  const metrics = await waitForReady({
    state,
    readLog: () => adapter.read(commands.readLog),
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
  for (const required of [
    selectorFlag,
    '--state',
    '--url',
    '--since',
    '--raw',
    '--output'
  ]) {
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

  return {
    platform,
    selector,
    state,
    nativeUrl: flags.get('--url'),
    since: flags.get('--since'),
    rawScreenshotPath: flags.get('--raw'),
    outputPath: flags.get('--output')
  };
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
  const commands =
    options.platform === 'android'
      ? buildAndroidCaptureCommands({
          serial: options.selector,
          nativeUrl: options.nativeUrl,
          since: options.since,
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
  await normalizeNative(
    options.rawScreenshotPath,
    options.outputPath,
    metrics
  );
  return metrics;
}

const directlyExecuted =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
