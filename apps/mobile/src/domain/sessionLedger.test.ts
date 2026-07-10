import { describe, expect, it, vi } from 'vitest';
import type {
  BreathingPhase,
  PracticeSessionCreateInput
} from '@easy-meditation/shared';

vi.mock('../api/client', () => ({
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    code: string;
    retryAfterMs?: number;

    constructor(options: {
      status: number;
      code: string;
      message: string;
      retryAfterMs?: number;
    }) {
      super(options.message);
      this.name = 'ApiRequestError';
      this.status = options.status;
      this.code = options.code;
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}));

import { ApiRequestError } from '../api/client';
import {
  RETRY_DELAYS_MS,
  classifySessionSubmissionError,
  transitionAfterFailure,
  type LocalSessionLedgerEntry
} from './sessionLedger';

type RetryableLedgerEntry = Extract<
  LocalSessionLedgerEntry,
  { attemptCount: number }
>;

const rhythmSnapshot: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '停留', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 }
];

const baseInput: PracticeSessionCreateInput = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  methodType: 'built_in',
  methodId: 'box',
  customRhythmId: null,
  methodTitleSnapshot: '盒式呼吸法',
  rhythmSnapshot,
  plannedDurationSeconds: 300,
  actualDurationSeconds: 298,
  completed: true,
  startedAt: '2026-07-10T10:00:00.000Z',
  endedAt: '2026-07-10T10:04:58.000Z'
};

function pendingEntry(
  overrides: Partial<RetryableLedgerEntry> = {}
): RetryableLedgerEntry {
  return {
    ...baseInput,
    origin: 'built_in',
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: '2026-07-10T10:04:58.000Z',
    lastErrorCode: null,
    ...overrides
  };
}

function apiError(
  status: number,
  code: string,
  retryAfterMs?: number
): ApiRequestError {
  return new ApiRequestError({
    status,
    code,
    message: `localized message for ${code}`,
    retryAfterMs
  });
}

describe('session submission classification', () => {
  it('classifies only network failures and abort timeouts without matching messages', () => {
    expect(classifySessionSubmissionError(new TypeError('任意网络文案'))).toEqual({
      kind: 'retriable',
      code: 'NETWORK_ERROR'
    });

    const timeout = new Error('任意超时文案');
    timeout.name = 'AbortError';
    expect(classifySessionSubmissionError(timeout)).toEqual({
      kind: 'retriable',
      code: 'TIMEOUT'
    });

    expect(classifySessionSubmissionError(new Error('network timeout'))).toEqual({
      kind: 'terminal',
      code: 'UNEXPECTED_ERROR'
    });
  });

  it('classifies final 401 as auth-required and preserves Retry-After only for retriable HTTP failures', () => {
    expect(classifySessionSubmissionError(apiError(401, 'UNAUTHORIZED'))).toEqual({
      kind: 'auth-required',
      code: 'UNAUTHORIZED'
    });
    expect(classifySessionSubmissionError(apiError(429, 'RATE_LIMITED', 90_000))).toEqual({
      kind: 'retriable',
      code: 'RATE_LIMITED',
      retryAfterMs: 90_000
    });
    expect(classifySessionSubmissionError(apiError(500, 'SERVER_ERROR'))).toEqual({
      kind: 'retriable',
      code: 'SERVER_ERROR'
    });
    expect(classifySessionSubmissionError(apiError(599, 'UPSTREAM_ERROR'))).toEqual({
      kind: 'retriable',
      code: 'UPSTREAM_ERROR'
    });
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [404, 'BREATHING_METHOD_NOT_FOUND'],
    [409, 'PRACTICE_SESSION_CONFLICT'],
    [418, 'OTHER_CLIENT_ERROR']
  ])('classifies HTTP %i as terminal', (status, code) => {
    expect(classifySessionSubmissionError(apiError(status, code))).toEqual({
      kind: 'terminal',
      code
    });
  });
});

describe('session retry transitions', () => {
  it('uses 5s, 30s, 5m, and 30m before pausing after the fifth failure', () => {
    const nowMs = Date.parse('2026-07-10T12:00:00.000Z');
    expect(RETRY_DELAYS_MS).toEqual([5_000, 30_000, 300_000, 1_800_000]);

    RETRY_DELAYS_MS.forEach((delay, priorAttemptCount) => {
      expect(
        transitionAfterFailure(
          pendingEntry({ attemptCount: priorAttemptCount }),
          new TypeError('offline'),
          nowMs
        )
      ).toMatchObject({
        state: 'pending',
        attemptCount: priorAttemptCount + 1,
        nextAttemptAt: new Date(nowMs + delay).toISOString(),
        lastErrorCode: 'NETWORK_ERROR'
      });
    });

    expect(
      transitionAfterFailure(
        pendingEntry({ attemptCount: 4 }),
        new TypeError('offline'),
        nowMs
      )
    ).toMatchObject({
      state: 'retry-paused',
      attemptCount: 5,
      nextAttemptAt: null,
      lastErrorCode: 'NETWORK_ERROR'
    });
  });

  it('lets a longer Retry-After delay win without shortening the base backoff', () => {
    const nowMs = Date.parse('2026-07-10T12:00:00.000Z');
    expect(
      transitionAfterFailure(
        pendingEntry(),
        apiError(429, 'RATE_LIMITED', 90_000),
        nowMs
      )
    ).toMatchObject({
      attemptCount: 1,
      nextAttemptAt: new Date(nowMs + 90_000).toISOString()
    });
    expect(
      transitionAfterFailure(
        pendingEntry({ attemptCount: 1 }),
        apiError(429, 'RATE_LIMITED', 1_000),
        nowMs
      )
    ).toMatchObject({
      attemptCount: 2,
      nextAttemptAt: new Date(nowMs + 30_000).toISOString()
    });
  });

  it('auth-blocks without consuming an attempt and strips retry metadata on terminal failure', () => {
    const entry = pendingEntry({ attemptCount: 2 });
    expect(
      transitionAfterFailure(entry, apiError(401, 'UNAUTHORIZED'), Date.now())
    ).toMatchObject({
      state: 'pending',
      attemptCount: 2,
      nextAttemptAt: null,
      lastErrorCode: 'UNAUTHORIZED'
    });

    const terminal = transitionAfterFailure(
      entry,
      apiError(409, 'PRACTICE_SESSION_CONFLICT'),
      Date.now()
    );
    expect(terminal).toMatchObject({
      origin: 'built_in',
      state: 'failed-terminal',
      lastErrorCode: 'PRACTICE_SESSION_CONFLICT'
    });
    expect(terminal).not.toHaveProperty('attemptCount');
    expect(terminal).not.toHaveProperty('nextAttemptAt');
  });
});
