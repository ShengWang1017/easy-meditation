import { useCallback, useEffect, useRef, useState } from 'react';
import type { BreathingMethod } from '@easy-meditation/shared';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';

import type { SessionCueKind } from '../audio/cuePlaybackController';
import type { LocalSessionLedgerEntry } from '../domain/sessionLedger';
import {
  createSessionClock,
  type SessionClock,
  type SessionClockSnapshot
} from '../domain/sessionClock';
import {
  buildSessionLedgerEntry,
  type ResolvedSessionMethod
} from '../domain/sessionRecord';

const LOCAL_SESSION_PERSISTENCE_ERROR =
  '无法在本机保存本次练习，请重试。';

export type FocusSessionAudioPort = {
  play(
    kind: SessionCueKind,
    cycleIndex?: number,
    phaseIndex?: number
  ): Promise<void>;
  resetForReplay(): void;
};

export type FocusSessionOutboxPort = {
  submit(clientSessionId: string): Promise<void>;
};

export type UseFocusSessionOptions = {
  method: ResolvedSessionMethod;
  clockMethod: BreathingMethod;
  putLedgerEntry(entry: LocalSessionLedgerEntry): Promise<void>;
  outbox: FocusSessionOutboxPort;
  audio: FocusSessionAudioPort;
  now?: () => number;
  createClientSessionId?: () => string;
};

export type FocusSessionController = {
  snapshot: SessionClockSnapshot;
  clientSessionId: string;
  isPersisting: boolean;
  persistenceError: string | null;
  controlsUnlocked: boolean;
  start(): void;
  pause(): void;
  resume(): void;
  persistIntentionalEnd(): Promise<void>;
  retryPersistence(): Promise<void>;
  replay(): Promise<void>;
};

type FixedRunDependencies = {
  method: ResolvedSessionMethod;
  clockMethod: BreathingMethod;
  putLedgerEntry(entry: LocalSessionLedgerEntry): Promise<void>;
  outbox: FocusSessionOutboxPort;
  now(): number;
  createClientSessionId(): string;
};

export function useFocusSession(
  options: UseFocusSessionOptions
): FocusSessionController {
  const fixedRef = useRef<FixedRunDependencies | null>(null);
  if (fixedRef.current === null) {
    fixedRef.current = {
      method: {
        ...options.method,
        phases: options.method.phases.map((phase) => ({ ...phase }))
      },
      clockMethod: {
        ...options.clockMethod,
        phases: options.clockMethod.phases.map((phase) => ({ ...phase }))
      },
      putLedgerEntry: options.putLedgerEntry,
      outbox: options.outbox,
      now: options.now ?? Date.now,
      createClientSessionId:
        options.createClientSessionId ?? Crypto.randomUUID
    };
  }
  const fixed = fixedRef.current;
  const audioRef = useRef(options.audio);
  audioRef.current = options.audio;
  const clockRef = useRef<SessionClock | null>(null);
  if (clockRef.current === null) {
    clockRef.current = createSessionClock(
      fixed.clockMethod,
      fixed.method.plannedDurationSeconds,
      fixed.now
    );
  }
  const clientSessionIdRef = useRef<string | null>(null);
  if (clientSessionIdRef.current === null) {
    clientSessionIdRef.current = fixed.createClientSessionId();
  }
  const initialSnapshotRef = useRef(clockRef.current.snapshot());
  const snapshotRef = useRef(initialSnapshotRef.current);
  const [snapshot, setSnapshot] = useState(initialSnapshotRef.current);
  const [isPersisting, setIsPersisting] = useState(false);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [controlsUnlocked, setControlsUnlocked] = useState(true);
  const controlsUnlockedRef = useRef(true);
  const mountedRef = useRef(false);
  const startedAtRef = useRef<string | null>(null);
  const entryToPersistRef = useRef<LocalSessionLedgerEntry | null>(null);
  const entryPreparedRef = useRef(false);
  const finalizationCompletedRef = useRef<boolean | null>(null);
  const finalizationPromiseRef = useRef<Promise<void> | null>(null);
  const finalizationRunIdRef = useRef<string | null>(null);
  const persistedClientSessionIdRef = useRef<string | null>(null);
  const persistCurrentRunRef = useRef<(completed: boolean) => Promise<void>>(
    async () => undefined
  );

  const updateControlsUnlocked = useCallback((unlocked: boolean) => {
    controlsUnlockedRef.current = unlocked;
    if (mountedRef.current) setControlsUnlocked(unlocked);
  }, []);

  const publishSnapshot = useCallback((next: SessionClockSnapshot) => {
    snapshotRef.current = next;
    if (mountedRef.current) setSnapshot(next);
  }, []);

  const dispatchCue = useCallback((next: SessionClockSnapshot) => {
    if (next.status === 'completed') {
      void audioRef.current.play('complete').catch(() => undefined);
      return;
    }
    if (next.status !== 'running' || next.phase.isComplete) return;

    const cycleSeconds = fixed.method.phases.reduce(
      (sum, phase) => sum + phase.durationSeconds,
      0
    );
    const cycleIndex =
      cycleSeconds > 0 ? Math.floor(next.elapsedSeconds / cycleSeconds) : 0;
    void audioRef.current
      .play(next.phase.kind as SessionCueKind, cycleIndex, next.phase.phaseIndex)
      .catch(() => undefined);
  }, [fixed.method.phases]);

  const refresh = useCallback(() => {
    const next = clockRef.current!.snapshot();
    publishSnapshot(next);
    dispatchCue(next);
    if (next.status === 'completed') {
      void persistCurrentRunRef.current(true).catch(() => undefined);
    }
    return next;
  }, [dispatchCue, publishSnapshot]);

  const persistCurrentRun = useCallback(
    (requestedCompleted: boolean): Promise<void> => {
      const clientSessionId = clientSessionIdRef.current!;
      if (persistedClientSessionIdRef.current === clientSessionId) {
        return Promise.resolve();
      }
      if (
        finalizationPromiseRef.current &&
        finalizationRunIdRef.current === clientSessionId
      ) {
        return finalizationPromiseRef.current;
      }

      const frozen = clockRef.current!.freeze();
      publishSnapshot(frozen);
      if (frozen.status === 'completed') dispatchCue(frozen);
      const completed = requestedCompleted || frozen.status === 'completed';
      finalizationCompletedRef.current ??= completed;

      if (!entryPreparedRef.current) {
        const endedAt = new Date(fixed.now()).toISOString();
        entryToPersistRef.current = buildSessionLedgerEntry({
          clientSessionId,
          method: fixed.method,
          actualDurationSeconds: frozen.elapsedSeconds,
          completed: finalizationCompletedRef.current,
          startedAt: startedAtRef.current ?? endedAt,
          endedAt
        });
        entryPreparedRef.current = true;
      }

      updateControlsUnlocked(false);
      if (mountedRef.current) {
        setIsPersisting(true);
        setPersistenceError(null);
      }

      const work = (async () => {
        try {
          const entry = entryToPersistRef.current;
          if (entry) await fixed.putLedgerEntry(entry);
          persistedClientSessionIdRef.current = clientSessionId;
          updateControlsUnlocked(true);
          if (entry?.origin === 'built_in' && mountedRef.current) {
            try {
              void fixed.outbox.submit(entry.clientSessionId).catch(() => undefined);
            } catch {
              // Submission is deliberately best-effort after the local barrier.
            }
          }
        } catch {
          if (mountedRef.current) {
            setPersistenceError(LOCAL_SESSION_PERSISTENCE_ERROR);
          }
          throw new Error('LOCAL_SESSION_PERSIST_FAILED');
        } finally {
          if (mountedRef.current) setIsPersisting(false);
        }
      })();

      finalizationPromiseRef.current = work;
      finalizationRunIdRef.current = clientSessionId;
      const clear = () => {
        if (finalizationPromiseRef.current === work) {
          finalizationPromiseRef.current = null;
          finalizationRunIdRef.current = null;
        }
      };
      void work.then(clear, clear);
      return work;
    },
    [dispatchCue, fixed, publishSnapshot, updateControlsUnlocked]
  );
  persistCurrentRunRef.current = persistCurrentRun;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (snapshot.status !== 'running') return;
    const timer = setInterval(refresh, 250);
    return () => clearInterval(timer);
  }, [refresh, snapshot.status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const start = useCallback(() => {
    if (
      !controlsUnlockedRef.current ||
      snapshotRef.current.status !== 'idle'
    ) {
      return;
    }
    startedAtRef.current = new Date(fixed.now()).toISOString();
    clockRef.current!.start();
    refresh();
  }, [fixed, refresh]);

  const pause = useCallback(() => {
    if (!controlsUnlockedRef.current || snapshotRef.current.status !== 'running') {
      return;
    }
    clockRef.current!.pause();
    refresh();
  }, [refresh]);

  const resume = useCallback(() => {
    if (!controlsUnlockedRef.current || snapshotRef.current.status !== 'paused') {
      return;
    }
    clockRef.current!.resume();
    refresh();
  }, [refresh]);

  const persistIntentionalEnd = useCallback(
    () => persistCurrentRun(false),
    [persistCurrentRun]
  );

  const retryPersistence = useCallback(() => {
    const completed =
      finalizationCompletedRef.current ??
      snapshotRef.current.status === 'completed';
    return persistCurrentRun(completed);
  }, [persistCurrentRun]);

  const replay = useCallback(async () => {
    const currentId = clientSessionIdRef.current!;
    if (
      !controlsUnlockedRef.current ||
      snapshotRef.current.status !== 'completed' ||
      persistedClientSessionIdRef.current !== currentId
    ) {
      return;
    }

    clientSessionIdRef.current = fixed.createClientSessionId();
    clockRef.current = createSessionClock(
      fixed.clockMethod,
      fixed.method.plannedDurationSeconds,
      fixed.now
    );
    startedAtRef.current = new Date(fixed.now()).toISOString();
    entryToPersistRef.current = null;
    entryPreparedRef.current = false;
    finalizationCompletedRef.current = null;
    finalizationPromiseRef.current = null;
    finalizationRunIdRef.current = null;
    persistedClientSessionIdRef.current = null;
    if (mountedRef.current) {
      setPersistenceError(null);
      setIsPersisting(false);
    }
    updateControlsUnlocked(true);
    audioRef.current.resetForReplay();
    clockRef.current.start();
    refresh();
  }, [fixed, refresh, updateControlsUnlocked]);

  return {
    snapshot,
    clientSessionId: clientSessionIdRef.current,
    isPersisting,
    persistenceError,
    controlsUnlocked,
    start,
    pause,
    resume,
    persistIntentionalEnd,
    retryPersistence,
    replay
  };
}
