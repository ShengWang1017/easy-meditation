export function analyzeFrameDurations(frameDurationsMs) {
  if (!Array.isArray(frameDurationsMs) || frameDurationsMs.length === 0) {
    throw new TypeError('Expected at least one frame duration.');
  }

  for (const durationMs of frameDurationsMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new TypeError('Frame durations must be positive finite milliseconds.');
    }
  }

  const totalDurationMs = frameDurationsMs.reduce(
    (total, durationMs) => total + durationMs,
    0
  );
  let currentConsecutiveOver50Ms = 0;
  let maxConsecutiveOver50Ms = 0;

  for (const durationMs of frameDurationsMs) {
    if (durationMs > 50) {
      currentConsecutiveOver50Ms += 1;
      maxConsecutiveOver50Ms = Math.max(
        maxConsecutiveOver50Ms,
        currentConsecutiveOver50Ms
      );
    } else {
      currentConsecutiveOver50Ms = 0;
    }
  }

  return {
    averageFps: (frameDurationsMs.length / totalDurationMs) * 1000,
    maxConsecutiveOver50Ms
  };
}

export function evaluateFrameGate(frameDurationsMs) {
  const analysis = analyzeFrameDurations(frameDurationsMs);
  const failures = [];

  if (analysis.averageFps < 55) {
    failures.push(`average FPS ${analysis.averageFps.toFixed(2)} is below 55`);
  }

  if (analysis.maxConsecutiveOver50Ms >= 3) {
    failures.push(
      `${analysis.maxConsecutiveOver50Ms} consecutive frames exceeded 50ms; maximum allowed is 2`
    );
  }

  return {
    ...analysis,
    pass: failures.length === 0,
    failures
  };
}

export function parseAndroidFrameStats(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Android framestats input must be text.');
  }
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const columns = line.split(',').map((column) => column.trim());
    return (
      columns.includes('Flags') &&
      columns.includes('IntendedVsync') &&
      columns.includes('FrameCompleted')
    );
  });
  if (headerIndex < 0) {
    throw new Error(
      'Android framestats header must include Flags, IntendedVsync, and FrameCompleted'
    );
  }

  const columns = lines[headerIndex]
    .split(',')
    .map((column) => column.trim());
  const flagsIndex = columns.indexOf('Flags');
  const intendedVsyncIndex = columns.indexOf('IntendedVsync');
  const frameCompletedIndex = columns.indexOf('FrameCompleted');
  const intendedVsyncTimestamps = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const values = line.split(',').map((value) => value.trim());
    if (values.length < columns.length) {
      continue;
    }
    const flags = Number(values[flagsIndex]);
    const intendedVsync = Number(values[intendedVsyncIndex]);
    const frameCompleted = Number(values[frameCompletedIndex]);
    if (
      flags !== 0 ||
      !Number.isFinite(intendedVsync) ||
      !Number.isFinite(frameCompleted)
    ) {
      continue;
    }
    intendedVsyncTimestamps.push(intendedVsync);
  }

  const durationsMs = [];
  for (let index = 1; index < intendedVsyncTimestamps.length; index += 1) {
    const durationMs =
      (intendedVsyncTimestamps[index] -
        intendedVsyncTimestamps[index - 1]) /
      1_000_000;
    if (durationMs > 0 && Number.isFinite(durationMs)) {
      durationsMs.push(durationMs);
    }
  }

  if (durationsMs.length === 0) {
    throw new Error(
      'Android framestats contains no usable frame cadence intervals'
    );
  }
  return durationsMs;
}

export function parseFrameInput(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Frame input must be text.');
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Frame duration JSON is invalid');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('Frame duration JSON must be an array');
    }
    return parsed;
  }
  return parseAndroidFrameStats(text);
}

export async function runAnalyzerCli(
  args,
  {
    readFile = (filePath) => readFileFromDisk(filePath, 'utf8'),
    write = (value) => process.stdout.write(value),
    writeError = (value) => process.stderr.write(value)
  } = {}
) {
  if (args.length !== 1) {
    writeError('Usage: node analyze-frames.mjs <input-file>\n');
    return 2;
  }
  try {
    const input = await readFile(args[0]);
    const result = evaluateFrameGate(parseFrameInput(String(input)));
    write(`${JSON.stringify(result)}\n`);
    return result.pass ? 0 : 1;
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : error}\n`);
    return 2;
  }
}

const directlyExecuted =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  process.exitCode = await runAnalyzerCli(process.argv.slice(2));
}
import { readFile as readFileFromDisk } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
