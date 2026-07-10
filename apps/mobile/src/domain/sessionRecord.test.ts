import { describe, expect, it } from 'vitest';

import type { ResolvedSessionMethod } from './sessionRecord';
import { buildSessionLedgerEntry } from './sessionRecord';

const builtInMethod: ResolvedSessionMethod = {
  id: 'box',
  title: '盒式呼吸法',
  phases: [
    { kind: 'inhale', label: '吸气', durationSeconds: 4 },
    { kind: 'hold', label: '屏息', durationSeconds: 4 },
    { kind: 'exhale', label: '呼气', durationSeconds: 4 },
    { kind: 'hold', label: '屏息', durationSeconds: 4 }
  ],
  plannedDurationSeconds: 300,
  origin: 'built_in'
};

const baseOptions = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  method: builtInMethod,
  actualDurationSeconds: 61,
  completed: false,
  startedAt: '2026-07-10T04:00:00.000Z',
  endedAt: '2026-07-10T04:01:01.000Z'
};

describe('buildSessionLedgerEntry', () => {
  it.each([0, 0.999])('returns null below one practiced second (%s)', (seconds) => {
    expect(
      buildSessionLedgerEntry({ ...baseOptions, actualDurationSeconds: seconds })
    ).toBeNull();
  });

  it('builds a pending built-in intentional-end snapshot with the display title', () => {
    expect(buildSessionLedgerEntry(baseOptions)).toEqual({
      clientSessionId: baseOptions.clientSessionId,
      methodType: 'built_in',
      methodId: 'box',
      customRhythmId: null,
      methodTitleSnapshot: '盒式呼吸法',
      rhythmSnapshot: builtInMethod.phases,
      plannedDurationSeconds: 300,
      actualDurationSeconds: 61,
      completed: false,
      startedAt: baseOptions.startedAt,
      endedAt: baseOptions.endedAt,
      origin: 'built_in',
      state: 'pending',
      attemptCount: 0,
      nextAttemptAt: baseOptions.endedAt,
      lastErrorCode: null
    });
  });

  it('marks natural built-in completion without changing its initial retry state', () => {
    expect(
      buildSessionLedgerEntry({ ...baseOptions, actualDurationSeconds: 300, completed: true })
    ).toMatchObject({
      completed: true,
      actualDurationSeconds: 300,
      origin: 'built_in',
      state: 'pending',
      attemptCount: 0,
      nextAttemptAt: baseOptions.endedAt,
      lastErrorCode: null
    });
  });

  it('builds a custom local-only entry with null server-owned identifiers', () => {
    const customMethod: ResolvedSessionMethod = {
      id: 'custom',
      title: '自定义',
      phases: [
        { kind: 'inhale', label: '吸气', durationSeconds: 4 },
        { kind: 'hold', label: '屏息', durationSeconds: 2 },
        { kind: 'exhale', label: '呼气', durationSeconds: 5 }
      ],
      plannedDurationSeconds: 120,
      origin: 'custom'
    };

    const entry = buildSessionLedgerEntry({
      ...baseOptions,
      method: customMethod,
      completed: true
    });

    expect(entry).toEqual({
      clientSessionId: baseOptions.clientSessionId,
      methodType: 'custom',
      methodId: null,
      customRhythmId: null,
      methodTitleSnapshot: '自定义',
      rhythmSnapshot: customMethod.phases,
      plannedDurationSeconds: 120,
      actualDurationSeconds: 61,
      completed: true,
      startedAt: baseOptions.startedAt,
      endedAt: baseOptions.endedAt,
      origin: 'custom',
      state: 'local-only'
    });
    expect(entry).not.toHaveProperty('attemptCount');
    expect(entry).not.toHaveProperty('nextAttemptAt');
    expect(entry).not.toHaveProperty('lastErrorCode');
  });
});
