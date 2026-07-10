import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildXctraceTableExportCommand,
  buildXctraceTocExportCommand,
  parseCoreAnimationFrameDurations,
  parseIosExtractorCliArgs,
  runIosExtractorCli,
  runIosExtractionPipeline,
  selectCoreAnimationTable
} from './extract-ios-core-animation.mjs';

const SUPPORTED_SCHEMA = 'com.apple.xray.instrument-type.core-animation';

test('selects only a supported Core Animation table with frame-duration samples', () => {
  const tocXml = `
<trace-toc>
  <run number="2">
    <data>
      <table schema="time-profile">
        <column><mnemonic>frame-duration</mnemonic></column>
      </table>
      <table schema="${SUPPORTED_SCHEMA}">
        <column><mnemonic>timestamp</mnemonic></column>
      </table>
      <table schema="${SUPPORTED_SCHEMA}">
        <column><mnemonic>frame-duration</mnemonic></column>
      </table>
    </data>
  </run>
</trace-toc>
`;

  assert.deepEqual(selectCoreAnimationTable(tocXml), {
    runNumber: 2,
    schema: SUPPORTED_SCHEMA,
    durationColumn: 'frame-duration'
  });
});

test('reports observed schemas when the TOC shape is unsupported', () => {
  const tocXml = `
<trace-toc>
  <run number="1">
    <data>
      <table schema="time-profile">
        <column><mnemonic>duration</mnemonic></column>
      </table>
      <table schema="future.core-animation-v9">
        <column><mnemonic>frame-duration</mnemonic></column>
      </table>
    </data>
  </run>
</trace-toc>
`;

  assert.throws(
    () => selectCoreAnimationTable(tocXml),
    /Unsupported xctrace TOC: no supported Core Animation frame-duration table; observed schemas: time-profile, future\.core-animation-v9/
  );
});

test('reports a supported Core Animation table that lacks frame-duration', () => {
  const tocXml = `
<trace-toc>
  <run number="3">
    <data>
      <table schema="${SUPPORTED_SCHEMA}">
        <column><mnemonic>gpu-time</mnemonic></column>
      </table>
    </data>
  </run>
</trace-toc>
`;

  assert.throws(
    () => selectCoreAnimationTable(tocXml),
    /Unsupported xctrace TOC: supported Core Animation table has no frame-duration column/
  );
});

test('normalizes supported frame-duration units to milliseconds', () => {
  const tableXml = `
<trace-query-result schema="${SUPPORTED_SCHEMA}">
  <row><frame-duration unit="s">0.016</frame-duration></row>
  <row><frame-duration unit="ms">20.5</frame-duration></row>
  <row><frame-duration unit="us">33000</frame-duration></row>
  <row><frame-duration unit="ns">50000000</frame-duration></row>
</trace-query-result>
`;

  assert.deepEqual(parseCoreAnimationFrameDurations(tableXml), [
    16,
    20.5,
    33,
    50
  ]);
});

test('rejects unknown duration units instead of guessing', () => {
  const tableXml = `
<trace-query-result schema="${SUPPORTED_SCHEMA}">
  <row><frame-duration unit="ticks">42</frame-duration></row>
</trace-query-result>
`;

  assert.throws(
    () => parseCoreAnimationFrameDurations(tableXml),
    /Unsupported Core Animation frame-duration unit: ticks/
  );
});

test('rejects tables without positive finite frame-duration samples', () => {
  assert.throws(
    () =>
      parseCoreAnimationFrameDurations(`
<trace-query-result schema="${SUPPORTED_SCHEMA}">
  <row><frame-duration unit="ms">0</frame-duration></row>
</trace-query-result>
`),
    /Core Animation table contains invalid frame-duration value: 0/
  );

  assert.throws(
    () =>
      parseCoreAnimationFrameDurations(`
<trace-query-result schema="${SUPPORTED_SCHEMA}"></trace-query-result>
`),
    /Core Animation table contains no frame-duration samples/
  );
});

test('requires an explicit device and absolute trace paths for export argv', () => {
  const options = {
    deviceId: '00008110-001234567890001E',
    tracePath: '/tmp/core-animation.trace',
    tocPath: '/tmp/core-animation-toc.xml'
  };
  assert.deepEqual(buildXctraceTocExportCommand(options), {
    deviceId: options.deviceId,
    command: 'xcrun',
    args: [
      'xctrace',
      'export',
      '--input',
      options.tracePath,
      '--toc',
      '--output',
      options.tocPath
    ]
  });

  assert.deepEqual(
    buildXctraceTableExportCommand({
      ...options,
      tablePath: '/tmp/core-animation-table.xml',
      table: {
        runNumber: 2,
        schema: SUPPORTED_SCHEMA,
        durationColumn: 'frame-duration'
      }
    }),
    {
      deviceId: options.deviceId,
      command: 'xcrun',
      args: [
        'xctrace',
        'export',
        '--input',
        options.tracePath,
        '--xpath',
        `/trace-toc/run[@number="2"]/data/table[@schema="${SUPPORTED_SCHEMA}"]`,
        '--output',
        '/tmp/core-animation-table.xml'
      ]
    }
  );

  assert.throws(
    () => buildXctraceTocExportCommand({ ...options, deviceId: 'booted' }),
    /Explicit iOS device UDID is required/
  );
  assert.throws(
    () => buildXctraceTocExportCommand({ ...options, tracePath: 'relative.trace' }),
    /tracePath must be an absolute path/
  );
});

test('runs TOC selection and table extraction only through an injected adapter', async () => {
  const paths = {
    deviceId: '00008110-001234567890001E',
    tracePath: '/tmp/core-animation.trace',
    tocPath: '/tmp/core-animation-toc.xml',
    tablePath: '/tmp/core-animation-table.xml',
    outputPath: '/tmp/ios-frame-durations.json'
  };
  const tocXml = `
<trace-toc><run number="2"><data>
  <table schema="${SUPPORTED_SCHEMA}">
    <column><mnemonic>frame-duration</mnemonic></column>
  </table>
</data></run></trace-toc>`;
  const tableXml = `
<trace-query-result schema="${SUPPORTED_SCHEMA}">
  <row><frame-duration unit="ms">16</frame-duration></row>
  <row><frame-duration unit="ms">20.5</frame-duration></row>
</trace-query-result>`;
  const calls = [];
  const durations = await runIosExtractionPipeline(paths, {
    adapter: {
      run: async (command) => calls.push(['run', command]),
      readText: async (filePath) => {
        calls.push(['read', filePath]);
        return filePath === paths.tocPath ? tocXml : tableXml;
      },
      writeText: async (filePath, value) => calls.push(['write', filePath, value])
    }
  });

  assert.deepEqual(durations, [16, 20.5]);
  assert.deepEqual(
    calls.map(([kind]) => kind),
    ['run', 'read', 'run', 'read', 'write']
  );
  assert.equal(calls[0][1].args.includes('--toc'), true);
  assert.equal(calls[2][1].args.includes('--xpath'), true);
  assert.equal(calls[4][1], paths.outputPath);
  assert.equal(calls[4][2], '[\n  16,\n  20.5\n]\n');
});

test('CLI parser requires every explicit device and path argument', () => {
  assert.throws(
    () => parseIosExtractorCliArgs(['--device', '00008110-001234567890001E']),
    /Missing required iOS extractor argument: --trace/
  );
  assert.deepEqual(
    parseIosExtractorCliArgs([
      '--device',
      '00008110-001234567890001E',
      '--trace',
      '/tmp/core-animation.trace',
      '--toc',
      '/tmp/core-animation-toc.xml',
      '--table',
      '/tmp/core-animation-table.xml',
      '--output',
      '/tmp/ios-frame-durations.json'
    ]),
    {
      deviceId: '00008110-001234567890001E',
      tracePath: '/tmp/core-animation.trace',
      tocPath: '/tmp/core-animation-toc.xml',
      tablePath: '/tmp/core-animation-table.xml',
      outputPath: '/tmp/ios-frame-durations.json'
    }
  );
});

test('CLI returns usage code two before creating or running an adapter', async () => {
  const errors = [];
  const code = await runIosExtractorCli([], {
    adapter: new Proxy(
      {},
      {
        get: () => assert.fail('incomplete CLI args must not touch adapter')
      }
    ),
    write: () => assert.fail('usage error must not write stdout'),
    writeError: (value) => errors.push(value)
  });
  assert.equal(code, 2);
  assert.match(
    errors.join(''),
    /Usage: node extract-ios-core-animation\.mjs --device/
  );
});
