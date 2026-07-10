import fixtureJson from '../../../../qa/fixtures/mobile-prototype.json';
import { readFileSync } from 'node:fs';

import {
  VISUAL_QA_STATES,
  parseVisualQaFixture,
  resolveVisualQaFixture
} from './visualQa';

const EXPECTED_STATES = [
  'practice',
  'guide',
  'custom',
  'session-ready',
  'session-inhale',
  'session-hold',
  'session-exhale',
  'session-paused',
  'session-completed',
  'records-empty',
  'records-populated',
  'login',
  'register'
] as const;

const EXPECTED_ROUTES = {
  practice: '/(tabs)/practice',
  guide: '/guide',
  custom: '/custom-rhythm',
  'session-ready': '/session/box',
  'session-inhale': '/session/box',
  'session-hold': '/session/box',
  'session-exhale': '/session/box',
  'session-paused': '/session/box',
  'session-completed': '/session/box',
  'records-empty': '/(tabs)/records',
  'records-populated': '/(tabs)/records',
  login: '/(auth)/login',
  register: '/(auth)/register'
} as const;

describe('visual QA fixture resolver', () => {
  it('keeps the shared JSON behind the deferred resolver loader', () => {
    const source = readFileSync(
      `${process.cwd()}/src/qa/visualQa.ts`,
      'utf8'
    );

    expect(source).not.toMatch(
      /^import\s+.+mobile-prototype\.json['"];?$/m
    );
    expect(source).toMatch(
      /function loadSharedVisualQaFixture\(\)[\s\S]*require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/qa\/fixtures\/mobile-prototype\.json['"]\)/
    );
  });

  it('exports the exact 13-state contract and route mapping', () => {
    expect(VISUAL_QA_STATES).toEqual(EXPECTED_STATES);

    for (const state of EXPECTED_STATES) {
      const resolved = resolveVisualQaFixture(
        { dev: true, requested: true, state },
        () => fixtureJson
      );
      expect(resolved?.id).toBe(state);
      expect(resolved?.route).toBe(EXPECTED_ROUTES[state]);
    }
  });

  it('returns null before reading fixture data outside the explicit dev gate', () => {
    const loadFixture = vi.fn(() => {
      throw new Error('fixture must not be read');
    });

    expect(
      resolveVisualQaFixture(
        { dev: false, requested: true, state: 'practice' },
        loadFixture
      )
    ).toBeNull();
    expect(
      resolveVisualQaFixture(
        { dev: true, requested: false, state: 'practice' },
        loadFixture
      )
    ).toBeNull();
    expect(loadFixture).not.toHaveBeenCalled();
  });

  it('rejects an unknown state without reading fixture data', () => {
    const loadFixture = vi.fn(() => fixtureJson);

    expect(
      resolveVisualQaFixture(
        { dev: true, requested: true, state: 'future-state' },
        loadFixture
      )
    ).toBeNull();
    expect(loadFixture).not.toHaveBeenCalled();
  });

  it('adapts the shared JSON fixture with fixed data and explicit snapshots', () => {
    const expectedSessions = {
      'session-ready': ['idle', 'inhale', 0, 0, 300],
      'session-inhale': ['running', 'inhale', 0.5, 2, 298],
      'session-hold': ['running', 'hold', 0.5, 6, 294],
      'session-exhale': ['running', 'exhale', 0.5, 10, 290],
      'session-paused': ['paused', 'exhale', 0.25, 9, 291],
      'session-completed': ['completed', 'complete', 1, 300, 0]
    } as const;

    for (const [state, expected] of Object.entries(expectedSessions)) {
      const resolved = resolveVisualQaFixture(
        { dev: true, requested: true, state },
        () => fixtureJson
      );
      expect(resolved?.now).toBe('2026-07-10T12:00:00+08:00');
      expect(resolved?.session).toEqual({
        status: expected[0],
        phaseKind: expected[1],
        phaseProgress: expected[2],
        elapsedSeconds: expected[3],
        remainingSeconds: expected[4]
      });
      expect(resolved?.api.me.email).toBe('visual-qa@example.invalid');
      expect(resolved?.api.methods.map(({ id }) => id)).toEqual([
        'box',
        'four-seven-eight',
        'coherent'
      ]);
    }
  });

  it('keeps auth scope and empty/populated records explicit per state', () => {
    const login = resolveVisualQaFixture(
      { dev: true, requested: true, state: 'login' },
      () => fixtureJson
    );
    const empty = resolveVisualQaFixture(
      { dev: true, requested: true, state: 'records-empty' },
      () => fixtureJson
    );
    const populated = resolveVisualQaFixture(
      { dev: true, requested: true, state: 'records-populated' },
      () => fixtureJson
    );

    expect(login?.authScope).toBe('unauthenticated');
    expect(empty?.authScope).toBe('authenticated');
    expect(empty?.stats.totalSessions).toBe(0);
    expect(empty?.sessions).toEqual([]);
    expect(populated?.stats.totalSessions).toBe(1);
    expect(populated?.sessions).toHaveLength(1);
  });

  it('validates shared API and preference schemas instead of accepting drift', () => {
    const invalid = structuredClone(fixtureJson);
    invalid.api.methods[0]!.phases[0]!.durationSeconds = 0;

    expect(() => parseVisualQaFixture(invalid)).toThrow(
      /Visual QA fixture\.api\.methods/
    );
  });
});
