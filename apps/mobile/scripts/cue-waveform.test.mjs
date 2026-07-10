import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CUE_SHAPES,
  renderCueWaveform
} from './cue-waveform.mjs';

const EXPECTED_SHAPES = {
  inhale: { from: 392, to: 587, duration: 0.42 },
  hold: { from: 523, to: 523, duration: 0.32 },
  exhale: { from: 440, to: 294, duration: 0.5 },
  complete: { from: 440, to: 660, duration: 0.68 }
};

test('uses the approved cue shapes', () => {
  assert.deepEqual(CUE_SHAPES, EXPECTED_SHAPES);
});

test('renders deterministic mono signed-16 little-endian 44.1 kHz WAV files', () => {
  for (const [kind, shape] of Object.entries(EXPECTED_SHAPES)) {
    const waveform = renderCueWaveform(shape);
    const expectedSamples = Math.round(44_100 * shape.duration);

    assert.equal(waveform.toString('ascii', 0, 4), 'RIFF', kind);
    assert.equal(waveform.toString('ascii', 8, 12), 'WAVE', kind);
    assert.equal(waveform.readUInt16LE(22), 1, kind);
    assert.equal(waveform.readUInt32LE(24), 44_100, kind);
    assert.equal(waveform.readUInt16LE(34), 16, kind);
    assert.equal(waveform.readUInt32LE(40), expectedSamples * 2, kind);
    assert.deepEqual(renderCueWaveform(shape), waveform, kind);
  }
});

test('regenerates every committed cue byte-for-byte in memory', async () => {
  for (const [kind, shape] of Object.entries(CUE_SHAPES)) {
    const committed = await readFile(
      new URL(`../assets/audio/${kind}.wav`, import.meta.url)
    );

    assert.deepEqual(renderCueWaveform(shape), committed, kind);
  }
});
