import type {
  PracticeSession,
  PracticeSessionCreateInput,
  StatsSummary
} from '@easy-meditation/shared';

import type { LocalSessionLedgerEntry } from './sessionLedger';

const CALENDAR_DAY_COUNT = 28;
const RECENT_SESSION_COUNT = 5;
const ROLLING_WEEK_MS = 6 * 24 * 60 * 60 * 1_000;

export type HeatmapDay = {
  key: string;
  day: number;
  label: string;
  durationSeconds: number;
  durationLabel: string;
  minutes: number;
  sessions: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type MergedRecordSession = PracticeSessionCreateInput & {
  id: string;
  source: 'server' | 'ledger';
  ledgerState?: LocalSessionLedgerEntry['state'];
};

export type MergedRecordsViewModel = {
  sessions: MergedRecordSession[];
  totalSessions: number;
  totalPracticeSeconds: number;
  weeklyPracticeSeconds: number;
  streak: { value: number; label: string; isLowerBound: boolean };
  calendarDays: HeatmapDay[];
  recentSessions: MergedRecordSession[];
  serverListTruncated: boolean;
};

export function deriveMergedRecords(options: {
  summary: StatsSummary | null;
  serverSessions: PracticeSession[] | null;
  ledger: LocalSessionLedgerEntry[];
  now: Date;
}): MergedRecordsViewModel {
  const effectiveServerSource =
    options.serverSessions ?? options.summary?.recentSessions ?? [];
  const serverSessions = dedupeServerSessions(effectiveServerSource);
  const serverClientIds = new Set(
    serverSessions.map((session) => session.clientSessionId)
  );
  const ledgerSessions = dedupeLedgerSessions(options.ledger)
    .filter((entry) => !serverClientIds.has(entry.clientSessionId))
    .map(toMergedLedgerSession);
  const mergedServerSessions = serverSessions.map(toMergedServerSession);
  const sessions = [...mergedServerSessions, ...ledgerSessions].sort(
    compareMergedSessions
  );
  const nowMs = options.now.getTime();
  const weeklyLowerBound = nowMs - ROLLING_WEEK_MS;

  const baseTotals = options.summary
    ? {
        totalSessions: options.summary.totalSessions,
        totalPracticeSeconds: options.summary.totalPracticeSeconds,
        weeklyPracticeSeconds: options.summary.weeklyPracticeSeconds
      }
    : {
        totalSessions: mergedServerSessions.length,
        totalPracticeSeconds: sumDuration(mergedServerSessions),
        weeklyPracticeSeconds: sumDuration(
          mergedServerSessions.filter((session) =>
            isWithinRollingWeek(session.endedAt, weeklyLowerBound, nowMs)
          )
        )
      };

  const totalSessions = baseTotals.totalSessions + ledgerSessions.length;
  const totalPracticeSeconds =
    baseTotals.totalPracticeSeconds + sumDuration(ledgerSessions);
  const weeklyPracticeSeconds =
    baseTotals.weeklyPracticeSeconds +
    sumDuration(
      ledgerSessions.filter((session) =>
        isWithinRollingWeek(session.endedAt, weeklyLowerBound, nowMs)
      )
    );
  const dayBuckets = bucketLocalDays(sessions);
  const calendarDays = buildCalendarDays(dayBuckets, options.now);
  const streakDays = getCurrentStreakDays(dayBuckets, options.now);
  const serverListTruncated = options.serverSessions?.length === 50;
  const oldestServerDay = oldestLocalServerDay(options.serverSessions ?? []);
  const isLowerBound =
    serverListTruncated &&
    oldestServerDay !== null &&
    streakDays.includes(oldestServerDay);
  const streakValue = streakDays.length;

  return {
    sessions,
    totalSessions,
    totalPracticeSeconds,
    weeklyPracticeSeconds,
    streak: {
      value: streakValue,
      label: `${streakValue}${isLowerBound ? '+' : ''}`,
      isLowerBound
    },
    calendarDays,
    recentSessions: sessions.slice(0, RECENT_SESSION_COUNT),
    serverListTruncated
  };
}

export function formatRecordDuration(durationSeconds: number): string {
  const seconds = Math.max(0, Math.floor(durationSeconds));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

export function formatRecordDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '刚刚完成';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function dedupeServerSessions(sessions: PracticeSession[]): PracticeSession[] {
  const sorted = [...sessions].sort(compareServerSessions);
  const seen = new Set<string>();
  return sorted.filter((session) => {
    if (seen.has(session.clientSessionId)) return false;
    seen.add(session.clientSessionId);
    return true;
  });
}

function dedupeLedgerSessions(
  ledger: LocalSessionLedgerEntry[]
): LocalSessionLedgerEntry[] {
  const sorted = [...ledger].sort((left, right) => {
    const timeDifference = endedAtMs(right.endedAt) - endedAtMs(left.endedAt);
    if (timeDifference !== 0) return timeDifference;
    return left.clientSessionId.localeCompare(right.clientSessionId);
  });
  const seen = new Set<string>();
  return sorted.filter((entry) => {
    if (seen.has(entry.clientSessionId)) return false;
    seen.add(entry.clientSessionId);
    return true;
  });
}

function toMergedServerSession(session: PracticeSession): MergedRecordSession {
  return {
    clientSessionId: session.clientSessionId,
    methodType: session.methodType,
    methodId: session.methodId,
    customRhythmId: session.customRhythmId,
    methodTitleSnapshot: session.methodTitleSnapshot,
    rhythmSnapshot: session.rhythmSnapshot,
    plannedDurationSeconds: session.plannedDurationSeconds,
    actualDurationSeconds: session.actualDurationSeconds,
    completed: session.completed,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    id: session.id,
    source: 'server'
  };
}

function toMergedLedgerSession(
  entry: LocalSessionLedgerEntry
): MergedRecordSession {
  return {
    clientSessionId: entry.clientSessionId,
    methodType: entry.methodType,
    methodId: entry.methodId,
    customRhythmId: entry.customRhythmId,
    methodTitleSnapshot: entry.methodTitleSnapshot,
    rhythmSnapshot: entry.rhythmSnapshot,
    plannedDurationSeconds: entry.plannedDurationSeconds,
    actualDurationSeconds: entry.actualDurationSeconds,
    completed: entry.completed,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    id: `ledger:${entry.clientSessionId}`,
    source: 'ledger',
    ledgerState: entry.state
  };
}

function compareServerSessions(
  left: PracticeSession,
  right: PracticeSession
): number {
  const timeDifference = endedAtMs(right.endedAt) - endedAtMs(left.endedAt);
  if (timeDifference !== 0) return timeDifference;
  return left.id.localeCompare(right.id);
}

function compareMergedSessions(
  left: MergedRecordSession,
  right: MergedRecordSession
): number {
  const timeDifference = endedAtMs(right.endedAt) - endedAtMs(left.endedAt);
  if (timeDifference !== 0) return timeDifference;
  return left.id.localeCompare(right.id);
}

function endedAtMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sumDuration(
  sessions: Pick<MergedRecordSession, 'actualDurationSeconds'>[]
): number {
  return sessions.reduce(
    (total, session) => total + session.actualDurationSeconds,
    0
  );
}

function isWithinRollingWeek(
  endedAt: string,
  lowerBound: number,
  upperBound: number
): boolean {
  const timestamp = Date.parse(endedAt);
  return (
    Number.isFinite(timestamp) &&
    timestamp >= lowerBound &&
    timestamp <= upperBound
  );
}

type DayBucket = { durationSeconds: number; sessions: number };

function bucketLocalDays(
  sessions: MergedRecordSession[]
): Map<string, DayBucket> {
  const buckets = new Map<string, DayBucket>();
  for (const session of sessions) {
    const endedAt = new Date(session.endedAt);
    if (!Number.isFinite(endedAt.getTime())) continue;
    const key = localDateKey(endedAt);
    const current = buckets.get(key) ?? { durationSeconds: 0, sessions: 0 };
    buckets.set(key, {
      durationSeconds: current.durationSeconds + session.actualDurationSeconds,
      sessions: current.sessions + 1
    });
  }
  return buckets;
}

function buildCalendarDays(
  dayBuckets: Map<string, DayBucket>,
  now: Date
): HeatmapDay[] {
  return Array.from({ length: CALENDAR_DAY_COUNT }, (_, index) => {
    const dayOffset = index - (CALENDAR_DAY_COUNT - 1);
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + dayOffset
    );
    const key = localDateKey(date);
    const bucket = dayBuckets.get(key) ?? {
      durationSeconds: 0,
      sessions: 0
    };
    const minutes = bucket.durationSeconds / 60;
    return {
      key,
      day: date.getDate(),
      label: `${date.getMonth() + 1}月${date.getDate()}日`,
      durationSeconds: bucket.durationSeconds,
      durationLabel: formatRecordDuration(bucket.durationSeconds),
      minutes,
      sessions: bucket.sessions,
      level: heatLevel(minutes)
    };
  });
}

function heatLevel(minutes: number): HeatmapDay['level'] {
  if (minutes >= 10) return 4;
  if (minutes >= 6) return 3;
  if (minutes >= 3) return 2;
  if (minutes > 0) return 1;
  return 0;
}

function getCurrentStreakDays(
  dayBuckets: Map<string, DayBucket>,
  now: Date
): string[] {
  const days: string[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (dayBuckets.has(localDateKey(cursor))) {
    days.push(localDateKey(cursor));
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() - 1
    );
  }
  return days;
}

function oldestLocalServerDay(sessions: PracticeSession[]): string | null {
  let oldest: PracticeSession | undefined;
  for (const session of sessions) {
    if (!Number.isFinite(Date.parse(session.endedAt))) continue;
    if (!oldest || Date.parse(session.endedAt) < Date.parse(oldest.endedAt)) {
      oldest = session;
    }
  }
  return oldest ? localDateKey(new Date(oldest.endedAt)) : null;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}
