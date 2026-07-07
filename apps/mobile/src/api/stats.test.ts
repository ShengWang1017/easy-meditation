import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatsSummary } from '@easy-meditation/shared';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn()
}));

vi.mock('./client', () => ({
  apiRequest: apiRequestMock
}));

import { fetchStatsSummary } from './stats';

const summary: StatsSummary = {
  totalSessions: 8,
  totalPracticeSeconds: 1_560,
  weeklyPracticeSeconds: 720,
  currentStreak: 4,
  recentSessions: []
};

describe('fetchStatsSummary', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('loads the stats summary from the server endpoint', async () => {
    apiRequestMock.mockResolvedValue(summary);

    await expect(fetchStatsSummary()).resolves.toEqual(summary);

    expect(apiRequestMock).toHaveBeenCalledWith('/stats/summary');
  });
});
