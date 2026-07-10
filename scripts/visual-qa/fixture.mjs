import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { VISUAL_QA_STATES } from './states.mjs';

const FIXTURE_NOW = '2026-07-10T12:00:00+08:00';
const FORBIDDEN_SECRET_KEYS = /^(accessToken|refreshToken|password|authorization|bearer)$/i;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function scanForSecretKeys(value, pathParts = []) {
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (FORBIDDEN_SECRET_KEYS.test(key)) {
      throw new Error(
        `Fixture contains forbidden secret-like key: ${nextPath.join('.')}`
      );
    }
    scanForSecretKeys(nested, nextPath);
  }
}

function validateSessionState(id, session) {
  assertObject(session, `${id}.session`);
  if (!['idle', 'running', 'paused', 'completed'].includes(session.status)) {
    throw new Error(`${id}.session.status is unsupported`);
  }
  if (!['inhale', 'hold', 'exhale', 'complete'].includes(session.phaseKind)) {
    throw new Error(`${id}.session.phaseKind is unsupported`);
  }
  if (
    !Number.isFinite(session.phaseProgress) ||
    session.phaseProgress < 0 ||
    session.phaseProgress > 1
  ) {
    throw new Error(
      `${id}.session.phaseProgress must be between 0 and 1`
    );
  }
  for (const key of ['elapsedSeconds', 'remainingSeconds']) {
    if (!Number.isFinite(session[key]) || session[key] < 0) {
      throw new Error(`${id}.session.${key} must be non-negative`);
    }
  }
}

export function validateVisualQaFixture(fixture) {
  assertObject(fixture, 'Fixture');
  scanForSecretKeys(fixture);
  if (fixture.version !== 1) {
    throw new Error('Fixture version must be 1');
  }
  if (fixture.now !== FIXTURE_NOW) {
    throw new Error(`Fixture now must equal ${FIXTURE_NOW}`);
  }

  assertObject(fixture.api, 'Fixture api');
  assertObject(fixture.api.me, 'Fixture api.me');
  if (!fixture.api.me.id || !fixture.api.me.email?.endsWith('.invalid')) {
    throw new Error('Fixture /me must use a fixed synthetic .invalid user');
  }
  if (
    !Array.isArray(fixture.api.methods) ||
    fixture.api.methods.map(({ id }) => id).join(',') !==
      'box,four-seven-eight,coherent'
  ) {
    throw new Error('Fixture methods must contain the three fixed built-ins');
  }
  assertObject(fixture.api.stats, 'Fixture api.stats');
  assertObject(fixture.api.stats.empty, 'Fixture api.stats.empty');
  assertObject(fixture.api.stats.populated, 'Fixture api.stats.populated');
  assertObject(fixture.api.sessions, 'Fixture api.sessions');
  if (
    !Array.isArray(fixture.api.sessions.empty) ||
    !Array.isArray(fixture.api.sessions.populated)
  ) {
    throw new Error('Fixture sessions must define empty and populated arrays');
  }

  assertObject(fixture.preferences, 'Fixture preferences');
  if (
    fixture.preferences.storageKey !==
    `easyMeditation.preferences.${fixture.api.me.id}`
  ) {
    throw new Error('Fixture preference key must be scoped to the fixture user');
  }
  assertObject(
    fixture.preferences.durationOverrides,
    'Fixture preferences.durationOverrides'
  );
  if ('custom' in fixture.preferences.durationOverrides) {
    throw new Error('Fixture durationOverrides cannot contain custom');
  }
  if (!Array.isArray(fixture.preferences.localSessionLedger)) {
    throw new Error('Fixture localSessionLedger must be an array');
  }

  assertObject(fixture.states, 'Fixture states');
  const expectedStateIds = VISUAL_QA_STATES.map(({ id }) => id);
  if (
    Object.keys(fixture.states).length !== expectedStateIds.length ||
    !expectedStateIds.every((id, index) => Object.keys(fixture.states)[index] === id)
  ) {
    throw new Error('Fixture states must exactly match the 13-state manifest');
  }

  for (const id of expectedStateIds) {
    const state = fixture.states[id];
    assertObject(state, `Fixture states.${id}`);
    const expectedScope = ['login', 'register'].includes(id)
      ? 'unauthenticated'
      : 'authenticated';
    if (state.authScope !== expectedScope) {
      throw new Error(`${id}.authScope must be ${expectedScope}`);
    }
    if (id.startsWith('session-')) {
      validateSessionState(id, state.session);
    } else if (state.session !== null) {
      throw new Error(`${id}.session must be null`);
    }
  }

  return fixture;
}

export async function loadVisualQaFixture(filePath) {
  if (!path.isAbsolute(filePath)) {
    throw new Error('Fixture path must be absolute');
  }
  const text = await readFile(filePath, 'utf8');
  let fixture;
  try {
    fixture = JSON.parse(text);
  } catch {
    throw new Error(`Fixture is not valid JSON: ${filePath}`);
  }
  return validateVisualQaFixture(fixture);
}

export async function runFixtureCli(
  args,
  {
    write = (value) => process.stdout.write(value),
    writeError = (value) => process.stderr.write(value)
  } = {}
) {
  if (args.length !== 1) {
    writeError('Usage: node fixture.mjs <absolute-fixture-path>\n');
    return 2;
  }
  try {
    const fixture = await loadVisualQaFixture(path.resolve(args[0]));
    write(
      `${JSON.stringify({
        valid: true,
        version: fixture.version,
        states: Object.keys(fixture.states).length,
        now: fixture.now
      })}\n`
    );
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
  process.exitCode = await runFixtureCli(process.argv.slice(2));
}
