import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('qa:perf:ios passes extractor output into the frame gate', async () => {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')
  );

  assert.equal(
    packageJson.scripts['qa:perf:ios'],
    'node scripts/perf/extract-ios-core-animation.mjs --device "$IOS_DEVICE_UDID" --trace "$IOS_TRACE_PATH" --toc "$PWD/qa/perf/ios-core-animation-toc.xml" --table "$PWD/qa/perf/ios-core-animation-table.xml" --output "$PWD/qa/perf/ios-frame-durations.json" && node scripts/perf/analyze-frames.mjs "$PWD/qa/perf/ios-frame-durations.json"'
  );
});
