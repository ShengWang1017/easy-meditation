import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import {
  compareBounds,
  compareTypography,
  compareVisualArtifacts,
  validateExactChecks
} from './compare.mjs';

const ZERO_SAFE_AREA = { top: 0, right: 0, bottom: 0, left: 0 };

function createPng(width, height, color = [0, 0, 0, 255]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(png, x, y, color);
    }
  }
  return png;
}

function setPixel(png, x, y, [red, green, blue, alpha]) {
  const offset = (y * png.width + x) * 4;
  png.data[offset] = red;
  png.data[offset + 1] = green;
  png.data[offset + 2] = blue;
  png.data[offset + 3] = alpha;
}

function getPixel(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}

async function writePng(filePath, png) {
  await import('node:fs/promises').then(({ writeFile }) =>
    writeFile(filePath, PNG.sync.write(png))
  );
}

function displayTextRect(rect, overrides = {}) {
  return {
    ...rect,
    fontFamily: 'KaiTi',
    fontWeight: 800,
    fontSize: 32,
    lineHeight: 38,
    lines: 1,
    ...overrides
  };
}

test('normalizes safe-area coordinates once, center-crops horizontally, and masks text before pixelmatch', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-compare-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const nativePath = path.join(directory, 'native.png');
    const outputDirectory = path.join(directory, 'output');

    const reference = createPng(4, 4);
    setPixel(reference, 1, 1, [255, 0, 0, 255]);
    await writePng(referencePath, reference);

    // Native has one logical safe-area pixel on every edge. Its safe content
    // is six pixels wide, so horizontal center alignment crops one additional
    // pixel from each side. The title therefore lands at logical (1, 1).
    const native = createPng(8, 6, [255, 255, 255, 255]);
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 1; x <= 6; x += 1) {
        setPixel(native, x, y, [0, 0, 0, 255]);
      }
    }
    setPixel(native, 3, 2, [0, 0, 255, 255]);
    await writePng(nativePath, native);

    const result = await compareVisualArtifacts({
      state: 'practice',
      platform: 'ios',
      viewport: '390x844',
      referencePath,
      nativePath,
      outputDirectory,
      referenceMetrics: {
        safeArea: ZERO_SAFE_AREA,
        elements: {
          panel: { x: 0, y: 0, width: 4, height: 4 },
          title: displayTextRect({ x: 1, y: 1, width: 1, height: 1 })
        }
      },
      nativeMetrics: {
        safeArea: { top: 1, right: 1, bottom: 1, left: 1 },
        elements: {
          panel: { x: 2, y: 1, width: 4, height: 4 },
          title: displayTextRect(
            { x: 3, y: 2, width: 1, height: 1 },
            {
              fontFamily: 'LXGWWenKai-Medium',
              fontSize: 33.5,
              lineHeight: 39.5
            }
          )
        }
      },
      primaryElementIds: ['panel'],
      textElementIds: ['title'],
      exactChecks: { colors: true, copy: true, assets: true }
    });

    assert.deepEqual(result, {
      state: 'practice',
      platform: 'ios',
      viewport: '390x844',
      pixelDiff: { differingPixels: 0, scoredPixels: 15, ratio: 0 },
      elements: {
        panel: {
          reference: { x: 0, y: 0, width: 4, height: 4 },
          native: { x: 0, y: 0, width: 4, height: 4 },
          maxDelta: 0,
          pass: true
        }
      },
      typography: {
        title: {
          familyClassMatches: true,
          weightMatches: true,
          fontSizeDelta: 1.5,
          lineHeightDelta: 1.5,
          linesMatch: true,
          blockMaxDelta: 0,
          pass: true
        }
      },
      exactChecks: { colors: true, copy: true, assets: true },
      pass: true
    });

    // A double application of either safe-area-left or center-crop-left would
    // produce -1 here, so this assertion pins the coordinate convention.
    assert.equal(result.elements.panel.native.x, 0);

    const measurementFile = JSON.parse(
      await readFile(path.join(outputDirectory, 'measurements.json'), 'utf8')
    );
    assert.deepEqual(measurementFile, result);

    const overlay = PNG.sync.read(
      await readFile(path.join(outputDirectory, 'overlay-50.png'))
    );
    const overlayTextPixel = getPixel(overlay, 1, 1);
    assert.ok(overlayTextPixel[0] >= 126 && overlayTextPixel[0] <= 129);
    assert.ok(overlayTextPixel[2] >= 126 && overlayTextPixel[2] <= 129);

    const diff = PNG.sync.read(
      await readFile(path.join(outputDirectory, 'diff.png'))
    );
    assert.equal(diff.width, 4);
    assert.equal(diff.height, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('pixelmatch still scores differences outside masked text rectangles', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-compare-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const nativePath = path.join(directory, 'native.png');
    const outputDirectory = path.join(directory, 'output');
    const reference = createPng(4, 4);
    const native = createPng(4, 4);
    setPixel(reference, 1, 1, [255, 0, 0, 255]);
    setPixel(native, 1, 1, [0, 0, 255, 255]);
    setPixel(native, 3, 3, [0, 255, 0, 255]);
    await writePng(referencePath, reference);
    await writePng(nativePath, native);

    const metrics = {
      safeArea: ZERO_SAFE_AREA,
      elements: {
        panel: { x: 0, y: 0, width: 4, height: 4 },
        title: displayTextRect({ x: 1, y: 1, width: 1, height: 1 })
      }
    };
    const result = await compareVisualArtifacts({
      state: 'practice',
      platform: 'android',
      viewport: '390x844',
      referencePath,
      nativePath,
      outputDirectory,
      referenceMetrics: metrics,
      nativeMetrics: metrics,
      primaryElementIds: ['panel'],
      textElementIds: ['title'],
      exactChecks: { colors: true, copy: true, assets: true }
    });

    assert.equal(result.pixelDiff.differingPixels, 1);
    assert.equal(result.pixelDiff.scoredPixels, 15);
    assert.equal(result.pixelDiff.ratio, 1 / 15);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('masks the union of shifted reference and native text rectangles in both clones', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-compare-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const nativePath = path.join(directory, 'native.png');
    const reference = createPng(5, 3);
    const native = createPng(5, 3);
    setPixel(reference, 1, 1, [255, 0, 0, 255]);
    setPixel(reference, 2, 1, [255, 0, 0, 255]);
    setPixel(reference, 3, 1, [0, 255, 0, 255]);
    setPixel(native, 1, 1, [255, 255, 0, 255]);
    setPixel(native, 2, 1, [0, 0, 255, 255]);
    setPixel(native, 3, 1, [0, 0, 255, 255]);
    await writePng(referencePath, reference);
    await writePng(nativePath, native);

    const result = await compareVisualArtifacts({
      state: 'guide',
      platform: 'ios',
      viewport: '390x844',
      referencePath,
      nativePath,
      outputDirectory: path.join(directory, 'output'),
      referenceMetrics: {
        safeArea: ZERO_SAFE_AREA,
        elements: {
          panel: { x: 0, y: 0, width: 5, height: 3 },
          title: displayTextRect({ x: 1, y: 1, width: 2, height: 1 })
        }
      },
      nativeMetrics: {
        safeArea: ZERO_SAFE_AREA,
        elements: {
          panel: { x: 0, y: 0, width: 5, height: 3 },
          title: displayTextRect({ x: 2, y: 1, width: 2, height: 1 })
        }
      },
      primaryElementIds: ['panel'],
      textElementIds: ['title'],
      exactChecks: { colors: true, copy: true, assets: true }
    });

    assert.deepEqual(result.pixelDiff, {
      differingPixels: 0,
      scoredPixels: 12,
      ratio: 0
    });
    assert.equal(result.typography.title.blockMaxDelta, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('primary bounds pass at four logical pixels and fail above four', () => {
  assert.deepEqual(
    compareBounds(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 4, y: -4, width: 96, height: 44 }
    ),
    { maxDelta: 4, pass: true }
  );
  assert.deepEqual(
    compareBounds(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 4.01, y: 0, width: 100, height: 40 }
    ),
    { maxDelta: 4.01, pass: false }
  );
});

test('typography checks family class, weight, size, line height, lines, and block bounds', () => {
  const reference = displayTextRect({ x: 10, y: 20, width: 100, height: 38 });
  const atThreshold = displayTextRect(
    { x: 14, y: 16, width: 96, height: 42 },
    {
      fontFamily: 'LXGWWenKai-Regular',
      fontSize: 34,
      lineHeight: 40
    }
  );
  assert.deepEqual(compareTypography(reference, atThreshold), {
    familyClassMatches: true,
    weightMatches: true,
    fontSizeDelta: 2,
    lineHeightDelta: 2,
    linesMatch: true,
    blockMaxDelta: 4,
    pass: true
  });

  assert.equal(
    compareTypography(reference, { ...atThreshold, fontFamily: 'SF Pro Text' })
      .pass,
    false
  );
  assert.equal(
    compareTypography(reference, { ...atThreshold, fontWeight: 700 }).pass,
    false
  );
  assert.equal(
    compareTypography(reference, { ...atThreshold, fontSize: 34.01 }).pass,
    false
  );
  assert.equal(
    compareTypography(reference, { ...atThreshold, lineHeight: 40.01 }).pass,
    false
  );
  assert.equal(
    compareTypography(reference, { ...atThreshold, lines: 2 }).pass,
    false
  );
  assert.equal(
    compareTypography(reference, { ...atThreshold, x: 14.01 }).pass,
    false
  );
});

test('any false exact check fails the fixed measurement result', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'easy-meditation-compare-'));
  try {
    const referencePath = path.join(directory, 'reference.png');
    const nativePath = path.join(directory, 'native.png');
    const png = createPng(2, 2);
    await writePng(referencePath, png);
    await writePng(nativePath, png);
    const metrics = {
      safeArea: ZERO_SAFE_AREA,
      elements: {
        panel: { x: 0, y: 0, width: 2, height: 2 }
      }
    };

    const result = await compareVisualArtifacts({
      state: 'guide',
      platform: 'ios',
      viewport: '390x844',
      referencePath,
      nativePath,
      outputDirectory: path.join(directory, 'output'),
      referenceMetrics: metrics,
      nativeMetrics: metrics,
      primaryElementIds: ['panel'],
      textElementIds: [],
      exactChecks: { colors: true, copy: false, assets: true }
    });

    assert.equal(result.pass, false);
    assert.deepEqual(result.exactChecks, {
      colors: true,
      copy: false,
      assets: true
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('requires exactly three boolean exact checks before reading artifacts', async () => {
  const message = /exactChecks must contain exactly boolean colors, copy, and assets/;
  for (const value of [
    undefined,
    null,
    {},
    { colors: true, copy: true },
    { colors: true, copy: true, assets: true, extra: true },
    { colors: true, copy: 'yes', assets: true }
  ]) {
    assert.throws(() => validateExactChecks(value), message);
  }
  assert.deepEqual(
    validateExactChecks({ colors: true, copy: false, assets: true }),
    { colors: true, copy: false, assets: true }
  );

  await assert.rejects(
    compareVisualArtifacts({
      state: 'practice',
      platform: 'ios',
      viewport: '390x844',
      referencePath: '/does/not/exist-reference.png',
      nativePath: '/does/not/exist-native.png',
      outputDirectory: '/does/not/matter',
      referenceMetrics: {},
      nativeMetrics: {},
      primaryElementIds: [],
      textElementIds: [],
      exactChecks: { colors: true, copy: true }
    }),
    message
  );
});

test('direct execution fails explicitly until a validated comparison job is wired', () => {
  const modulePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'compare.mjs'
  );
  const result = spawnSync(process.execPath, [modulePath], { encoding: 'utf8' });

  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /Visual comparison CLI requires validated capture artifacts and metrics; use compareVisualArtifacts from an orchestrator/
  );
});
