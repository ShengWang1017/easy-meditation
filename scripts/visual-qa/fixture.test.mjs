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

function configurePopulatedApi(
  fixture,
  sessions,
  { currentStreak, recentSessions }
) {
  fixture.api.sessions.populated = sessions;
  fixture.api.stats.populated = {
    totalSessions: sessions.length,
    totalPracticeSeconds: sessions.reduce(
      (total, session) => total + session.actualDurationSeconds,
      0
    ),
    weeklyPracticeSeconds: sessions.reduce(
      (total, session) => total + session.actualDurationSeconds,
      0
    ),
    currentStreak,
    recentSessions
  };
}

function syntheticSession(base, index, endedAt) {
  const suffix = String(index + 1).padStart(12, '0');
  const endedAtMs = Date.parse(endedAt);
  return {
    ...structuredClone(base),
    id: `22222222-2222-4222-8222-${suffix}`,
    clientSessionId: `33333333-3333-4333-8333-${suffix}`,
    actualDurationSeconds: 60,
    startedAt: new Date(endedAtMs - 60_000).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    createdAt: new Date(endedAtMs).toISOString()
  };
}

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

test('binds each session fixture ID to its exact lifecycle semantics', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);

  const completedAsInhale = structuredClone(fixture);
  completedAsInhale.states['session-inhale'].session = structuredClone(
    completedAsInhale.states['session-completed'].session
  );
  assert.throws(
    () => validateVisualQaFixture(completedAsInhale),
    /session-inhale\.session\.status must be running/
  );

  const advancedReady = structuredClone(fixture);
  Object.assign(advancedReady.states['session-ready'].session, {
    phaseProgress: 0.25,
    elapsedSeconds: 1,
    remainingSeconds: 299
  });
  assert.throws(
    () => validateVisualQaFixture(advancedReady),
    /session-ready\.session must start at progress 0 and elapsed 0/
  );

  const wrongPausedPhase = structuredClone(fixture);
  wrongPausedPhase.states['session-paused'].session.phaseKind = 'hold';
  assert.throws(
    () => validateVisualQaFixture(wrongPausedPhase),
    /session-paused\.session\.phaseKind must be exhale/
  );

  const invalidDuration = structuredClone(fixture);
  invalidDuration.states['session-hold'].session.remainingSeconds = 293;
  assert.throws(
    () => validateVisualQaFixture(invalidDuration),
    /session-hold\.session elapsedSeconds and remainingSeconds must sum to 300/
  );

  const incompleteCompletion = structuredClone(fixture);
  Object.assign(incompleteCompletion.states['session-completed'].session, {
    elapsedSeconds: 299,
    remainingSeconds: 1
  });
  assert.throws(
    () => validateVisualQaFixture(incompleteCompletion),
    /session-completed\.session must finish at progress 1, elapsed 300, and remaining 0/
  );
});

test('requires running and paused snapshots to remain inside an active phase', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const terminalRunningPhase = structuredClone(fixture);
  terminalRunningPhase.states['session-exhale'].session.phaseProgress = 1;

  assert.throws(
    () => validateVisualQaFixture(terminalRunningPhase),
    /session-exhale\.session\.phaseProgress must be greater than 0 and less than 1/
  );
});

test('locks active session IDs to their exact visual snapshot values', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const mutations = [
    ['session-inhale', 0.75, 3, 297],
    ['session-hold', 0.75, 7, 293],
    ['session-exhale', 0.75, 11, 289],
    ['session-paused', 0.5, 10, 290]
  ];

  for (const [id, phaseProgress, elapsedSeconds, remainingSeconds] of mutations) {
    const mutated = structuredClone(fixture);
    Object.assign(mutated.states[id].session, {
      phaseProgress,
      elapsedSeconds,
      remainingSeconds
    });
    assert.throws(
      () => validateVisualQaFixture(mutated),
      new RegExp(`${id}\\.session must exactly match its visual snapshot`),
      id
    );
  }
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
    /Fixture populated stats recentSessions must equal the newest 10 populated sessions/
  );
});

test('derives currentStreak from fixture +08 local days independent of host TZ', async () => {
  const originalTz = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const fixture = await loadVisualQaFixture(fixturePath);
    assert.doesNotThrow(() => validateVisualQaFixture(fixture));

    const impossibleStreak = structuredClone(fixture);
    impossibleStreak.api.stats.populated.currentStreak = 999;
    assert.throws(
      () => validateVisualQaFixture(impossibleStreak),
      /Fixture populated stats currentStreak must match fixture-local session days/
    );

    const twoLocalDays = structuredClone(fixture);
    const today = structuredClone(twoLocalDays.api.sessions.populated[0]);
    const previousLocalDay = {
      ...structuredClone(today),
      id: '66666666-6666-4666-8666-666666666666',
      clientSessionId: '77777777-7777-4777-8777-777777777777',
      startedAt: '2026-07-08T16:25:00.000Z',
      endedAt: '2026-07-08T16:30:00.000Z',
      createdAt: '2026-07-08T16:30:00.000Z'
    };
    configurePopulatedApi(twoLocalDays, [today, previousLocalDay], {
      currentStreak: 2,
      recentSessions: [today, previousLocalDay]
    });
    assert.doesNotThrow(() => validateVisualQaFixture(twoLocalDays));

    const utcDayGapIsNotALocalGap = structuredClone(twoLocalDays);
    utcDayGapIsNotALocalGap.api.stats.populated.currentStreak = 1;
    assert.throws(
      () => validateVisualQaFixture(utcDayGapIsNotALocalGap),
      /Fixture populated stats currentStreak must match fixture-local session days/
    );
  } finally {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  }
});

test('requires recentSessions to equal the id-tiebroken newest ten server sessions', async () => {
  const fixture = await loadVisualQaFixture(fixturePath);
  const base = fixture.api.sessions.populated[0];
  const sourceIndexes = [1, 0, 4, 2, 3, 10, 5, 6, 7, 8, 9];
  const sessions = sourceIndexes.map((index) => {
    const minuteOffset = Math.floor(index / 2);
    const endedAt = new Date(
      Date.parse('2026-07-10T03:59:00.000Z') - minuteOffset * 60_000
    ).toISOString();
    return syntheticSession(base, index, endedAt);
  });
  const expectedRecent = sessions
    .slice()
    .sort((left, right) => {
      const endedAtDifference =
        Date.parse(right.endedAt) - Date.parse(left.endedAt);
      return endedAtDifference || left.id.localeCompare(right.id);
    })
    .slice(0, 10);
  configurePopulatedApi(fixture, sessions, {
    currentStreak: 1,
    recentSessions: expectedRecent
  });
  assert.doesNotThrow(() => validateVisualQaFixture(fixture));

  const emptyRecent = structuredClone(fixture);
  emptyRecent.api.stats.populated.recentSessions = [];
  assert.throws(
    () => validateVisualQaFixture(emptyRecent),
    /Fixture populated stats recentSessions must equal the newest 10 populated sessions/
  );

  const reorderedRecent = structuredClone(fixture);
  [
    reorderedRecent.api.stats.populated.recentSessions[0],
    reorderedRecent.api.stats.populated.recentSessions[1]
  ] = [
    reorderedRecent.api.stats.populated.recentSessions[1],
    reorderedRecent.api.stats.populated.recentSessions[0]
  ];
  assert.throws(
    () => validateVisualQaFixture(reorderedRecent),
    /Fixture populated stats recentSessions must equal the newest 10 populated sessions/
  );

  const omittedRecent = structuredClone(fixture);
  omittedRecent.api.stats.populated.recentSessions.pop();
  assert.throws(
    () => validateVisualQaFixture(omittedRecent),
    /Fixture populated stats recentSessions must equal the newest 10 populated sessions/
  );

  const includedEleventh = structuredClone(fixture);
  includedEleventh.api.stats.populated.recentSessions[9] = sessions.find(
    (session) =>
      !expectedRecent.some(
        (recent) => recent.clientSessionId === session.clientSessionId
      )
  );
  assert.throws(
    () => validateVisualQaFixture(includedEleventh),
    /Fixture populated stats recentSessions must equal the newest 10 populated sessions/
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
