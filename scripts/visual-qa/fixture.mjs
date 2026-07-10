import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

import {
  breathingMethodSchema,
  meSchema,
  practiceSessionCreateSchema,
  practiceSessionSchema,
  statsSummarySchema
} from '@easy-meditation/shared';

import { VISUAL_QA_STATES } from './states.mjs';

const FIXTURE_NOW = '2026-07-10T12:00:00+08:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DURATION_SECONDS = 300;
const BUILT_IN_METHOD_IDS = ['box', 'four-seven-eight', 'coherent'];
const CUSTOM_DURATION_MINUTES = [2, 3, 5, 10];
const breathingMethodsSchema = breathingMethodSchema.array();
const practiceSessionsSchema = practiceSessionSchema.array();
const SESSION_STATE_SEMANTICS = {
  'session-ready': {
    status: 'idle',
    phaseKind: 'inhale',
    phaseProgress: 0,
    elapsedSeconds: 0,
    remainingSeconds: 300
  },
  'session-inhale': {
    status: 'running',
    phaseKind: 'inhale',
    phaseProgress: 0.5,
    elapsedSeconds: 2,
    remainingSeconds: 298
  },
  'session-hold': {
    status: 'running',
    phaseKind: 'hold',
    phaseProgress: 0.5,
    elapsedSeconds: 6,
    remainingSeconds: 294
  },
  'session-exhale': {
    status: 'running',
    phaseKind: 'exhale',
    phaseProgress: 0.5,
    elapsedSeconds: 10,
    remainingSeconds: 290
  },
  'session-paused': {
    status: 'paused',
    phaseKind: 'exhale',
    phaseProgress: 0.25,
    elapsedSeconds: 9,
    remainingSeconds: 291
  },
  'session-completed': {
    status: 'completed',
    phaseKind: 'complete',
    phaseProgress: 1,
    elapsedSeconds: 300,
    remainingSeconds: 0
  }
};

function fixtureUtcOffsetMs(timestamp) {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(timestamp);
  if (!match) {
    throw new Error('Fixture now must include an explicit UTC offset');
  }
  const direction = match[1] === '+' ? 1 : -1;
  return direction * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
}

const FIXTURE_UTC_OFFSET_MS = fixtureUtcOffsetMs(FIXTURE_NOW);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isForbiddenSecretKey(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (
    normalized.endsWith('token') ||
    normalized.includes('password') ||
    normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('clientsecret') ||
    normalized === 'bearer'
  );
}

function scanForSecretKeys(value, pathParts = []) {
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (isForbiddenSecretKey(key)) {
      throw new Error(
        `Fixture contains forbidden secret-like key: ${nextPath.join('.')}`
      );
    }
    scanForSecretKeys(nested, nextPath);
  }
}

function assertSharedSchema(schema, value, label, schemaName) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const issuePath = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
    const issueMessage = issue?.message ? `: ${issue.message}` : '';
    throw new Error(
      `${label} must match the shared ${schemaName} schema${issuePath}${issueMessage}`
    );
  }
}

function assertIntegerInRange(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`
    );
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
}

function assertNullableNonEmptyString(value, label) {
  if (value !== null && (typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${label} must be null or a non-empty string`);
  }
}

function assertNullableDateTime(value, label) {
  if (
    value !== null &&
    (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)))
  ) {
    throw new Error(`${label} must be null or an ISO UTC datetime`);
  }
}

function validateCustomRhythm(customRhythm) {
  const label = 'Fixture preferences.customRhythm';
  assertObject(customRhythm, label);
  const expectedKeys = [
    'name',
    'inhaleSeconds',
    'holdSeconds',
    'exhaleSeconds',
    'durationMinutes'
  ];
  if (
    Object.keys(customRhythm).length !== expectedKeys.length ||
    !expectedKeys.every((key) => Object.hasOwn(customRhythm, key))
  ) {
    throw new Error(`${label} must contain only the fixed preference fields`);
  }
  if (customRhythm.name !== '自定义') {
    throw new Error(`${label}.name must equal 自定义`);
  }
  for (const key of ['inhaleSeconds', 'holdSeconds', 'exhaleSeconds']) {
    assertIntegerInRange(customRhythm[key], 1, 12, `${label}.${key}`);
  }
  if (!CUSTOM_DURATION_MINUTES.includes(customRhythm.durationMinutes)) {
    throw new Error(`${label}.durationMinutes must be one of 2, 3, 5, or 10`);
  }
}

function validateDurationOverrides(durationOverrides) {
  const label = 'Fixture preferences.durationOverrides';
  assertObject(durationOverrides, label);
  if (Object.hasOwn(durationOverrides, 'custom')) {
    throw new Error('Fixture durationOverrides cannot contain custom');
  }
  for (const [methodId, durationMinutes] of Object.entries(durationOverrides)) {
    if (!BUILT_IN_METHOD_IDS.includes(methodId)) {
      throw new Error(`${label} contains unsupported method ${methodId}`);
    }
    assertIntegerInRange(durationMinutes, 1, 60, `${label}.${methodId}`);
  }
}

function validateLedgerEntry(entry, index) {
  const label = `Fixture preferences.localSessionLedger[${index}]`;
  assertObject(entry, label);
  assertSharedSchema(
    practiceSessionCreateSchema,
    entry,
    label,
    'practice session create'
  );

  if (entry.origin === 'custom') {
    if (entry.state !== 'local-only') {
      throw new Error(`${label} custom rows must use state local-only`);
    }
    if (
      entry.methodType !== 'custom' ||
      entry.methodId !== null ||
      entry.customRhythmId !== null
    ) {
      throw new Error(`${label} custom rows require custom method fields`);
    }
    return;
  }

  if (entry.origin !== 'built_in') {
    throw new Error(`${label}.origin must be custom or built_in`);
  }
  if (!['pending', 'retry-paused', 'failed-terminal'].includes(entry.state)) {
    throw new Error(`${label} built-in rows use an unsupported state`);
  }
  if (
    entry.methodType !== 'built_in' ||
    typeof entry.methodId !== 'string' ||
    entry.methodId.length === 0 ||
    entry.customRhythmId !== null
  ) {
    throw new Error(`${label} built-in rows require built-in method fields`);
  }

  if (entry.state === 'pending') {
    assertIntegerInRange(entry.attemptCount, 0, 4, `${label}.attemptCount`);
    assertNullableDateTime(entry.nextAttemptAt, `${label}.nextAttemptAt`);
    assertNullableNonEmptyString(entry.lastErrorCode, `${label}.lastErrorCode`);
    return;
  }
  if (entry.state === 'retry-paused') {
    if (entry.attemptCount !== 5) {
      throw new Error(`${label} retry-paused rows require attemptCount 5`);
    }
    if (entry.nextAttemptAt !== null) {
      throw new Error(`${label} retry-paused rows require nextAttemptAt null`);
    }
    if (
      typeof entry.lastErrorCode !== 'string' ||
      entry.lastErrorCode.length === 0
    ) {
      throw new Error(`${label} retry-paused rows require lastErrorCode`);
    }
    return;
  }
  if (
    typeof entry.lastErrorCode !== 'string' ||
    entry.lastErrorCode.length === 0
  ) {
    throw new Error(`${label} failed-terminal rows require lastErrorCode`);
  }
  if (Object.hasOwn(entry, 'nextAttemptAt') && entry.nextAttemptAt !== null) {
    throw new Error(
      `${label} failed-terminal rows cannot schedule another attempt`
    );
  }
  if (
    Object.hasOwn(entry, 'attemptCount') &&
    (!Number.isInteger(entry.attemptCount) ||
      entry.attemptCount < 0 ||
      entry.attemptCount > 5)
  ) {
    throw new Error(`${label} failed-terminal attemptCount is invalid`);
  }
}

function validateApiConsistency(api) {
  const emptyStats = api.stats.empty;
  const emptyTotals = [
    emptyStats.totalSessions,
    emptyStats.totalPracticeSeconds,
    emptyStats.weeklyPracticeSeconds,
    emptyStats.currentStreak
  ];
  if (
    emptyTotals.some((value) => value !== 0) ||
    emptyStats.recentSessions.length !== 0 ||
    api.sessions.empty.length !== 0
  ) {
    throw new Error(
      'Fixture empty stats and sessions must contain only zero totals and no rows'
    );
  }

  const stats = api.stats.populated;
  const sessions = api.sessions.populated;
  const expectedRecentSessions = sessions
    .slice()
    .sort((left, right) => {
      const endedAtDifference =
        Date.parse(right.endedAt) - Date.parse(left.endedAt);
      return endedAtDifference || left.id.localeCompare(right.id);
    })
    .slice(0, 10);
  if (!isDeepStrictEqual(stats.recentSessions, expectedRecentSessions)) {
    throw new Error(
      'Fixture populated stats recentSessions must equal the newest 10 populated sessions'
    );
  }

  const now = new Date(FIXTURE_NOW).getTime();
  const fixtureLocalDay = (timestamp) =>
    Math.floor((timestamp + FIXTURE_UTC_OFFSET_MS) / DAY_MS);
  const practicedDays = new Set(
    sessions
      .map((session) => Date.parse(session.endedAt))
      .filter((endedAt) => endedAt <= now)
      .map(fixtureLocalDay)
  );
  let streakDay = fixtureLocalDay(now);
  let currentStreak = 0;
  while (practicedDays.has(streakDay)) {
    currentStreak += 1;
    streakDay -= 1;
  }
  if (stats.currentStreak !== currentStreak) {
    throw new Error(
      'Fixture populated stats currentStreak must match fixture-local session days'
    );
  }

  const totalPracticeSeconds = sessions.reduce(
    (total, session) => total + session.actualDurationSeconds,
    0
  );
  const weeklyStart = now - 6 * DAY_MS;
  const weeklyPracticeSeconds = sessions
    .filter((session) => {
      const endedAt = new Date(session.endedAt).getTime();
      return endedAt >= weeklyStart && endedAt <= now;
    })
    .reduce((total, session) => total + session.actualDurationSeconds, 0);
  if (
    stats.totalSessions !== sessions.length ||
    stats.totalPracticeSeconds !== totalPracticeSeconds ||
    stats.weeklyPracticeSeconds !== weeklyPracticeSeconds
  ) {
    throw new Error(
      'Fixture populated stats totals must match populated sessions'
    );
  }
}

function validateSessionState(id, session) {
  assertObject(session, `${id}.session`);
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
    if (
      !Number.isInteger(session[key]) ||
      session[key] < 0 ||
      session[key] > SESSION_DURATION_SECONDS
    ) {
      throw new Error(
        `${id}.session.${key} must be an integer between 0 and ${SESSION_DURATION_SECONDS}`
      );
    }
  }
  if (
    session.elapsedSeconds + session.remainingSeconds !==
    SESSION_DURATION_SECONDS
  ) {
    throw new Error(
      `${id}.session elapsedSeconds and remainingSeconds must sum to ${SESSION_DURATION_SECONDS}`
    );
  }

  const expected = SESSION_STATE_SEMANTICS[id];
  if (!expected) {
    throw new Error(`${id}.session has no declared semantics`);
  }
  if (session.status !== expected.status) {
    throw new Error(`${id}.session.status must be ${expected.status}`);
  }
  if (session.phaseKind !== expected.phaseKind) {
    throw new Error(`${id}.session.phaseKind must be ${expected.phaseKind}`);
  }

  if (id === 'session-ready') {
    if (
      session.phaseProgress !== expected.phaseProgress ||
      session.elapsedSeconds !== expected.elapsedSeconds
    ) {
      throw new Error(`${id}.session must start at progress 0 and elapsed 0`);
    }
    return;
  }
  if (id === 'session-completed') {
    if (
      session.phaseProgress !== expected.phaseProgress ||
      session.elapsedSeconds !== expected.elapsedSeconds ||
      session.remainingSeconds !== expected.remainingSeconds
    ) {
      throw new Error(
        `${id}.session must finish at progress 1, elapsed ${SESSION_DURATION_SECONDS}, and remaining 0`
      );
    }
    return;
  }
  if (session.phaseProgress <= 0 || session.phaseProgress >= 1) {
    throw new Error(
      `${id}.session.phaseProgress must be greater than 0 and less than 1`
    );
  }
  if (session.elapsedSeconds === 0 || session.remainingSeconds === 0) {
    throw new Error(`${id}.session must be inside the planned duration`);
  }
  if (
    session.phaseProgress !== expected.phaseProgress ||
    session.elapsedSeconds !== expected.elapsedSeconds ||
    session.remainingSeconds !== expected.remainingSeconds
  ) {
    throw new Error(`${id}.session must exactly match its visual snapshot`);
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
  assertSharedSchema(meSchema, fixture.api.me, 'Fixture api.me', 'me');
  if (!fixture.api.me.id || !fixture.api.me.email?.endsWith('.invalid')) {
    throw new Error('Fixture /me must use a fixed synthetic .invalid user');
  }
  assertSharedSchema(
    breathingMethodsSchema,
    fixture.api.methods,
    'Fixture api.methods',
    'breathing method'
  );
  if (
    fixture.api.methods.map(({ id }) => id).join(',') !==
      'box,four-seven-eight,coherent'
  ) {
    throw new Error('Fixture methods must contain the three fixed built-ins');
  }
  assertObject(fixture.api.stats, 'Fixture api.stats');
  assertSharedSchema(
    statsSummarySchema,
    fixture.api.stats.empty,
    'Fixture api.stats.empty',
    'stats summary'
  );
  assertSharedSchema(
    statsSummarySchema,
    fixture.api.stats.populated,
    'Fixture api.stats.populated',
    'stats summary'
  );
  assertObject(fixture.api.sessions, 'Fixture api.sessions');
  assertSharedSchema(
    practiceSessionsSchema,
    fixture.api.sessions.empty,
    'Fixture api.sessions.empty',
    'practice session'
  );
  assertSharedSchema(
    practiceSessionsSchema,
    fixture.api.sessions.populated,
    'Fixture api.sessions.populated',
    'practice session'
  );
  validateApiConsistency(fixture.api);

  assertObject(fixture.preferences, 'Fixture preferences');
  if (
    fixture.preferences.storageKey !==
    `easyMeditation.preferences.${fixture.api.me.id}`
  ) {
    throw new Error('Fixture preference key must be scoped to the fixture user');
  }
  validateCustomRhythm(fixture.preferences.customRhythm);
  validateDurationOverrides(fixture.preferences.durationOverrides);
  assertBoolean(
    fixture.preferences.soundEnabled,
    'Fixture preferences.soundEnabled'
  );
  assertBoolean(
    fixture.preferences.beforeStartDismissed,
    'Fixture preferences.beforeStartDismissed'
  );
  if (!Array.isArray(fixture.preferences.localSessionLedger)) {
    throw new Error('Fixture localSessionLedger must be an array');
  }
  fixture.preferences.localSessionLedger.forEach(validateLedgerEntry);

  assertObject(fixture.states, 'Fixture states');
  const expectedStateIds = VISUAL_QA_STATES.map(({ id }) => id);
  if (
    Object.keys(fixture.states).length !== expectedStateIds.length ||
    !expectedStateIds.every(
      (id, index) => Object.keys(fixture.states)[index] === id
    )
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
