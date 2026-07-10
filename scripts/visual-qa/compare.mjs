import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const PRIMARY_BOUND_TOLERANCE = 4;
const TYPOGRAPHY_TOLERANCE = 2;

function assertFiniteRect(rect, label) {
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(rect?.[key])) {
      throw new TypeError(`${label}.${key} must be a finite number.`);
    }
  }
  if (rect.width < 0 || rect.height < 0) {
    throw new RangeError(`${label} dimensions cannot be negative.`);
  }
}

function normalizedSafeArea(safeArea = {}) {
  const normalized = {};
  for (const edge of ['top', 'right', 'bottom', 'left']) {
    const value = safeArea[edge] ?? 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`safeArea.${edge} must be a non-negative number.`);
    }
    normalized[edge] = Math.round(value);
  }
  return normalized;
}

function cropPng(source, left, top, width, height) {
  if (
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0 ||
    left + width > source.width ||
    top + height > source.height
  ) {
    throw new RangeError('PNG crop is outside the source image.');
  }

  const output = new PNG({ width, height });
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * source.width + left) * 4;
    const outputStart = row * width * 4;
    source.data.copy(
      output.data,
      outputStart,
      sourceStart,
      sourceStart + width * 4
    );
  }
  return output;
}

function translateElements(elements, deltaX, deltaY) {
  return Object.fromEntries(
    Object.entries(elements ?? {}).map(([id, element]) => {
      assertFiniteRect(element, `elements.${id}`);
      return [
        id,
        {
          ...element,
          x: element.x + deltaX,
          y: element.y + deltaY
        }
      ];
    })
  );
}

function cropSafeArea(png, metrics) {
  const safeArea = normalizedSafeArea(metrics?.safeArea);
  const width = png.width - safeArea.left - safeArea.right;
  const height = png.height - safeArea.top - safeArea.bottom;
  if (width <= 0 || height <= 0) {
    throw new RangeError('Safe area removes the entire PNG.');
  }

  return {
    png: cropPng(png, safeArea.left, safeArea.top, width, height),
    elements: translateElements(
      metrics?.elements,
      -safeArea.left,
      -safeArea.top
    )
  };
}

function cropToCommonFrame(artifact, width, height) {
  const horizontalCrop = Math.floor((artifact.png.width - width) / 2);
  return {
    png: cropPng(artifact.png, horizontalCrop, 0, width, height),
    // Safe-area translation has already happened. Apply only the additional
    // horizontal center-crop offset here; the top origins stay aligned.
    elements: translateElements(artifact.elements, -horizontalCrop, 0)
  };
}

function clonePng(png) {
  const clone = new PNG({ width: png.width, height: png.height });
  clone.data = Buffer.from(png.data);
  return clone;
}

function rectanglePixelIndexes(rect, width, height) {
  assertFiniteRect(rect, 'text rectangle');
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  const indexes = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      indexes.push(y * width + x);
    }
  }
  return indexes;
}

function collectTextPixels(png, elements, textElementIds) {
  const maskedPixels = new Set();
  for (const id of textElementIds) {
    const rect = elements[id];
    if (!rect) {
      throw new Error(`Missing text element metrics: ${id}`);
    }
    for (const pixelIndex of rectanglePixelIndexes(
      rect,
      png.width,
      png.height
    )) {
      maskedPixels.add(pixelIndex);
    }
  }
  return maskedPixels;
}

function maskPixels(png, maskedPixels) {
  const masked = clonePng(png);
  for (const pixelIndex of maskedPixels) {
    const offset = pixelIndex * 4;
    masked.data[offset] = 0;
    masked.data[offset + 1] = 0;
    masked.data[offset + 2] = 0;
    masked.data[offset + 3] = 255;
  }
  return masked;
}

function displayFontClass(fontFamily) {
  const normalized = String(fontFamily).toLowerCase();
  return /(kaiti|stkaiti|wenkai|lxgw)/.test(normalized)
    ? 'display'
    : 'system';
}

function normalizedFontWeight(fontWeight) {
  if (typeof fontWeight === 'number') {
    return fontWeight;
  }
  const numeric = Number(fontWeight);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return (
    {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    }[String(fontWeight).toLowerCase()] ?? fontWeight
  );
}

export function compareBounds(reference, native) {
  assertFiniteRect(reference, 'reference');
  assertFiniteRect(native, 'native');
  const maxDelta = Math.max(
    Math.abs(reference.x - native.x),
    Math.abs(reference.y - native.y),
    Math.abs(reference.width - native.width),
    Math.abs(reference.height - native.height)
  );
  return {
    maxDelta,
    pass: maxDelta <= PRIMARY_BOUND_TOLERANCE
  };
}

export function compareTypography(reference, native) {
  const blockComparison = compareBounds(reference, native);
  const familyClassMatches =
    displayFontClass(reference.fontFamily) ===
    displayFontClass(native.fontFamily);
  const weightMatches =
    normalizedFontWeight(reference.fontWeight) ===
    normalizedFontWeight(native.fontWeight);
  const fontSizeDelta = Math.abs(reference.fontSize - native.fontSize);
  const lineHeightDelta = Math.abs(reference.lineHeight - native.lineHeight);
  const linesMatch = reference.lines === native.lines;
  const pass =
    familyClassMatches &&
    weightMatches &&
    fontSizeDelta <= TYPOGRAPHY_TOLERANCE &&
    lineHeightDelta <= TYPOGRAPHY_TOLERANCE &&
    linesMatch &&
    blockComparison.pass;

  return {
    familyClassMatches,
    weightMatches,
    fontSizeDelta,
    lineHeightDelta,
    linesMatch,
    blockMaxDelta: blockComparison.maxDelta,
    pass
  };
}

async function writeOverlay(reference, native, outputPath) {
  const halfOpacityNative = clonePng(native);
  for (let offset = 3; offset < halfOpacityNative.data.length; offset += 4) {
    halfOpacityNative.data[offset] = Math.round(
      halfOpacityNative.data[offset] * 0.5
    );
  }
  await sharp(PNG.sync.write(reference))
    .composite([{ input: PNG.sync.write(halfOpacityNative), blend: 'over' }])
    .png()
    .toFile(outputPath);
}

function requireElement(elements, id, kind) {
  const element = elements[id];
  if (!element) {
    throw new Error(`Missing ${kind} element metrics: ${id}`);
  }
  return element;
}

export async function compareVisualArtifacts({
  state,
  platform,
  viewport,
  referencePath,
  nativePath,
  outputDirectory,
  referenceMetrics,
  nativeMetrics,
  primaryElementIds,
  textElementIds,
  exactChecks
}) {
  const [referenceBuffer, nativeBuffer] = await Promise.all([
    readFile(referencePath),
    readFile(nativePath)
  ]);
  const referenceSafe = cropSafeArea(
    PNG.sync.read(referenceBuffer),
    referenceMetrics
  );
  const nativeSafe = cropSafeArea(PNG.sync.read(nativeBuffer), nativeMetrics);
  const commonWidth = Math.min(
    referenceSafe.png.width,
    nativeSafe.png.width
  );
  const commonHeight = Math.min(
    referenceSafe.png.height,
    nativeSafe.png.height
  );
  const reference = cropToCommonFrame(
    referenceSafe,
    commonWidth,
    commonHeight
  );
  const native = cropToCommonFrame(nativeSafe, commonWidth, commonHeight);

  const referenceTextPixels = collectTextPixels(
    reference.png,
    reference.elements,
    textElementIds
  );
  const nativeTextPixels = collectTextPixels(
    native.png,
    native.elements,
    textElementIds
  );
  const maskedUnion = new Set([
    ...referenceTextPixels,
    ...nativeTextPixels
  ]);
  const referenceMasked = maskPixels(reference.png, maskedUnion);
  const nativeMasked = maskPixels(native.png, maskedUnion);
  const diff = new PNG({ width: commonWidth, height: commonHeight });
  const differingPixels = pixelmatch(
    referenceMasked.data,
    nativeMasked.data,
    diff.data,
    commonWidth,
    commonHeight,
    { includeAA: true, threshold: 0 }
  );
  const scoredPixels = commonWidth * commonHeight - maskedUnion.size;

  const elements = Object.fromEntries(
    primaryElementIds.map((id) => {
      const referenceElement = requireElement(
        reference.elements,
        id,
        'primary'
      );
      const nativeElement = requireElement(native.elements, id, 'primary');
      const comparison = compareBounds(referenceElement, nativeElement);
      return [
        id,
        {
          reference: {
            x: referenceElement.x,
            y: referenceElement.y,
            width: referenceElement.width,
            height: referenceElement.height
          },
          native: {
            x: nativeElement.x,
            y: nativeElement.y,
            width: nativeElement.width,
            height: nativeElement.height
          },
          ...comparison
        }
      ];
    })
  );
  const typography = Object.fromEntries(
    textElementIds.map((id) => [
      id,
      compareTypography(
        requireElement(reference.elements, id, 'text'),
        requireElement(native.elements, id, 'text')
      )
    ])
  );
  const pass =
    Object.values(elements).every((element) => element.pass) &&
    Object.values(typography).every((text) => text.pass) &&
    Object.values(exactChecks).every((check) => check === true);
  const result = {
    state,
    platform,
    viewport,
    pixelDiff: {
      differingPixels,
      scoredPixels,
      ratio: scoredPixels === 0 ? 0 : differingPixels / scoredPixels
    },
    elements,
    typography,
    exactChecks: { ...exactChecks },
    pass
  };

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, 'diff.png'), PNG.sync.write(diff)),
    writeOverlay(
      reference.png,
      native.png,
      path.join(outputDirectory, 'overlay-50.png')
    ),
    writeFile(
      path.join(outputDirectory, 'measurements.json'),
      `${JSON.stringify(result, null, 2)}\n`
    )
  ]);

  return result;
}

const directlyExecuted =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  console.error(
    'Visual comparison CLI requires validated capture artifacts and metrics; use compareVisualArtifacts from an orchestrator.'
  );
  process.exitCode = 2;
}
