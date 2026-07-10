import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeFrameDurations,
  evaluateFrameGate,
  parseAndroidFrameStats,
  parseFrameInput,
  runAnalyzerCli
} from './analyze-frames.mjs';

test('calculates average FPS from total frames divided by total time', () => {
  const result = analyzeFrameDurations([10, 20, 30]);

  assert.ok(Math.abs(result.averageFps - 50) < 0.000_001);
  assert.equal(result.maxConsecutiveOver50Ms, 0);
});

test('finds the longest consecutive run strictly over 50ms', () => {
  const result = analyzeFrameDurations([51, 60, 50, 70, 80, 90, 16]);

  assert.equal(result.maxConsecutiveOver50Ms, 3);
});

test('rejects missing or invalid frame durations', () => {
  assert.throws(
    () => analyzeFrameDurations([]),
    /at least one frame duration/i
  );
  assert.throws(
    () => analyzeFrameDurations([16, 0, Number.NaN]),
    /positive finite milliseconds/i
  );
});

test('fails the performance gate below 55 FPS', () => {
  const result = evaluateFrameGate(Array.from({ length: 60 }, () => 20));

  assert.equal(result.averageFps, 50);
  assert.equal(result.maxConsecutiveOver50Ms, 0);
  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, ['average FPS 50.00 is below 55']);
});

test('fails the performance gate at three consecutive frames over 50ms', () => {
  const result = evaluateFrameGate([
    ...Array.from({ length: 60 }, () => 16),
    51,
    52,
    53
  ]);

  assert.ok(result.averageFps >= 55);
  assert.equal(result.maxConsecutiveOver50Ms, 3);
  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, [
    '3 consecutive frames exceeded 50ms; maximum allowed is 2'
  ]);
});

test('passes only when both performance gates pass', () => {
  const result = evaluateFrameGate(Array.from({ length: 60 }, () => 16));

  assert.equal(result.averageFps, 62.5);
  assert.equal(result.maxConsecutiveOver50Ms, 0);
  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test('parses a JSON millisecond array or Android framestats text', () => {
  assert.deepEqual(parseFrameInput('[16, 20.5, 33]'), [16, 20.5, 33]);

  const framestats = `
---PROFILEDATA---
Flags,IntendedVsync,FrameCompleted
0,1000000000,1016000000
1,2000000000,2017000000
0,3000000000,3020500000
---PROFILEDATA---
`;
  assert.deepEqual(parseAndroidFrameStats(framestats), [16, 20.5]);
  assert.deepEqual(parseFrameInput(framestats), [16, 20.5]);
});

test('rejects framestats without the required columns or usable rows', () => {
  assert.throws(
    () => parseAndroidFrameStats('Flags,Vsync\n0,100'),
    /Android framestats header must include Flags, IntendedVsync, and FrameCompleted/
  );
  assert.throws(
    () =>
      parseAndroidFrameStats(
        'Flags,IntendedVsync,FrameCompleted\n1,1000000000,1016000000'
      ),
    /Android framestats contains no usable frame rows/
  );
});

test('CLI writes JSON and returns zero only when the gate passes', async () => {
  const passOutput = [];
  const passCode = await runAnalyzerCli(['/tmp/frames.json'], {
    readFile: async () => JSON.stringify(Array.from({ length: 60 }, () => 16)),
    write: (value) => passOutput.push(value),
    writeError: () => assert.fail('passing input must not write stderr')
  });
  assert.equal(passCode, 0);
  assert.deepEqual(JSON.parse(passOutput.join('')), {
    averageFps: 62.5,
    maxConsecutiveOver50Ms: 0,
    pass: true,
    failures: []
  });

  const header = 'Flags,IntendedVsync,FrameCompleted';
  const rows = Array.from(
    { length: 60 },
    (_, index) => `0,${index * 20_000_000},${(index + 1) * 20_000_000}`
  );
  const failOutput = [];
  const failCode = await runAnalyzerCli(['/tmp/framestats.txt'], {
    readFile: async () => [header, ...rows].join('\n'),
    write: (value) => failOutput.push(value),
    writeError: () => assert.fail('gate failure is JSON output, not a CLI error')
  });
  assert.equal(failCode, 1);
  assert.equal(JSON.parse(failOutput.join('')).pass, false);
});

test('CLI rejects missing input with usage exit code two', async () => {
  const errors = [];
  const code = await runAnalyzerCli([], {
    readFile: async () => assert.fail('missing args must not read a file'),
    write: () => assert.fail('missing args must not write result JSON'),
    writeError: (value) => errors.push(value)
  });
  assert.equal(code, 2);
  assert.match(errors.join(''), /Usage: node analyze-frames\.mjs <input-file>/);
});
