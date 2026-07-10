import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadVisualQaFixture,
  runFixtureCli,
  validateVisualQaFixture
} from './fixture.mjs';
import { VISUAL_QA_STATES } from './states.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const fixturePath = path.join(
  repositoryRoot,
  'qa/fixtures/mobile-prototype.json'
);

test('loads the shared deterministic fixture with all 13 explicit state scopes', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const stateIds = VISUAL_QA_STATES.map(({ id }) => id);

  assert.equal(fixture.version, 1);
  assert.equal(fixture.now, '2026-07-10T12:00:00+08:00');
  assert.deepEqual(fixture.api.me, {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'visual-qa@example.invalid',
    nickname: '静心者',
    createdAt: '2026-07-01T04:00:00.000Z'
  });
  assert.deepEqual(
    fixture.api.methods.map(({ id }) => id),
    ['box', 'four-seven-eight', 'coherent']
  );
  assert.deepEqual(Object.keys(fixture.states), stateIds);
  assert.equal(fixture.api.sessions.empty.length, 0);
  assert.ok(fixture.api.sessions.populated.length > 0);
  assert.equal(fixture.preferences.storageKey.endsWith(fixture.api.me.id), true);
  assert.ok(fixture.preferences.localSessionLedger.length > 0);

  for (const id of stateIds) {
    const state = fixture.states[id];
    const expectedScope = ['login', 'register'].includes(id)
      ? 'unauthenticated'
      : 'authenticated';
    assert.equal(state.authScope, expectedScope, id);
    if (id.startsWith('session-')) {
      assert.notEqual(state.session, null, id);
      assert.equal(typeof state.session.phaseKind, 'string', id);
      assert.equal(typeof state.session.phaseProgress, 'number', id);
    } else {
      assert.equal(state.session, null, id);
    }
  }

  assert.doesNotMatch(
    JSON.stringify(fixture),
    /accessToken|refreshToken|password|bearer/i
  );
});

test('rejects unknown or missing visual states instead of filling them in', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const withUnknown = structuredClone(fixture);
  withUnknown.states.future = {
    authScope: 'authenticated',
    session: null
  };
  assert.throws(
    () => validateVisualQaFixture(withUnknown),
    /Fixture states must exactly match the 13-state manifest/
  );

  const withMissing = structuredClone(fixture);
  delete withMissing.states.guide;
  assert.throws(
    () => validateVisualQaFixture(withMissing),
    /Fixture states must exactly match the 13-state manifest/
  );
});

test('rejects invalid session progress and secret-like fixture keys', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const invalidProgress = structuredClone(fixture);
  invalidProgress.states['session-inhale'].session.phaseProgress = 1.01;
  assert.throws(
    () => validateVisualQaFixture(invalidProgress),
    /session-inhale\.session\.phaseProgress must be between 0 and 1/
  );

  const secretBearing = structuredClone(fixture);
  secretBearing.api.accessToken = 'must-not-exist';
  assert.throws(
    () => validateVisualQaFixture(secretBearing),
    /Fixture contains forbidden secret-like key: api\.accessToken/
  );
});

test('validates API fixtures through the shared contract schemas', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);

  const invalidMe = structuredClone(fixture);
  invalidMe.api.me.id = 'not-a-uuid';
  assert.throws(
    () => validateVisualQaFixture(invalidMe),
    /Fixture api\.me must match the shared me schema/
  );

  const invalidMethod = structuredClone(fixture);
  invalidMethod.api.methods[0].phases[0].durationSeconds = 0;
  assert.throws(
    () => validateVisualQaFixture(invalidMethod),
    /Fixture api\.methods must match the shared breathing method schema/
  );

  const invalidStats = structuredClone(fixture);
  invalidStats.api.stats.populated.totalSessions = -1;
  assert.throws(
    () => validateVisualQaFixture(invalidStats),
    /Fixture api\.stats\.populated must match the shared stats summary schema/
  );

  const invalidSessions = structuredClone(fixture);
  invalidSessions.api.sessions.populated[0].actualDurationSeconds = 0;
  assert.throws(
    () => validateVisualQaFixture(invalidSessions),
    /Fixture api\.sessions\.populated must match the shared practice session schema/
  );
});

test('rejects invalid custom rhythm, override, and preference scalar values', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);

  const invalidPhase = structuredClone(fixture);
  invalidPhase.preferences.customRhythm.inhaleSeconds = 13;
  assert.throws(
    () => validateVisualQaFixture(invalidPhase),
    /Fixture preferences\.customRhythm\.inhaleSeconds must be an integer between 1 and 12/
  );

  const stringOverride = structuredClone(fixture);
  stringOverride.preferences.durationOverrides.box = '5';
  assert.throws(
    () => validateVisualQaFixture(stringOverride),
    /Fixture preferences\.durationOverrides\.box must be an integer between 1 and 60/
  );

  const invalidBoolean = structuredClone(fixture);
  invalidBoolean.preferences.soundEnabled = 'true';
  assert.throws(
    () => validateVisualQaFixture(invalidBoolean),
    /Fixture preferences\.soundEnabled must be a boolean/
  );
});

test('rejects inconsistent local ledger discriminants and retry metadata', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);

  const inconsistentCustom = structuredClone(fixture);
  inconsistentCustom.preferences.localSessionLedger[0].methodType = 'built_in';
  inconsistentCustom.preferences.localSessionLedger[0].methodId = 'box';
  assert.throws(
    () => validateVisualQaFixture(inconsistentCustom),
    /Fixture preferences\.localSessionLedger\[0\] custom rows require custom method fields/
  );

  const inconsistentRetry = structuredClone(fixture);
  Object.assign(inconsistentRetry.preferences.localSessionLedger[0], {
    origin: 'built_in',
    state: 'retry-paused',
    methodType: 'built_in',
    methodId: 'box',
    attemptCount: 4,
    nextAttemptAt: null,
    lastErrorCode: 'NETWORK_ERROR'
  });
  assert.throws(
    () => validateVisualQaFixture(inconsistentRetry),
    /Fixture preferences\.localSessionLedger\[0\] retry-paused rows require attemptCount 5/
  );
});

test('requires empty and populated stats to agree with their session fixtures', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);

  const reorderedRecent = structuredClone(fixture);
  reorderedRecent.api.stats.populated.recentSessions[0] = Object.fromEntries(
    Object.entries(
      reorderedRecent.api.stats.populated.recentSessions[0]
    ).reverse()
  );
  assert.doesNotThrow(() => validateVisualQaFixture(reorderedRecent));

  const nonEmptyEmptyStats = structuredClone(fixture);
  nonEmptyEmptyStats.api.stats.empty.totalSessions = 1;
  assert.throws(
    () => validateVisualQaFixture(nonEmptyEmptyStats),
    /Fixture empty stats and sessions must contain only zero totals and no rows/
  );

  const inconsistentPopulated = structuredClone(fixture);
  inconsistentPopulated.api.stats.populated.totalPracticeSeconds = 301;
  assert.throws(
    () => validateVisualQaFixture(inconsistentPopulated),
    /Fixture populated stats totals must match populated sessions/
  );

  const missingRecentSession = structuredClone(fixture);
  missingRecentSession.api.stats.populated.recentSessions[0].clientSessionId =
    '55555555-5555-4555-8555-555555555555';
  assert.throws(
    () => validateVisualQaFixture(missingRecentSession),
    /Fixture populated recentSessions must reference populated sessions/
  );
});

test('normalizes secret-like key spelling without flagging clientSessionId', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const allowed = structuredClone(fixture);
  allowed.api.metadata = { clientSessionId: 'synthetic-reference' };
  assert.doesNotThrow(() => validateVisualQaFixture(allowed));

  for (const key of [
    'idToken',
    'authToken',
    'apiKey',
    'clientSecret',
    'access_token',
    'cookie'
  ]) {
    const secretBearing = structuredClone(fixture);
    secretBearing.api.metadata = { [key]: 'must-not-exist' };
    assert.throws(
      () => validateVisualQaFixture(secretBearing),
      new RegExp(
        `Fixture contains forbidden secret-like key: api\\.metadata\\.${key}`
      ),
      key
    );
  }
});

test('rejects a global preference key or a custom duration override', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const globalKey = structuredClone(fixture);
  globalKey.preferences.storageKey = 'easyMeditation.preferences';
  assert.throws(
    () => validateVisualQaFixture(globalKey),
    /Fixture preference key must be scoped to the fixture user/
  );

  const customOverride = structuredClone(fixture);
  customOverride.preferences.durationOverrides.custom = 5;
  assert.throws(
    () => validateVisualQaFixture(customOverride),
    /Fixture durationOverrides cannot contain custom/
  );
});

test('fixture CLI validates an explicit JSON path without exposing payload data', async () => {
  const output = [];
  const code = await runFixtureCli([fixturePath], {
    write: (value) => output.push(value),
    writeError: () => assert.fail('valid fixture must not write stderr')
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output.join('')), {
    valid: true,
    version: 1,
    states: 13,
    now: '2026-07-10T12:00:00+08:00'
  });
});
