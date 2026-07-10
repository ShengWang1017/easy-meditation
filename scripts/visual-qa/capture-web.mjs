import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getVisualQaState } from './states.mjs';

const VIEWPORTS = {
  '390x844': { width: 390, height: 844 },
  '412x915': { width: 412, height: 915 }
};
const NATIVE_ONLY_STATES = new Set(['login', 'register']);

export function buildWebCapturePlan({ state, url, viewport, outputPath }) {
  getVisualQaState(state);
  if (NATIVE_ONLY_STATES.has(state)) {
    throw new Error(
      `${state} has no approved Web reference; capture it natively only.`
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('Web capture URL must use loopback HTTP.');
  }
  if (parsedUrl.protocol !== 'http:' || parsedUrl.hostname !== '127.0.0.1') {
    throw new Error('Web capture URL must use loopback HTTP.');
  }

  const viewportSize = VIEWPORTS[viewport];
  if (!viewportSize) {
    throw new Error(`Unsupported visual QA viewport: ${viewport}`);
  }
  if (!path.isAbsolute(outputPath) || path.extname(outputPath) !== '.png') {
    throw new Error('Web capture output must be a PNG path.');
  }

  return {
    state,
    url: parsedUrl.toString(),
    viewport: { ...viewportSize },
    deviceScaleFactor: 1,
    outputPath
  };
}

export async function executeWebCapturePlan({ plan, adapter }) {
  for (const method of [
    'open',
    'waitForReady',
    'collectMetrics',
    'screenshot'
  ]) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`Web capture adapter.${method} is required.`);
    }
  }

  await adapter.open({
    url: plan.url,
    viewport: { ...plan.viewport },
    deviceScaleFactor: plan.deviceScaleFactor
  });
  await adapter.waitForReady(plan.state);
  const metrics = await adapter.collectMetrics(plan.state);
  await adapter.screenshot(plan.outputPath);
  return metrics;
}

const directlyExecuted =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  console.error(
    'Web capture is unavailable in the host-only foundation; explicit browser authorization and an injected Playwright adapter are required.'
  );
  process.exitCode = 2;
}
