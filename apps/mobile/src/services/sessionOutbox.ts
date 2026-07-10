import {
  practiceSessionCreateSchema,
  type PracticeSession,
  type PracticeSessionCreateInput
} from '@easy-meditation/shared';
import type { QueryClient } from '@tanstack/react-query';

import {
  createPracticeSession,
  fetchPracticeSessions
} from '../api/sessions';
import { fetchStatsSummary } from '../api/stats';
import {
  classifySessionSubmissionError,
  transitionAfterAcceptedCacheFailure,
  transitionAfterFailure,
  type LocalSessionLedgerEntry
} from '../domain/sessionLedger';
import { userQueryKeys } from '../query/keys';
import type { UserPreferencesStore } from '../store/preferencesStore';

export type SessionOutboxDependencies = {
  getLedger(): LocalSessionLedgerEntry[];
  updateEntry(
    clientSessionId: string,
    updater: (entry: LocalSessionLedgerEntry) => LocalSessionLedgerEntry
  ): Promise<void>;
  removeEntry(clientSessionId: string): Promise<void>;
  post(input: PracticeSessionCreateInput): Promise<PracticeSession>;
  cacheAndRefreshAccepted(session: PracticeSession): Promise<void>;
  onTerminalUnauthorized(): Promise<void>;
  now(): number;
};

export type SessionOutbox = {
  submit(clientSessionId: string): Promise<void>;
  drainDue(options?: { resumeAuthBlocked?: boolean }): Promise<void>;
  retryNow(clientSessionId: string): Promise<void>;
};

export function createSessionOutbox(
  deps: SessionOutboxDependencies
): SessionOutbox {
  const inFlight = new Map<string, Promise<void>>();

  async function runSubmission(clientSessionId: string): Promise<void> {
    const entry = deps.getLedger().find(
      (item) =>
        item.clientSessionId === clientSessionId &&
        item.origin === 'built_in' &&
        item.state === 'pending'
    );
    if (!entry) return;

    let accepted: PracticeSession;
    try {
      const input = practiceSessionCreateSchema.parse(entry);
      accepted = await deps.post(input);
    } catch (error) {
      const classification = classifySessionSubmissionError(error);
      await deps.updateEntry(clientSessionId, (current) => {
        if (!('attemptCount' in current)) return current;
        return transitionAfterFailure(current, error, deps.now());
      });
      if (classification.kind === 'auth-required') {
        await deps.onTerminalUnauthorized();
      }
      return;
    }

    try {
      await deps.cacheAndRefreshAccepted(accepted);
    } catch {
      // The POST was accepted, so this is a cache synchronization failure, not
      // a submission classification. Back off before an idempotent replay.
      await deps.updateEntry(clientSessionId, (current) => {
        if (!('attemptCount' in current)) return current;
        return transitionAfterAcceptedCacheFailure(current, deps.now());
      });
      return;
    }

    await deps.removeEntry(clientSessionId);
  }

  function submit(clientSessionId: string): Promise<void> {
    const current = inFlight.get(clientSessionId);
    if (current) return current;

    const work = runSubmission(clientSessionId);
    inFlight.set(clientSessionId, work);
    const cleanup = () => {
      if (inFlight.get(clientSessionId) === work) {
        inFlight.delete(clientSessionId);
      }
    };
    void work.then(cleanup, cleanup);
    return work;
  }

  async function drainDue(
    options: { resumeAuthBlocked?: boolean } = {}
  ): Promise<void> {
    const nowMs = deps.now();
    const dueIds = deps.getLedger().flatMap((entry) => {
      if (entry.origin !== 'built_in' || entry.state !== 'pending') {
        return [];
      }

      if (entry.nextAttemptAt === null) {
        return options.resumeAuthBlocked ? [entry.clientSessionId] : [];
      }

      const nextAttemptAtMs = Date.parse(entry.nextAttemptAt);
      return Number.isFinite(nextAttemptAtMs) && nextAttemptAtMs <= nowMs
        ? [entry.clientSessionId]
        : [];
    });

    await Promise.all(dueIds.map((clientSessionId) => submit(clientSessionId)));
  }

  async function retryNow(clientSessionId: string): Promise<void> {
    const paused = deps.getLedger().find(
      (entry) =>
        entry.clientSessionId === clientSessionId &&
        entry.origin === 'built_in' &&
        entry.state === 'retry-paused'
    );
    if (!paused) return;

    const dueNow = new Date(deps.now()).toISOString();
    await deps.updateEntry(clientSessionId, (current) => {
      if (current.origin !== 'built_in' || current.state !== 'retry-paused') {
        return current;
      }
      return {
        ...current,
        state: 'pending',
        attemptCount: 0,
        nextAttemptAt: dueNow,
        lastErrorCode: null
      };
    });
    await submit(clientSessionId);
  }

  return { submit, drainDue, retryNow };
}

export function createAuthenticatedSessionOutbox(options: {
  userId: string;
  preferencesStore: UserPreferencesStore;
  queryClient: QueryClient;
  onTerminalUnauthorized(): Promise<void>;
  now?: () => number;
}): SessionOutbox {
  const sessionsKey = userQueryKeys.sessions(options.userId);
  const statsKey = userQueryKeys.stats(options.userId);

  return createSessionOutbox({
    getLedger: () => options.preferencesStore.getState().localSessionLedger,
    updateEntry: (clientSessionId, updater) =>
      options.preferencesStore
        .getState()
        .updateLedgerEntry(clientSessionId, updater),
    removeEntry: (clientSessionId) =>
      options.preferencesStore.getState().removeLedgerEntry(clientSessionId),
    post: createPracticeSession,
    async cacheAndRefreshAccepted(accepted) {
      await Promise.all([
        options.queryClient.cancelQueries({
          queryKey: sessionsKey,
          exact: true
        }),
        options.queryClient.cancelQueries({
          queryKey: statsKey,
          exact: true
        })
      ]);
      options.queryClient.setQueryData<PracticeSession[]>(
        sessionsKey,
        (current = []) => [
          accepted,
          ...current.filter(
            (session) => session.clientSessionId !== accepted.clientSessionId
          )
        ]
      );
      await Promise.all([
        options.queryClient.fetchQuery({
          queryKey: sessionsKey,
          queryFn: fetchPracticeSessions,
          staleTime: 0
        }),
        options.queryClient.fetchQuery({
          queryKey: statsKey,
          queryFn: fetchStatsSummary,
          staleTime: 0
        })
      ]);
    },
    onTerminalUnauthorized: options.onTerminalUnauthorized,
    now: options.now ?? Date.now
  });
}
