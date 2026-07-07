import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BreathingMethod,
  BreathingPhase,
  PracticeSession,
  PracticeSessionCreateInput
} from '@easy-meditation/shared';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn()
}));

vi.mock('./client', () => ({
  apiRequest: apiRequestMock
}));

import { buildCompletedPracticeSessionInput, createPracticeSession } from './sessions';

const rhythmSnapshot: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '停留', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 }
];

const input: PracticeSessionCreateInput = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  methodType: 'built_in',
  methodId: 'box-breathing',
  customRhythmId: null,
  methodTitleSnapshot: '方格呼吸',
  rhythmSnapshot,
  plannedDurationSeconds: 300,
  actualDurationSeconds: 300,
  completed: true,
  startedAt: '2026-07-08T10:00:00.000Z',
  endedAt: '2026-07-08T10:05:00.000Z'
};

const session: PracticeSession = {
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-07-08T10:05:02.000Z',
  ...input
};

const method: BreathingMethod = {
  id: 'box-breathing',
  slug: 'box-breathing',
  title: '方格呼吸',
  subtitle: '平稳的四拍节奏',
  category: 'classic',
  defaultDurationSeconds: 300,
  phases: rhythmSnapshot,
  sortOrder: 1,
  isActive: true
};

describe('createPracticeSession', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('posts the completed session payload to the practice sessions endpoint', async () => {
    apiRequestMock.mockResolvedValue(session);

    await expect(createPracticeSession(input)).resolves.toEqual(session);

    expect(apiRequestMock).toHaveBeenCalledWith('/practice-sessions', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  });

  it('builds the completed session payload from method snapshots and timing', () => {
    expect(
      buildCompletedPracticeSessionInput({
        clientSessionId: input.clientSessionId,
        method,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        actualDurationSeconds: 298
      })
    ).toEqual({
      clientSessionId: input.clientSessionId,
      methodType: 'built_in',
      methodId: method.id,
      customRhythmId: null,
      methodTitleSnapshot: method.title,
      rhythmSnapshot: method.phases,
      plannedDurationSeconds: method.defaultDurationSeconds,
      actualDurationSeconds: 298,
      completed: true,
      startedAt: input.startedAt,
      endedAt: input.endedAt
    });
  });
});
