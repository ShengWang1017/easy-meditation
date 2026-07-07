import type { PracticeSession } from '@prisma/client';

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDateKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export function startOfWeeklyWindow(now = new Date()): Date {
  return new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
}

export function deriveCurrentStreak(sessions: Pick<PracticeSession, 'endedAt'>[], now = new Date()): number {
  const practicedDays = new Set(
    sessions
      .filter((session) => session.endedAt <= now)
      .map((session) => utcDateKey(session.endedAt))
  );
  let cursor = startOfUtcDay(now);
  let streak = 0;

  while (practicedDays.has(utcDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  return streak;
}

export function deriveWeeklyPracticeSeconds(
  sessions: Pick<PracticeSession, 'endedAt' | 'actualDurationSeconds'>[],
  now = new Date()
): number {
  const weekStart = startOfWeeklyWindow(now);
  return sessions
    .filter((session) => session.endedAt >= weekStart && session.endedAt <= now)
    .reduce((sum, session) => sum + session.actualDurationSeconds, 0);
}
