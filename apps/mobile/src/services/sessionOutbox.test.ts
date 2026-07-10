import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import type {
  BreathingPhase,
  PracticeSession,
  PracticeSessionCreateInput,
  StatsSummary
} from '@easy-meditation/shared';

const apiMocks = vi.hoisted(() => ({
  createPracticeSession: vi.fn(),
  fetchPracticeSessions: vi.fn(),
  fetchStatsSummary: vi.fn()
}));

vi.mock('../api/sessions', () => ({
  createPracticeSession: apiMocks.createPracticeSession,
  fetchPracticeSessions: apiMocks.fetchPracticeSessions
}));
vi.mock('../api/stats', () => ({
  fetchStatsSummary: apiMocks.fetchStatsSummary
}));
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
import type { LocalSessionLedgerEntry } from '../domain/sessionLedger';
import { userQueryKeys } from '../query/keys';
import {
  DEFAULT_PREFERENCES,
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  preferencesStorageKey,
  type UserPreferencesStore
} from '../store/preferencesStore';
import {
  createAuthenticatedSessionOutbox,
  createSessionOutbox
} from './sessionOutbox';

type RetryableLedgerEntry = Extract<
  LocalSessionLedgerEntry,
  { attemptCount: number }
>;

const NOW_MS = Date.parse('2026-07-10T12:00:00.000Z');
const rhythmSnapshot: BreathingPhase[] = [
  { kind: 'inhale', label: '吸气', durationSeconds: 4 },
  { kind: 'hold', label: '停留', durationSeconds: 4 },
  { kind: 'exhale', label: '呼气', durationSeconds: 4 }
];

function practiceInput(
  clientSessionId = '11111111-1111-4111-8111-111111111111'
): PracticeSessionCreateInput {
  return {
    clientSessionId,
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
}

function pendingEntry(
  overrides: Partial<RetryableLedgerEntry> = {}
): RetryableLedgerEntry {
  return {
    ...practiceInput(),
    origin: 'built_in',
    state: 'pending',
    attemptCount: 0,
    nextAttemptAt: new Date(NOW_MS).toISOString(),
    lastErrorCode: null,
    ...overrides
  };
}

function retryPausedEntry(): RetryableLedgerEntry {
  return {
    ...pendingEntry(),
    state: 'retry-paused',
    attemptCount: 5,
    nextAttemptAt: null,
    lastErrorCode: 'NETWORK_ERROR'
  };
}

function customEntry(): Extract<LocalSessionLedgerEntry, { origin: 'custom' }> {
  return {
    ...practiceInput('22222222-2222-4222-8222-222222222222'),
    methodType: 'custom',
    methodId: null,
    customRhythmId: null,
    methodTitleSnapshot: '自定义',
    origin: 'custom',
    state: 'local-only'
  };
}

function acceptedSession(
  input: PracticeSessionCreateInput = practiceInput()
): PracticeSession {
  return {
    ...input,
    id: '33333333-3333-4333-8333-333333333333',
    createdAt: '2026-07-10T10:05:01.000Z'
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createFailNextLedgerStorage(
  userId: string,
  initialLedger: LocalSessionLedgerEntry[]
) {
  let stored = JSON.stringify({
    state: {
      customRhythm: { ...DEFAULT_PREFERENCES.customRhythm },
      durationOverrides: {},
      soundEnabled: true,
      beforeStartDismissed: false,
      localSessionLedger: initialLedger
    },
    version: 0
  });
  let failNext = false;
  const storage: StateStorage = {
    async getItem(name) {
      return name === preferencesStorageKey(userId) ? stored : null;
    },
    async setItem(_name, value) {
      if (failNext) {
        failNext = false;
        throw new Error('disk unavailable');
      }
      stored = value;
    },
    async removeItem() {
      stored = '';
    }
  };

  return {
    storage,
    failNextWrite() {
      failNext = true;
    },
    readLedger() {
      return (JSON.parse(stored) as {
        state: { localSessionLedger: LocalSessionLedgerEntry[] };
      }).state.localSessionLedger;
    }
  };
}

function createStoreBackedOutbox(
  store: UserPreferencesStore,
  options: {
    post(input: PracticeSessionCreateInput): Promise<PracticeSession>;
    cacheAndRefreshAccepted?: (session: PracticeSession) => Promise<void>;
  }
) {
  return createSessionOutbox({
    getLedger: () => store.getState().localSessionLedger,
    updateEntry: (clientSessionId, updater) =>
      store.getState().updateLedgerEntry(clientSessionId, updater),
    removeEntry: (clientSessionId) =>
      store.getState().removeLedgerEntry(clientSessionId),
    post: options.post,
    cacheAndRefreshAccepted:
      options.cacheAndRefreshAccepted ?? (async () => undefined),
    onTerminalUnauthorized: async () => undefined,
    now: () => NOW_MS
  });
}

function createHarness(
  initialLedger: LocalSessionLedgerEntry[],
  overrides: {
    post?: (input: PracticeSessionCreateInput) => Promise<PracticeSession>;
    cacheAndRefreshAccepted?: (session: PracticeSession) => Promise<void>;
    onTerminalUnauthorized?: () => Promise<void>;
  } = {}
) {
  let ledger = [...initialLedger];
  const events: string[] = [];
  const post = vi.fn(
    overrides.post ?? (async (input) => acceptedSession(input))
  );
  const cacheAndRefreshAccepted = vi.fn(
    overrides.cacheAndRefreshAccepted ?? (async () => undefined)
  );
  const onTerminalUnauthorized = vi.fn(
    overrides.onTerminalUnauthorized ?? (async () => undefined)
  );
  const updateEntry = vi.fn(
    async (
      clientSessionId: string,
      updater: (entry: LocalSessionLedgerEntry) => LocalSessionLedgerEntry
    ) => {
      events.push('update');
      ledger = ledger.map((entry) =>
        entry.clientSessionId === clientSessionId ? updater(entry) : entry
      );
    }
  );
  const removeEntry = vi.fn(async (clientSessionId: string) => {
    events.push('remove');
    ledger = ledger.filter((entry) => entry.clientSessionId !== clientSessionId);
  });

  const outbox = createSessionOutbox({
    getLedger: () => ledger,
    updateEntry,
    removeEntry,
    post: async (input) => {
      events.push('post');
      return post(input);
    },
    cacheAndRefreshAccepted: async (session) => {
      events.push('cache');
      await cacheAndRefreshAccepted(session);
    },
    onTerminalUnauthorized,
    now: () => NOW_MS
  });

  return {
    outbox,
    post,
    cacheAndRefreshAccepted,
    onTerminalUnauthorized,
    updateEntry,
    removeEntry,
    events,
    get ledger() {
      return ledger;
    }
  };
}

describe('session outbox execution', () => {
  it('deduplicates concurrent submissions and strips every local-only field before POST', async () => {
    const entry = pendingEntry();
    const gate = deferred<PracticeSession>();
    const harness = createHarness([entry], {
      post: () => gate.promise
    });

    const first = harness.outbox.submit(entry.clientSessionId);
    const second = harness.outbox.submit(entry.clientSessionId);

    expect(second).toBe(first);
    expect(harness.post).toHaveBeenCalledTimes(1);
    expect(harness.post).toHaveBeenCalledWith(practiceInput());

    gate.resolve(acceptedSession());
    await Promise.all([first, second]);

    expect(harness.cacheAndRefreshAccepted).toHaveBeenCalledTimes(1);
    expect(harness.removeEntry).toHaveBeenCalledTimes(1);
    expect(harness.ledger).toEqual([]);
  });

  it('never posts custom, retry-paused, or terminal ledger rows', async () => {
    const paused: RetryableLedgerEntry = {
      ...pendingEntry(),
      state: 'retry-paused',
      attemptCount: 5,
      nextAttemptAt: null,
      lastErrorCode: 'NETWORK_ERROR'
    };
    const terminal: LocalSessionLedgerEntry = {
      ...practiceInput('44444444-4444-4444-8444-444444444444'),
      origin: 'built_in',
      state: 'failed-terminal',
      lastErrorCode: 'VALIDATION_ERROR'
    };
    const custom = customEntry();
    const harness = createHarness([custom, paused, terminal]);

    await Promise.all([
      harness.outbox.submit(custom.clientSessionId),
      harness.outbox.submit(paused.clientSessionId),
      harness.outbox.submit(terminal.clientSessionId)
    ]);

    expect(harness.post).not.toHaveBeenCalled();
    expect(harness.ledger).toEqual([custom, paused, terminal]);
  });

  it('caches and refreshes accepted or idempotently returned sessions before removing the ledger row', async () => {
    const entry = pendingEntry();
    const harness = createHarness([entry]);

    await harness.outbox.submit(entry.clientSessionId);

    expect(harness.events).toEqual(['post', 'cache', 'remove']);
    expect(harness.ledger).toEqual([]);
  });

  it('backs off a cache refresh failure without immediately reposting the accepted session', async () => {
    const entry = pendingEntry();
    const harness = createHarness([entry], {
      cacheAndRefreshAccepted: async () => {
        throw new Error('refetch failed');
      }
    });

    await expect(
      harness.outbox.submit(entry.clientSessionId)
    ).resolves.toBeUndefined();

    expect(harness.ledger[0]).toMatchObject({
      state: 'pending',
      attemptCount: 1,
      nextAttemptAt: new Date(NOW_MS + 5_000).toISOString(),
      lastErrorCode: 'CACHE_REFRESH_FAILED'
    });
    expect(harness.updateEntry).toHaveBeenCalledTimes(1);
    expect(harness.removeEntry).not.toHaveBeenCalled();

    await harness.outbox.drainDue();
    expect(harness.post).toHaveBeenCalledTimes(1);
  });

  it('auth-blocks a final 401 and resumes that null-due row only on authenticated drain', async () => {
    const entry = pendingEntry({ attemptCount: 2 });
    const post = vi
      .fn<(input: PracticeSessionCreateInput) => Promise<PracticeSession>>()
      .mockRejectedValueOnce(
        new ApiRequestError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: '请重新登录'
        })
      )
      .mockResolvedValueOnce(acceptedSession());
    const harness = createHarness([entry], { post });

    await harness.outbox.submit(entry.clientSessionId);

    expect(harness.ledger[0]).toMatchObject({
      state: 'pending',
      attemptCount: 2,
      nextAttemptAt: null,
      lastErrorCode: 'UNAUTHORIZED'
    });
    expect(harness.onTerminalUnauthorized).toHaveBeenCalledTimes(1);

    await harness.outbox.drainDue();
    expect(post).toHaveBeenCalledTimes(1);

    await harness.outbox.drainDue({ resumeAuthBlocked: true });
    expect(post).toHaveBeenCalledTimes(2);
    expect(harness.ledger).toEqual([]);
  });

  it('drains only due pending rows and leaves future rows untouched', async () => {
    const due = pendingEntry();
    const future = pendingEntry({
      clientSessionId: '55555555-5555-4555-8555-555555555555',
      nextAttemptAt: new Date(NOW_MS + 1).toISOString()
    });
    const harness = createHarness([due, future]);

    await harness.outbox.drainDue();

    expect(harness.post).toHaveBeenCalledTimes(1);
    expect(harness.post).toHaveBeenCalledWith(practiceInput());
    expect(harness.ledger).toEqual([future]);
  });

  it('manual retry resets only a paused row to attempt zero and due-now before submitting', async () => {
    const paused: RetryableLedgerEntry = {
      ...pendingEntry(),
      state: 'retry-paused',
      attemptCount: 5,
      nextAttemptAt: null,
      lastErrorCode: 'SERVER_ERROR'
    };
    let harness!: ReturnType<typeof createHarness>;
    const post = vi.fn(async (input: PracticeSessionCreateInput) => {
      expect(harness.ledger[0]).toMatchObject({
        state: 'pending',
        attemptCount: 0,
        nextAttemptAt: new Date(NOW_MS).toISOString(),
        lastErrorCode: null
      });
      return acceptedSession(input);
    });
    harness = createHarness([paused], { post });

    await harness.outbox.retryNow(paused.clientSessionId);

    expect(harness.events).toEqual(['update', 'post', 'cache', 'remove']);
    expect(harness.ledger).toEqual([]);
  });

  it('rolls back a failed persisted failure transition', async () => {
    const entry = pendingEntry();
    const userId = 'failure-transition-user';
    const persistence = createFailNextLedgerStorage(userId, [entry]);
    const store = createUserPreferencesStore(userId, persistence.storage);
    await hydrateUserPreferencesStore(store);
    persistence.failNextWrite();
    const outbox = createStoreBackedOutbox(store, {
      post: async () => {
        throw new TypeError('offline');
      }
    });

    await expect(outbox.submit(entry.clientSessionId)).rejects.toThrow(
      'disk unavailable'
    );

    expect(store.getState().localSessionLedger).toEqual([entry]);
    expect(persistence.readLedger()).toEqual([entry]);
  });

  it('does not POST when a manual-retry state reset fails to persist', async () => {
    const entry = retryPausedEntry();
    const userId = 'manual-retry-user';
    const persistence = createFailNextLedgerStorage(userId, [entry]);
    const store = createUserPreferencesStore(userId, persistence.storage);
    await hydrateUserPreferencesStore(store);
    persistence.failNextWrite();
    const post = vi.fn(async () => acceptedSession());
    const outbox = createStoreBackedOutbox(store, { post });

    await expect(outbox.retryNow(entry.clientSessionId)).rejects.toThrow(
      'disk unavailable'
    );

    expect(post).not.toHaveBeenCalled();
    expect(store.getState().localSessionLedger).toEqual([entry]);
    expect(persistence.readLedger()).toEqual([entry]);
  });

  it('restores an accepted row when its persisted removal fails', async () => {
    const entry = pendingEntry();
    const userId = 'accepted-removal-user';
    const persistence = createFailNextLedgerStorage(userId, [entry]);
    const store = createUserPreferencesStore(userId, persistence.storage);
    await hydrateUserPreferencesStore(store);
    persistence.failNextWrite();
    const outbox = createStoreBackedOutbox(store, {
      post: async () => acceptedSession()
    });

    await expect(outbox.submit(entry.clientSessionId)).rejects.toThrow(
      'disk unavailable'
    );

    expect(store.getState().localSessionLedger).toEqual([entry]);
    expect(persistence.readLedger()).toEqual([entry]);
  });
});

describe('authenticated session outbox adapter', () => {
  beforeEach(() => {
    apiMocks.createPracticeSession.mockReset();
    apiMocks.fetchPracticeSessions.mockReset();
    apiMocks.fetchStatsSummary.mockReset();
  });

  it('upserts accepted data immediately, awaits fresh user queries, then removes the row', async () => {
    const entry = pendingEntry();
    const accepted = acceptedSession();
    let ledger: LocalSessionLedgerEntry[] = [entry];
    const updateLedgerEntry = vi.fn();
    const removeLedgerEntry = vi.fn(async (clientSessionId: string) => {
      ledger = ledger.filter((row) => row.clientSessionId !== clientSessionId);
    });
    const store = {
      getState: () => ({
        localSessionLedger: ledger,
        updateLedgerEntry,
        removeLedgerEntry
      })
    } as unknown as UserPreferencesStore;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY }
      }
    });
    queryClient.setQueryData(userQueryKeys.stats('user-a'), {
      totalSessions: 0,
      totalPracticeSeconds: 0
    });
    const sessionsGate = deferred<PracticeSession[]>();
    const statsGate = deferred<StatsSummary>();
    apiMocks.createPracticeSession.mockResolvedValue(accepted);
    apiMocks.fetchPracticeSessions.mockReturnValue(sessionsGate.promise);
    apiMocks.fetchStatsSummary.mockReturnValue(statsGate.promise);
    const outbox = createAuthenticatedSessionOutbox({
      userId: 'user-a',
      preferencesStore: store,
      queryClient,
      onTerminalUnauthorized: async () => undefined,
      now: () => NOW_MS
    });

    const submission = outbox.submit(entry.clientSessionId);
    await vi.waitFor(() => {
      expect(apiMocks.fetchPracticeSessions).toHaveBeenCalledTimes(1);
      expect(apiMocks.fetchStatsSummary).toHaveBeenCalledTimes(1);
    });

    expect(queryClient.getQueryData(userQueryKeys.sessions('user-a'))).toEqual([
      accepted
    ]);
    expect(ledger).toEqual([entry]);
    expect(removeLedgerEntry).not.toHaveBeenCalled();

    sessionsGate.resolve([accepted]);
    statsGate.resolve({
      totalSessions: 1,
      totalPracticeSeconds: 298,
      weeklyPracticeSeconds: 298,
      currentStreak: 1,
      recentSessions: [accepted]
    });
    await submission;

    expect(removeLedgerEntry).toHaveBeenCalledWith(entry.clientSessionId);
    expect(ledger).toEqual([]);
  });

  it('waits for post-acceptance fetches instead of reusing stale in-flight user queries', async () => {
    const entry = pendingEntry();
    const accepted = acceptedSession();
    const staleSession: PracticeSession = {
      ...accepted,
      id: '66666666-6666-4666-8666-666666666666',
      clientSessionId: '77777777-7777-4777-8777-777777777777'
    };
    let ledger: LocalSessionLedgerEntry[] = [entry];
    const removeLedgerEntry = vi.fn(async (clientSessionId: string) => {
      ledger = ledger.filter((row) => row.clientSessionId !== clientSessionId);
    });
    const store = {
      getState: () => ({
        localSessionLedger: ledger,
        updateLedgerEntry: vi.fn(),
        removeLedgerEntry
      })
    } as unknown as UserPreferencesStore;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const sessionsKey = userQueryKeys.sessions('user-a');
    const statsKey = userQueryKeys.stats('user-a');
    const staleSessionsGate = deferred<PracticeSession[]>();
    const staleStatsGate = deferred<StatsSummary>();
    const freshSessionsGate = deferred<PracticeSession[]>();
    const freshStatsGate = deferred<StatsSummary>();
    const staleSessionsRequest = queryClient
      .fetchQuery({
        queryKey: sessionsKey,
        queryFn: () => staleSessionsGate.promise
      })
      .catch(() => undefined);
    const staleStatsRequest = queryClient
      .fetchQuery({
        queryKey: statsKey,
        queryFn: () => staleStatsGate.promise
      })
      .catch(() => undefined);
    apiMocks.createPracticeSession.mockResolvedValue(accepted);
    apiMocks.fetchPracticeSessions.mockReturnValue(freshSessionsGate.promise);
    apiMocks.fetchStatsSummary.mockReturnValue(freshStatsGate.promise);
    const outbox = createAuthenticatedSessionOutbox({
      userId: 'user-a',
      preferencesStore: store,
      queryClient,
      onTerminalUnauthorized: async () => undefined,
      now: () => NOW_MS
    });

    const submission = outbox.submit(entry.clientSessionId);
    try {
      await vi.waitFor(() => {
        expect(apiMocks.fetchPracticeSessions).toHaveBeenCalledTimes(1);
        expect(apiMocks.fetchStatsSummary).toHaveBeenCalledTimes(1);
      });
      expect(queryClient.getQueryData(sessionsKey)).toEqual([accepted]);
      expect(removeLedgerEntry).not.toHaveBeenCalled();
      expect(ledger).toEqual([entry]);

      staleSessionsGate.resolve([staleSession]);
      staleStatsGate.resolve({
        totalSessions: 0,
        totalPracticeSeconds: 0,
        weeklyPracticeSeconds: 0,
        currentStreak: 0,
        recentSessions: []
      });
      await Promise.resolve();
      expect(removeLedgerEntry).not.toHaveBeenCalled();

      freshSessionsGate.resolve([accepted]);
      freshStatsGate.resolve({
        totalSessions: 1,
        totalPracticeSeconds: 298,
        weeklyPracticeSeconds: 298,
        currentStreak: 1,
        recentSessions: [accepted]
      });
      await submission;

      expect(queryClient.getQueryData(sessionsKey)).toEqual([accepted]);
      expect(removeLedgerEntry).toHaveBeenCalledWith(entry.clientSessionId);
      expect(ledger).toEqual([]);
    } finally {
      staleSessionsGate.resolve([staleSession]);
      staleStatsGate.resolve({
        totalSessions: 0,
        totalPracticeSeconds: 0,
        weeklyPracticeSeconds: 0,
        currentStreak: 0,
        recentSessions: []
      });
      freshSessionsGate.resolve([accepted]);
      freshStatsGate.resolve({
        totalSessions: 1,
        totalPracticeSeconds: 298,
        weeklyPracticeSeconds: 298,
        currentStreak: 1,
        recentSessions: [accepted]
      });
      await Promise.allSettled([
        staleSessionsRequest,
        staleStatsRequest,
        submission
      ]);
    }
  });

  it('schedules a refresh failure without classifying the accepted POST as terminal', async () => {
    const entry = pendingEntry();
    const accepted = acceptedSession();
    let ledger: LocalSessionLedgerEntry[] = [entry];
    const updateLedgerEntry = vi.fn(
      async (
        clientSessionId: string,
        updater: (entry: LocalSessionLedgerEntry) => LocalSessionLedgerEntry
      ) => {
        ledger = ledger.map((row) =>
          row.clientSessionId === clientSessionId ? updater(row) : row
        );
      }
    );
    const removeLedgerEntry = vi.fn(async (clientSessionId: string) => {
      ledger = ledger.filter((row) => row.clientSessionId !== clientSessionId);
    });
    const store = {
      getState: () => ({
        localSessionLedger: ledger,
        updateLedgerEntry,
        removeLedgerEntry
      })
    } as unknown as UserPreferencesStore;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    apiMocks.createPracticeSession.mockResolvedValue(accepted);
    apiMocks.fetchPracticeSessions.mockRejectedValue(new Error('offline'));
    apiMocks.fetchStatsSummary.mockResolvedValue({
      totalSessions: 1,
      totalPracticeSeconds: 298,
      weeklyPracticeSeconds: 298,
      currentStreak: 1,
      recentSessions: [accepted]
    });
    const outbox = createAuthenticatedSessionOutbox({
      userId: 'user-a',
      preferencesStore: store,
      queryClient,
      onTerminalUnauthorized: async () => undefined,
      now: () => NOW_MS
    });

    await expect(outbox.submit(entry.clientSessionId)).resolves.toBeUndefined();

    expect(ledger[0]).toMatchObject({
      state: 'pending',
      attemptCount: 1,
      nextAttemptAt: new Date(NOW_MS + 5_000).toISOString(),
      lastErrorCode: 'CACHE_REFRESH_FAILED'
    });
    expect(updateLedgerEntry).toHaveBeenCalledTimes(1);
    expect(removeLedgerEntry).not.toHaveBeenCalled();
  });
});
