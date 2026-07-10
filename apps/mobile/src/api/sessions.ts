import type {
  BreathingMethod,
  PracticeSession,
  PracticeSessionCreateInput
} from '@easy-meditation/shared';
import { getMethodDisplayTitle } from '../domain/methodPresentation';
import { apiRequest } from './client';

type BuildCompletedPracticeSessionInputOptions = {
  clientSessionId: string;
  method: BreathingMethod;
  actualDurationSeconds: number;
  startedAt: string;
  endedAt: string;
};

export function buildCompletedPracticeSessionInput({
  clientSessionId,
  method,
  actualDurationSeconds,
  startedAt,
  endedAt
}: BuildCompletedPracticeSessionInputOptions): PracticeSessionCreateInput {
  return {
    clientSessionId,
    methodType: 'built_in',
    methodId: method.id,
    customRhythmId: null,
    methodTitleSnapshot: getMethodDisplayTitle(method.id) ?? method.title,
    rhythmSnapshot: method.phases,
    plannedDurationSeconds: method.defaultDurationSeconds,
    actualDurationSeconds,
    completed: true,
    startedAt,
    endedAt
  };
}

export async function createPracticeSession(
  input: PracticeSessionCreateInput
): Promise<PracticeSession> {
  return apiRequest<PracticeSession>('/practice-sessions', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
