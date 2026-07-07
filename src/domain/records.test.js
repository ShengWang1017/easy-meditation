import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  createMemoryStorage,
  createPracticeStore,
  derivePracticeStats
} from './records.js';

describe('practice records', () => {
  test('saves completed sessions and shows newest records first', () => {
    const store = createPracticeStore(createMemoryStorage());

    store.addCompletedSession(
      { methodId: 'box', methodTitle: '盒式呼吸', minutes: 3 },
      new Date('2026-07-04T10:00:00+08:00')
    );
    store.addCompletedSession(
      { methodId: 'focus', methodTitle: '专注恢复', minutes: 2 },
      new Date('2026-07-04T12:00:00+08:00')
    );

    const records = store.getRecords();
    assert.equal(records.length, 2);
    assert.equal(records[0].methodId, 'focus');
    assert.equal(records[0].minutes, 2);
    assert.equal(records[1].methodId, 'box');
  });

  test('derives total sessions, weekly minutes, and current streak', () => {
    const stats = derivePracticeStats([
      { id: '1', methodId: 'box', methodTitle: '盒式呼吸', minutes: 3, completedAt: '2026-07-04T12:00:00+08:00' },
      { id: '2', methodId: 'focus', methodTitle: '专注恢复', minutes: 2, completedAt: '2026-07-03T12:00:00+08:00' },
      { id: '3', methodId: 'sleep', methodTitle: '睡前降速', minutes: 5, completedAt: '2026-07-02T12:00:00+08:00' }
    ], new Date('2026-07-04T14:00:00+08:00'));

    assert.equal(stats.totalSessions, 3);
    assert.equal(stats.completedMinutes, 10);
    assert.equal(stats.weeklyMinutes, 10);
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.recentRecords.length, 3);
    assert.equal(stats.calendarDays.length, 28);
    assert.deepEqual(
      stats.calendarDays.slice(-3).map((day) => ({ day: day.day, minutes: day.minutes, level: day.level })),
      [
        { day: 2, minutes: 5, level: 2 },
        { day: 3, minutes: 2, level: 1 },
        { day: 4, minutes: 3, level: 2 }
      ]
    );
  });

  test('uses memory storage with storage-like semantics', () => {
    const storage = createMemoryStorage();
    storage.setItem('x', '1');

    assert.equal(storage.getItem('x'), '1');
    storage.removeItem('x');
    assert.equal(storage.getItem('x'), null);
  });
});
