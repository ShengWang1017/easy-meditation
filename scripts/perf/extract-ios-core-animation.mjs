const SUPPORTED_CORE_ANIMATION_SCHEMAS = new Set([
  'com.apple.xray.instrument-type.core-animation'
]);

function readAttribute(attributes, name) {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  );
  return match?.[2] ?? null;
}

function tableHasFrameDurationColumn(tableBody) {
  return (
    /<mnemonic>\s*frame-duration\s*<\/mnemonic>/i.test(tableBody) ||
    /<column\b[^>]*\bmnemonic\s*=\s*(["'])frame-duration\1/i.test(
      tableBody
    )
  );
}

export function selectCoreAnimationTable(tocXml) {
  if (typeof tocXml !== 'string') {
    throw new TypeError('xctrace TOC must be XML text.');
  }

  const observedSchemas = [];
  let sawSupportedSchema = false;
  const runPattern = /<run\b([^>]*)>([\s\S]*?)<\/run>/gi;
  let runMatch;

  while ((runMatch = runPattern.exec(tocXml)) !== null) {
    const runNumberText = readAttribute(runMatch[1], 'number');
    const runNumber = Number(runNumberText);
    const tablePattern = /<table\b([^>]*)>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tablePattern.exec(runMatch[2])) !== null) {
      const schema = readAttribute(tableMatch[1], 'schema');
      if (!schema) {
        continue;
      }
      if (!observedSchemas.includes(schema)) {
        observedSchemas.push(schema);
      }
      if (!SUPPORTED_CORE_ANIMATION_SCHEMAS.has(schema)) {
        continue;
      }

      sawSupportedSchema = true;
      if (!tableHasFrameDurationColumn(tableMatch[2])) {
        continue;
      }
      if (!Number.isInteger(runNumber) || runNumber < 1) {
        throw new Error(
          'Unsupported xctrace TOC: Core Animation table has no valid run number'
        );
      }

      return {
        runNumber,
        schema,
        durationColumn: 'frame-duration'
      };
    }
  }

  if (sawSupportedSchema) {
    throw new Error(
      'Unsupported xctrace TOC: supported Core Animation table has no frame-duration column'
    );
  }

  throw new Error(
    `Unsupported xctrace TOC: no supported Core Animation frame-duration table; observed schemas: ${
      observedSchemas.length > 0 ? observedSchemas.join(', ') : '(none)'
    }`
  );
}

function toMilliseconds(value, unit) {
  switch (unit) {
    case 's':
      return value * 1000;
    case 'ms':
      return value;
    case 'us':
      return value / 1000;
    case 'ns':
      return value / 1_000_000;
    default:
      throw new Error(`Unsupported Core Animation frame-duration unit: ${unit}`);
  }
}

export function parseCoreAnimationFrameDurations(tableXml) {
  if (typeof tableXml !== 'string') {
    throw new TypeError('Core Animation table must be XML text.');
  }

  const durationsMs = [];
  const durationPattern =
    /<frame-duration\b([^>]*)>([\s\S]*?)<\/frame-duration>/gi;
  let durationMatch;

  while ((durationMatch = durationPattern.exec(tableXml)) !== null) {
    const unit = readAttribute(durationMatch[1], 'unit') ?? '(missing)';
    const rawValue = durationMatch[2].trim();
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(
        `Core Animation table contains invalid frame-duration value: ${rawValue}`
      );
    }

    durationsMs.push(toMilliseconds(value, unit));
  }

  if (durationsMs.length === 0) {
    throw new Error('Core Animation table contains no frame-duration samples');
  }

  return durationsMs;
}

function validateDeviceId(deviceId) {
  if (
    typeof deviceId !== 'string' ||
    deviceId === 'booted' ||
    !/^(?=.{16,64}$)[0-9A-Fa-f-]+$/.test(deviceId)
  ) {
    throw new Error('Explicit iOS device UDID is required');
  }
}

function validateAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
}

export function buildXctraceTocExportCommand({
  deviceId,
  tracePath,
  tocPath
}) {
  validateDeviceId(deviceId);
  validateAbsolutePath(tracePath, 'tracePath');
  validateAbsolutePath(tocPath, 'tocPath');
  return {
    deviceId,
    command: 'xcrun',
    args: [
      'xctrace',
      'export',
      '--input',
      tracePath,
      '--toc',
      '--output',
      tocPath
    ]
  };
}

export function buildXctraceTableExportCommand({
  deviceId,
  tracePath,
  tablePath,
  table
}) {
  validateDeviceId(deviceId);
  validateAbsolutePath(tracePath, 'tracePath');
  validateAbsolutePath(tablePath, 'tablePath');
  if (
    !Number.isInteger(table?.runNumber) ||
    !SUPPORTED_CORE_ANIMATION_SCHEMAS.has(table?.schema) ||
    table?.durationColumn !== 'frame-duration'
  ) {
    throw new Error('A selected supported Core Animation table is required');
  }
  const xpath = `/trace-toc/run[@number="${table.runNumber}"]/data/table[@schema="${table.schema}"]`;
  return {
    deviceId,
    command: 'xcrun',
    args: [
      'xctrace',
      'export',
      '--input',
      tracePath,
      '--xpath',
      xpath,
      '--output',
      tablePath
    ]
  };
}

export async function runIosExtractionPipeline(options, { adapter }) {
  for (const method of ['run', 'readText', 'writeText']) {
    if (typeof adapter?.[method] !== 'function') {
      throw new TypeError(`iOS extraction adapter.${method} is required.`);
    }
  }
  validateAbsolutePath(options.outputPath, 'outputPath');
  const tocCommand = buildXctraceTocExportCommand(options);
  await adapter.run(tocCommand);
  const tocXml = await adapter.readText(options.tocPath);
  const table = selectCoreAnimationTable(tocXml);
  const tableCommand = buildXctraceTableExportCommand({ ...options, table });
  await adapter.run(tableCommand);
  const tableXml = await adapter.readText(options.tablePath);
  const durations = parseCoreAnimationFrameDurations(tableXml);
  await adapter.writeText(
    options.outputPath,
    `${JSON.stringify(durations, null, 2)}\n`
  );
  return durations;
}

function parseFlags(args) {
  const flags = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid iOS extractor argument: ${flag ?? '(missing)'}`);
    }
    flags.set(flag, value);
  }
  return flags;
}

export function parseIosExtractorCliArgs(args) {
  const flags = parseFlags(args);
  for (const required of [
    '--device',
    '--trace',
    '--toc',
    '--table',
    '--output'
  ]) {
    if (!flags.get(required)) {
      throw new Error(`Missing required iOS extractor argument: ${required}`);
    }
  }
  const options = {
    deviceId: flags.get('--device'),
    tracePath: flags.get('--trace'),
    tocPath: flags.get('--toc'),
    tablePath: flags.get('--table'),
    outputPath: flags.get('--output')
  };
  validateDeviceId(options.deviceId);
  for (const key of ['tracePath', 'tocPath', 'tablePath', 'outputPath']) {
    validateAbsolutePath(options[key], key);
  }
  return options;
}

function createExecAdapter() {
  return {
    async run({ command, args }) {
      await execFile(command, args);
    },
    readText: (filePath) => readFileFromDisk(filePath, 'utf8'),
    writeText: (filePath, value) => writeFileToDisk(filePath, value)
  };
}

const USAGE =
  'Usage: node extract-ios-core-animation.mjs --device <UDID> --trace <absolute.trace> --toc <absolute.xml> --table <absolute.xml> --output <absolute.json>';

export async function runIosExtractorCli(
  args,
  {
    adapter,
    write = (value) => process.stdout.write(value),
    writeError = (value) => process.stderr.write(value)
  } = {}
) {
  let options;
  try {
    options = parseIosExtractorCliArgs(args);
  } catch (error) {
    writeError(`${USAGE}\n${error instanceof Error ? error.message : error}\n`);
    return 2;
  }

  try {
    const durations = await runIosExtractionPipeline(options, {
      adapter: adapter ?? createExecAdapter()
    });
    write(`${JSON.stringify({ samples: durations.length, output: options.outputPath })}\n`);
    return 0;
  } catch (error) {
    writeError(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}

const directlyExecuted =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (directlyExecuted) {
  process.exitCode = await runIosExtractorCli(process.argv.slice(2));
}
import { execFile as execFileCallback } from 'node:child_process';
import {
  readFile as readFileFromDisk,
  writeFile as writeFileToDisk
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
