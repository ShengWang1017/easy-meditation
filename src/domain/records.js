const STORAGE_KEY = 'easy-meditation.records.v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCAL_DATE_ADAPTER = {
  startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  },
  addDays(date, days) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + days
    );
  },
  dateKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  },
  dayOfMonth(date) {
    return date.getDate();
  },
  formatMonthDay(date) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
};

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

export function createPracticeStore(storage = safeStorage(), options = {}) {
  const dateAdapter = options.dateAdapter ?? LOCAL_DATE_ADAPTER;
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
      return derivePracticeStats(getRecords(), now, dateAdapter);
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

export function derivePracticeStats(
  records,
  now = new Date(),
  dateAdapter = LOCAL_DATE_ADAPTER
) {
  const sorted = [...records].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
  const weekStartMs = dateAdapter
    .addDays(dateAdapter.startOfDay(now), -6)
    .getTime();
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
    currentStreak: calculateCurrentStreak(sorted, now, dateAdapter),
    calendarDays: deriveCalendarDays(sorted, now, 28, dateAdapter),
    recentRecords: sorted
      .slice(0, 5)
      .map((record) => enrichRecordDuration(record, dateAdapter))
  };
}

export function createFixedOffsetDateAdapter(timeZoneOffsetMinutes) {
  if (!Number.isFinite(timeZoneOffsetMinutes)) {
    throw new TypeError('timeZoneOffsetMinutes must be finite.');
  }
  const offsetMs = timeZoneOffsetMinutes * 60 * 1000;
  const shifted = (date) => new Date(date.getTime() + offsetMs);
  return Object.freeze({
    timeZoneOffsetMinutes,
    startOfDay(date) {
      const value = shifted(date);
      return new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate()
        ) - offsetMs
      );
    },
    addDays(date, days) {
      return new Date(date.getTime() + days * DAY_MS);
    },
    dateKey(date) {
      const value = shifted(date);
      return [
        value.getUTCFullYear(),
        String(value.getUTCMonth() + 1).padStart(2, '0'),
        String(value.getUTCDate()).padStart(2, '0')
      ].join('-');
    },
    dayOfMonth(date) {
      return shifted(date).getUTCDate();
    },
    formatMonthDay(date) {
      const value = shifted(date);
      return `${value.getUTCMonth() + 1}月${value.getUTCDate()}日`;
    }
  });
}

function deriveCalendarDays(
  records,
  now,
  dayCount = 28,
  dateAdapter = LOCAL_DATE_ADAPTER
) {
  const secondsByDay = new Map();
  const sessionsByDay = new Map();
  records.forEach((record) => {
    const key = dateAdapter.dateKey(new Date(record.completedAt));
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + recordDurationSeconds(record));
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
  });

  const today = dateAdapter.startOfDay(now);
  const firstDay = dateAdapter.addDays(today, -(dayCount - 1));
  return Array.from({ length: dayCount }, (_, index) => {
    const date = dateAdapter.addDays(firstDay, index);
    const key = dateAdapter.dateKey(date);
    const durationSeconds = secondsByDay.get(key) ?? 0;
    const minutes = durationSeconds / 60;
    return {
      key,
      day: dateAdapter.dayOfMonth(date),
      label: dateAdapter.formatMonthDay(date),
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

function enrichRecordDuration(record, dateAdapter = LOCAL_DATE_ADAPTER) {
  const durationSeconds = recordDurationSeconds(record);
  const completedDate = new Date(record.completedAt);
  return {
    ...record,
    durationSeconds,
    completedDateLabel: Number.isNaN(completedDate.getTime())
      ? ''
      : dateAdapter.formatMonthDay(completedDate),
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

function calculateCurrentStreak(records, now, dateAdapter = LOCAL_DATE_ADAPTER) {
  const practiceDays = new Set(
    records.map((record) => dateAdapter.dateKey(new Date(record.completedAt)))
  );
  let cursor = dateAdapter.startOfDay(now);
  let streak = 0;

  while (practiceDays.has(dateAdapter.dateKey(cursor))) {
    streak += 1;
    cursor = dateAdapter.addDays(cursor, -1);
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
