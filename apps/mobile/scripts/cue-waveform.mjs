const SAMPLE_RATE = 44_100;
const CHANNEL_COUNT = 1;
const BITS_PER_SAMPLE = 16;
const ATTACK_SECONDS = 0.04;
const MIN_GAIN = 0.0001;
const MAX_GAIN = 0.1;

export const CUE_SHAPES = {
  inhale: {
    from: 392,
    to: 587,
    duration: 0.42
  },
  hold: {
    from: 523,
    to: 523,
    duration: 0.32
  },
  exhale: {
    from: 440,
    to: 294,
    duration: 0.5
  },
  complete: {
    from: 440,
    to: 660,
    duration: 0.68
  }
};

function exponentialRamp(start, end, progress) {
  return start * Math.pow(end / start, progress);
}

function gainAt(sampleIndex, sampleCount) {
  const attackEnd = Math.min(
    Math.round(ATTACK_SECONDS * SAMPLE_RATE),
    sampleCount - 1
  );

  if (sampleIndex <= attackEnd) {
    return exponentialRamp(
      MIN_GAIN,
      MAX_GAIN,
      attackEnd === 0 ? 1 : sampleIndex / attackEnd
    );
  }

  return exponentialRamp(
    MAX_GAIN,
    MIN_GAIN,
    (sampleIndex - attackEnd) / (sampleCount - 1 - attackEnd)
  );
}

export function renderCueWaveform({
  from,
  to,
  duration
}) {
  const sampleCount = Math.round(SAMPLE_RATE * duration);
  const dataByteLength = sampleCount * (BITS_PER_SAMPLE / 8);
  const buffer = Buffer.alloc(44 + dataByteLength);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNEL_COUNT, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNEL_COUNT * (BITS_PER_SAMPLE / 8), 28);
  buffer.writeUInt16LE(CHANNEL_COUNT * (BITS_PER_SAMPLE / 8), 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataByteLength, 40);

  let phase = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = sampleCount === 1 ? 1 : index / (sampleCount - 1);
    const frequency = exponentialRamp(from, to, progress);
    const sample = Math.sin(phase) * gainAt(index, sampleCount);
    const signedSample = Math.max(
      -32_768,
      Math.min(32_767, Math.round(sample * 32_767))
    );
    buffer.writeInt16LE(signedSample, 44 + index * 2);
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
  }

  return buffer;
}
