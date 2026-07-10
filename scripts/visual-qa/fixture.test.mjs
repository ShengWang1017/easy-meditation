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
