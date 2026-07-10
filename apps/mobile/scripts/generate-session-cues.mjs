import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { CUE_SHAPES, renderCueWaveform } from './cue-waveform.mjs';

const AUDIO_DIRECTORY = new URL('../assets/audio/', import.meta.url);

export async function generateSessionCues() {
  await mkdir(AUDIO_DIRECTORY, { recursive: true });

  await Promise.all(
    Object.entries(CUE_SHAPES).map(([kind, shape]) =>
      writeFile(
        new URL(`${kind}.wav`, AUDIO_DIRECTORY),
        renderCueWaveform(shape)
      )
    )
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (invokedPath === import.meta.url) {
  await generateSessionCues();
}
