const STORAGE_KEY = 'easy-meditation.records.v1';

export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

export function createPracticeStore(storage = safeStorage()) {
  function getRecords() {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
        : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    storage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  return {
    getRecords,
    getStats(now = new Date()) {
      return derivePracticeStats(getRecords(), now);
    },
    addCompletedSession(input, completedAt = new Date()) {
      const completedDate = completedAt instanceof Date ? completedAt : new Date(completedAt);
      const durationSeconds = normalizeDurationSeconds(input);
      const record = {
        ...input,
        minutes: normalizeRecordMinutes(input.minutes, durationSeconds),
        durationSeconds,
        id: `${completedDate.getTime()}-${Math.random().toString(16).slice(2)}`,
        completedAt: completedDate.toISOString()
      };
      saveRecords([record, ...getRecords()]);
      return record;
    },
    clear() {
      storage.removeItem(STORAGE_KEY);
    }
  };
}

export function derivePracticeStats(records, now = new Date()) {
  const sorted = [...records].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const weekStartMs = startOfLocalDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)).getTime();
  const weeklySeconds = sorted
    .filter((record) => Date.parse(record.completedAt) >= weekStartMs)
    .reduce((sum, record) => sum + recordDurationSeconds(record), 0);
  const completedSeconds = sorted.reduce((sum, record) => sum + recordDurationSeconds(record), 0);

  return {
    totalSessions: sorted.length,
    completedSeconds,
    completedMinutes: secondsToRoundedMinutes(completedSeconds),
    completedDurationLabel: durationLabel(completedSeconds),
    weeklySeconds,
    weeklyMinutes: secondsToRoundedMinutes(weeklySeconds),
    weeklyDurationLabel: durationLabel(weeklySeconds),
    currentStreak: calculateCurrentStreak(sorted, now),
    calendarDays: deriveCalendarDays(sorted, now),
    recentRecords: sorted.slice(0, 5).map((record) => enrichRecordDuration(record))
  };
}

function deriveCalendarDays(records, now, dayCount = 28) {
  const secondsByDay = new Map();
  const sessionsByDay = new Map();
  records.forEach((record) => {
    const key = localDateKey(new Date(record.completedAt));
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + recordDurationSeconds(record));
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
  });

  const today = startOfLocalDay(now);
  const firstDay = new Date(today.getTime() - (dayCount - 1) * 24 * 60 * 60 * 1000);
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(firstDay.getTime() + index * 24 * 60 * 60 * 1000);
    const key = localDateKey(date);
    const durationSeconds = secondsByDay.get(key) ?? 0;
    const minutes = durationSeconds / 60;
    return {
      key,
      day: date.getDate(),
      label: `${date.getMonth() + 1}月${date.getDate()}日`,
      durationSeconds,
      durationLabel: durationLabel(durationSeconds),
      minutes,
      sessions: sessionsByDay.get(key) ?? 0,
      level: heatLevel(minutes)
    };
  });
}

function heatLevel(minutes) {
  if (minutes >= 10) return 4;
  if (minutes >= 6) return 3;
  if (minutes >= 3) return 2;
  if (minutes > 0) return 1;
  return 0;
}

function normalizeDurationSeconds(input) {
  const seconds = Number(input.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) return Math.floor(seconds);
  const minutes = Number(input.minutes);
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60);
  return 0;
}

function normalizeRecordMinutes(_minutes, durationSeconds) {
  return secondsToRoundedMinutes(durationSeconds);
}

function recordDurationSeconds(record) {
  return normalizeDurationSeconds(record);
}

function enrichRecordDuration(record) {
  const durationSeconds = recordDurationSeconds(record);
  return {
    ...record,
    durationSeconds,
    durationLabel: durationLabel(durationSeconds)
  };
}

function secondsToRoundedMinutes(seconds) {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

function durationLabel(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds} 秒`;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function calculateCurrentStreak(records, now) {
  const practiceDays = new Set(records.map((record) => localDateKey(new Date(record.completedAt))));
  let cursor = startOfLocalDay(now);
  let streak = 0;

  while (practiceDays.has(localDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

function safeStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return createMemoryStorage();
    const testKey = '__easy_meditation_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
