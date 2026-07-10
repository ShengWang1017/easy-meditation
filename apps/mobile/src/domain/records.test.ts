import { afterEach, describe, expect, it } from 'vitest';
import type {
  PracticeSession,
  PracticeSessionCreateInput,
  StatsSummary
} from '@easy-meditation/shared';

import type { LocalSessionLedgerEntry } from './sessionLedger';
import { deriveMergedRecords } from './records';

const originalTimezone = process.env.TZ;
const rhythmSnapshot = [
  { kind: 'inhale' as const, label: '吸气', durationSeconds: 4 },
  { kind: 'exhale' as const, label: '呼气', durationSeconds: 4 }
];

afterEach(() => {
  process.env.TZ = originalTimezone;
});

function uuid(prefix: number, index: number): string {
  return `${prefix.toString().padStart(8, '0')}-0000-4000-8000-${index
    .toString()
    .padStart(12, '0')}`;
}

function input(
  index: number,
  options: Partial<PracticeSessionCreateInput> = {}
): PracticeSessionCreateInput {
  return {
    clientSessionId: uuid(1, index),
    methodType: 'built_in',
    methodId: 'box',
    customRhythmId: null,
    methodTitleSnapshot: `练习 ${index}`,
    rhythmSnapshot,
    plannedDurationSeconds: 300,
    actualDurationSeconds: 60,
    completed: true,
    startedAt: '2026-07-10T10:00:00.000Z',
    endedAt: '2026-07-10T10:01:00.000Z',
    ...options
  };
}

function server(
  index: number,
  options: Partial<PracticeSession> = {}
): PracticeSession {
  return {
    ...input(index),
    id: uuid(2, index),
    createdAt: '2026-07-10T10:01:01.000Z',
    ...options
  };
}

function ledger(
  index: number,
  state: LocalSessionLedgerEntry['state'],
  options: Partial<PracticeSessionCreateInput> = {}
): LocalSessionLedgerEntry {
  const record = input(index, options);
  if (state === 'local-only') {
    return {
      ...record,
      methodType: 'custom',
      methodId: null,
      origin: 'custom',
      state
    };
  }
  if (state === 'failed-terminal') {
    return {
      ...record,
      origin: 'built_in',
      state,
      lastErrorCode: 'INVALID_SESSION'
    };
  }
  return {
    ...record,
    origin: 'built_in',
    state,
    attemptCount: state === 'retry-paused' ? 5 : 0,
    nextAttemptAt: null,
    lastErrorCode: state === 'retry-paused' ? 'NETWORK_ERROR' : null
  };
}

function summary(
  options: Partial<StatsSummary> = {}
): StatsSummary {
  return {
    totalSessions: 0,
    totalPracticeSeconds: 0,
    weeklyPracticeSeconds: 0,
    currentStreak: 0,
    recentSessions: [],
    ...options
  };
}

function localIso(
  year: number,
  monthIndex: number,
  day: number,
  hour = 12
): string {
  return new Date(year, monthIndex, day, hour).toISOString();
}

describe('deriveMergedRecords', () => {
  it('prefers server rows and counts every deduplicated ledger state once', () => {
    const accepted = server(1, { actualDurationSeconds: 120 });
    const result = deriveMergedRecords({
      summary: summary({
        totalSessions: 10,
        totalPracticeSeconds: 1_000,
        weeklyPracticeSeconds: 500,
        recentSessions: [accepted]
      }),
      serverSessions: [accepted, { ...accepted }],
      ledger: [
        ledger(1, 'pending', { actualDurationSeconds: 120 }),
        ledger(2, 'local-only', { actualDurationSeconds: 60 }),
        ledger(3, 'pending', { actualDurationSeconds: 70 }),
        ledger(4, 'retry-paused', { actualDurationSeconds: 80 }),
        ledger(5, 'failed-terminal', { actualDurationSeconds: 90 }),
        ledger(5, 'failed-terminal', { actualDurationSeconds: 90 })
      ],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.sessions).toHaveLength(5);
    expect(result.sessions.find((item) => item.clientSessionId === accepted.clientSessionId))
      .toMatchObject({ id: accepted.id, source: 'server' });
    expect(
      result.sessions.find((item) => item.clientSessionId === accepted.clientSessionId)
    ).not.toHaveProperty('ledgerState');
    expect(result.totalSessions).toBe(14);
    expect(result.totalPracticeSeconds).toBe(1_300);
    expect(result.weeklyPracticeSeconds).toBe(800);
  });

  it('derives degraded totals from visible server rows when the summary is missing', () => {
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [
        server(1, { actualDurationSeconds: 75 }),
        server(2, { actualDurationSeconds: 125 })
      ],
      ledger: [ledger(3, 'local-only', { actualDurationSeconds: 40 })],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.totalSessions).toBe(3);
    expect(result.totalPracticeSeconds).toBe(240);
    expect(result.weeklyPracticeSeconds).toBe(240);
  });

  it('falls back to summary recent sessions when the sessions query is unavailable', () => {
    const recent = server(1, { actualDurationSeconds: 120 });
    const result = deriveMergedRecords({
      summary: summary({
        totalSessions: 8,
        totalPracticeSeconds: 900,
        weeklyPracticeSeconds: 300,
        recentSessions: [recent]
      }),
      serverSessions: null,
      ledger: [
        ledger(1, 'pending', { actualDurationSeconds: 120 }),
        ledger(2, 'local-only', { actualDurationSeconds: 45 })
      ],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.sessions.map((item) => item.clientSessionId)).toEqual([
      recent.clientSessionId,
      uuid(1, 2)
    ]);
    expect(result.totalSessions).toBe(9);
    expect(result.totalPracticeSeconds).toBe(945);
    expect(result.weeklyPracticeSeconds).toBe(345);
  });

  it('does not double count an optimistic accepted row that still has a pending ledger row', () => {
    const accepted = server(7, { actualDurationSeconds: 98 });
    const result = deriveMergedRecords({
      summary: summary({
        totalSessions: 3,
        totalPracticeSeconds: 398,
        weeklyPracticeSeconds: 398,
        recentSessions: [accepted]
      }),
      serverSessions: [accepted],
      ledger: [ledger(7, 'pending', { actualDurationSeconds: 98 })],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.totalSessions).toBe(3);
    expect(result.totalPracticeSeconds).toBe(398);
    expect(result.weeklyPracticeSeconds).toBe(398);
  });

  it.each([
    { count: 49, truncated: false },
    { count: 50, truncated: true },
    { count: 51, truncated: false }
  ])('treats $count raw server rows as truncated=$truncated', ({ count, truncated }) => {
    const serverSessions = Array.from({ length: count }, (_, index) =>
      server(index + 1)
    );
    const result = deriveMergedRecords({
      summary: null,
      serverSessions,
      ledger: [],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.serverListTruncated).toBe(truncated);
  });

  it('deduplicates duplicate server clients and sorts equal timestamps by stable id', () => {
    const duplicateClient = uuid(1, 1);
    const older = server(1, {
      id: uuid(2, 9),
      clientSessionId: duplicateClient,
      endedAt: '2026-07-10T08:00:00.000Z'
    });
    const newer = server(1, {
      id: uuid(2, 8),
      clientSessionId: duplicateClient,
      endedAt: '2026-07-10T09:00:00.000Z'
    });
    const tieB = server(2, {
      id: uuid(2, 4),
      endedAt: '2026-07-10T10:00:00.000Z'
    });
    const tieA = server(3, {
      id: uuid(2, 3),
      endedAt: '2026-07-10T10:00:00.000Z'
    });

    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [older, tieB, newer, tieA],
      ledger: [],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.sessions.map((item) => item.id)).toEqual([
      tieA.id,
      tieB.id,
      newer.id
    ]);
    expect(result.totalSessions).toBe(3);
  });

  it('buckets 00:30 and 23:30 by the same device-local day', () => {
    process.env.TZ = 'Asia/Shanghai';
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [
        server(1, {
          actualDurationSeconds: 60,
          endedAt: '2026-07-10T00:30:00+08:00'
        }),
        server(2, {
          actualDurationSeconds: 120,
          endedAt: '2026-07-10T23:30:00+08:00'
        })
      ],
      ledger: [],
      now: new Date('2026-07-10T23:59:00+08:00')
    });

    expect(result.calendarDays.at(-1)).toMatchObject({
      key: '2026-07-10',
      durationSeconds: 180,
      minutes: 3,
      sessions: 2,
      level: 2
    });
  });

  it.each([
    { now: [2025, 2, 10] as const, first: '2025-02-11', last: '2025-03-10' },
    { now: [2025, 10, 3] as const, first: '2025-10-07', last: '2025-11-03' }
  ])('generates 28 unique calendar dates across DST at $last', ({ now, first, last }) => {
    process.env.TZ = 'America/New_York';
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [],
      ledger: [],
      now: new Date(now[0], now[1], now[2], 12)
    });
    const keys = result.calendarDays.map((day) => day.key);

    expect(keys).toHaveLength(28);
    expect(new Set(keys)).toHaveLength(28);
    expect(keys[0]).toBe(first);
    expect(keys.at(-1)).toBe(last);
  });

  it('includes exact rolling-week bounds and excludes future ledger rows', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const lower = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1_000);
    const result = deriveMergedRecords({
      summary: summary(),
      serverSessions: [],
      ledger: [
        ledger(1, 'pending', {
          actualDurationSeconds: 60,
          endedAt: lower.toISOString()
        }),
        ledger(2, 'pending', {
          actualDurationSeconds: 120,
          endedAt: now.toISOString()
        }),
        ledger(3, 'pending', {
          actualDurationSeconds: 240,
          endedAt: new Date(now.getTime() + 1).toISOString()
        })
      ],
      now
    });

    expect(result.weeklyPracticeSeconds).toBe(180);
  });

  it('aggregates sessions and applies exact practiced-minute levels', () => {
    process.env.TZ = 'Asia/Shanghai';
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [
        server(1, { actualDurationSeconds: 1, endedAt: localIso(2026, 6, 6) }),
        server(2, { actualDurationSeconds: 179, endedAt: localIso(2026, 6, 7) }),
        server(3, { actualDurationSeconds: 1, endedAt: localIso(2026, 6, 7) }),
        server(4, { actualDurationSeconds: 360, endedAt: localIso(2026, 6, 8) }),
        server(5, { actualDurationSeconds: 600, endedAt: localIso(2026, 6, 9) })
      ],
      ledger: [],
      now: new Date(2026, 6, 10, 12)
    });
    const days = new Map(result.calendarDays.map((day) => [day.key, day]));

    expect(days.get('2026-07-06')).toMatchObject({ minutes: 1 / 60, level: 1 });
    expect(days.get('2026-07-07')).toMatchObject({
      durationSeconds: 180,
      sessions: 2,
      level: 2
    });
    expect(days.get('2026-07-08')?.level).toBe(3);
    expect(days.get('2026-07-09')?.level).toBe(4);
    expect(days.get('2026-07-10')?.level).toBe(0);
  });

  it('returns a zero streak when today has no practice', () => {
    process.env.TZ = 'Asia/Shanghai';
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [server(1, { endedAt: localIso(2026, 6, 9) })],
      ledger: [],
      now: new Date(2026, 6, 10, 12)
    });

    expect(result.streak).toEqual({ value: 0, label: '0', isLowerBound: false });
  });

  it('marks a contiguous streak reaching an exactly-50-row boundary as a lower bound', () => {
    process.env.TZ = 'Asia/Shanghai';
    const now = new Date(2026, 6, 10, 12);
    const contiguous = Array.from({ length: 12 }, (_, index) =>
      server(index + 1, { endedAt: localIso(2026, 6, 10 - index) })
    );
    const oldest = contiguous.at(-1)!;
    const padding = Array.from({ length: 38 }, (_, index) =>
      server(index + 20, {
        endedAt: oldest.endedAt,
        actualDurationSeconds: 1
      })
    );
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: [...contiguous, ...padding],
      ledger: [],
      now
    });

    expect(result.streak).toEqual({ value: 12, label: '12+', isLowerBound: true });
  });

  it('does not add a lower-bound marker when the oldest server day is beyond a gap', () => {
    process.env.TZ = 'Asia/Shanghai';
    const now = new Date(2026, 6, 10, 12);
    const rows = [
      server(1, { endedAt: localIso(2026, 6, 10) }),
      server(2, { endedAt: localIso(2026, 6, 9) }),
      ...Array.from({ length: 48 }, (_, index) =>
        server(index + 10, { endedAt: localIso(2026, 6, 1) })
      )
    ];
    const result = deriveMergedRecords({
      summary: null,
      serverSessions: rows,
      ledger: [],
      now
    });

    expect(result.streak).toEqual({ value: 2, label: '2', isLowerBound: false });
  });

  it('returns only five recent rows after deterministic sorting', () => {
    const serverSessions = Array.from({ length: 7 }, (_, index) =>
      server(index + 1, {
        endedAt: new Date(Date.parse('2026-07-10T12:00:00.000Z') - index * 1_000)
          .toISOString()
      })
    );
    const result = deriveMergedRecords({
      summary: null,
      serverSessions,
      ledger: [],
      now: new Date('2026-07-10T12:00:00.000Z')
    });

    expect(result.recentSessions.map((item) => item.id)).toEqual(
      serverSessions.slice(0, 5).map((item) => item.id)
    );
  });
});
