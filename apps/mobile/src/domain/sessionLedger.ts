import {
  practiceSessionCreateSchema,
  type PracticeSessionCreateInput
} from '@easy-meditation/shared';

import { ApiRequestError } from '../api/client';

export type LocalSessionLedgerEntry =
  | (PracticeSessionCreateInput & {
      origin: 'custom';
      state: 'local-only';
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'pending' | 'retry-paused';
      attemptCount: number;
      nextAttemptAt: string | null;
      lastErrorCode: string | null;
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'failed-terminal';
      lastErrorCode: string;
    });

export const RETRY_DELAYS_MS = [
  5_000,
  30_000,
  300_000,
  1_800_000
] as const;

export type SubmissionClassification =
  | { kind: 'retriable'; code: string; retryAfterMs?: number }
  | { kind: 'auth-required'; code: string }
  | { kind: 'terminal'; code: string };

export function classifySessionSubmissionError(
  error: unknown
): SubmissionClassification {
  if (error instanceof TypeError) {
    return { kind: 'retriable', code: 'NETWORK_ERROR' };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return { kind: 'retriable', code: 'TIMEOUT' };
  }

  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return { kind: 'auth-required', code: error.code };
    }

    if (error.status === 429 || (error.status >= 500 && error.status <= 599)) {
      return error.retryAfterMs === undefined
        ? { kind: 'retriable', code: error.code }
        : {
            kind: 'retriable',
            code: error.code,
            retryAfterMs: error.retryAfterMs
          };
    }

    return { kind: 'terminal', code: error.code };
  }

  return { kind: 'terminal', code: 'UNEXPECTED_ERROR' };
}

export function transitionAfterFailure(
  entry: Extract<LocalSessionLedgerEntry, { attemptCount: number }>,
  error: unknown,
  nowMs: number
): Extract<LocalSessionLedgerEntry, { origin: 'built_in' }> {
  const classification = classifySessionSubmissionError(error);
  const base = {
    ...practiceSessionCreateSchema.parse(entry),
    origin: 'built_in' as const
  };

  if (classification.kind === 'terminal') {
    return {
      ...base,
      state: 'failed-terminal',
      lastErrorCode: classification.code
    };
  }

  if (classification.kind === 'auth-required') {
    return {
      ...base,
      state: 'pending',
      attemptCount: entry.attemptCount,
      nextAttemptAt: null,
      lastErrorCode: classification.code
    };
  }

  const attemptCount = Math.min(5, entry.attemptCount + 1);
  if (attemptCount === 5) {
    return {
      ...base,
      state: 'retry-paused',
      attemptCount,
      nextAttemptAt: null,
      lastErrorCode: classification.code
    };
  }

  const baseDelay =
    RETRY_DELAYS_MS[attemptCount - 1] ?? RETRY_DELAYS_MS[3];
  const delay = Math.max(baseDelay, classification.retryAfterMs ?? 0);
  return {
    ...base,
    state: 'pending',
    attemptCount,
    nextAttemptAt: new Date(nowMs + delay).toISOString(),
    lastErrorCode: classification.code
  };
}
