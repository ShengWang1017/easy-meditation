import React from 'react';
import { jest } from '@jest/globals';
import type { BreathingMethod } from '@easy-meditation/shared';
import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

type PreventRemoveCallback = (event: { data: { action: unknown } }) => void;

const mockUsePreventRemove = jest.fn<
  (preventRemove: boolean, callback: PreventRemoveCallback) => void
>();

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    goBack: () => ({ type: 'GO_BACK' })
  },
  usePreventRemove: (preventRemove: boolean, callback: PreventRemoveCallback) =>
    mockUsePreventRemove(preventRemove, callback)
}));

jest.mock(
  '@easy-meditation/shared',
  () => ({
    getSessionSnapshot: (
      method: BreathingMethod,
      elapsedSeconds: number,
      totalSeconds: number
    ) => {
      const elapsed = Math.max(0, Math.floor(elapsedSeconds));
      const total = Math.max(1, Math.floor(totalSeconds));
      if (elapsed >= total) {
        return {
          kind: 'complete',
          label: '完成',
          phaseIndex: Math.max(0, method.phases.length - 1),
          phaseProgress: 1,
          remainingInPhase: 0,
          remainingInSession: 0,
          elapsedSeconds: total,
          isComplete: true
        };
      }
      const cycleSeconds = method.phases.reduce(
        (sum, phase) => sum + phase.durationSeconds,
        0
      );
      let cycleElapsed = elapsed % cycleSeconds;
      for (let phaseIndex = 0; phaseIndex < method.phases.length; phaseIndex += 1) {
        const phase = method.phases[phaseIndex]!;
        if (cycleElapsed < phase.durationSeconds) {
          return {
            kind: phase.kind,
            label: phase.label,
            phaseIndex,
            phaseProgress: cycleElapsed / phase.durationSeconds,
            remainingInPhase: Math.min(
              phase.durationSeconds - cycleElapsed,
              total - elapsed
            ),
            remainingInSession: total - elapsed,
            elapsedSeconds: elapsed,
            isComplete: false
          };
        }
        cycleElapsed -= phase.durationSeconds;
      }
      throw new Error('invalid test cycle');
    }
  }),
  { virtual: true }
);

import type { LocalSessionLedgerEntry } from '../domain/sessionLedger';
import type { ResolvedSessionMethod } from '../domain/sessionRecord';
import {
  useFocusSession,
  type FocusSessionAudioPort,
  type FocusSessionController,
  type UseFocusSessionOptions
} from './useFocusSession';
import {
  useSessionExitGuard,
  type SessionExitGuardController,
  type SessionExitNavigationPort
} from './useSessionExitGuard';

const IDS = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
] as const;
const START_MS = Date.parse('2026-07-10T04:00:00.000Z');

const clockMethod: BreathingMethod = {
  id: 'box',
  slug: 'box',
  title: 'API 盒式呼吸',
  subtitle: '测试节奏',
  category: 'classic',
  defaultDurationSeconds: 60,
  phases: [
    { kind: 'inhale', label: '吸气', durationSeconds: 1 },
    { kind: 'hold', label: '屏息', durationSeconds: 1 },
    { kind: 'exhale', label: '呼气', durationSeconds: 1 }
  ],
  sortOrder: 1,
  isActive: true
};

function resolvedMethod(
  overrides: Partial<ResolvedSessionMethod> = {}
): ResolvedSessionMethod {
  return {
    id: 'box',
    title: '盒式呼吸法',
    phases: clockMethod.phases,
    plannedDurationSeconds: 2,
    origin: 'built_in',
    ...overrides
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

let latest: FocusSessionController;
let latestExit: SessionExitGuardController;
let registeredExit:
  | { preventRemove: boolean; callback: PreventRemoveCallback }
  | undefined;

function Probe({ options }: { options: UseFocusSessionOptions }) {
  latest = useFocusSession(options);
  return null;
}

function ExitProbe({
  navigation,
  options
}: {
  navigation: SessionExitNavigationPort;
  options: UseFocusSessionOptions;
}) {
  latest = useFocusSession(options);
  latestExit = useSessionExitGuard({
    snapshot: latest.snapshot,
    controlsUnlocked: latest.controlsUnlocked,
    isPersisting: latest.isPersisting,
    persistenceError: latest.persistenceError,
    persistIntentionalEnd: latest.persistIntentionalEnd,
    retryPersistence: latest.retryPersistence,
    navigation
  });
  return null;
}

describe('useFocusSession', () => {
  let nowMs: number;
  let appStateListener: ((state: AppStateStatus) => void) | null;
  let removeAppStateListener: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    nowMs = START_MS;
    appStateListener = null;
    removeAppStateListener = jest.fn();
    registeredExit = undefined;
    mockUsePreventRemove.mockReset();
    mockUsePreventRemove.mockImplementation((preventRemove, callback) => {
      registeredExit = { preventRemove, callback };
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') appStateListener = listener;
      return { remove: removeAppStateListener };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  function harness(overrides: Partial<UseFocusSessionOptions> = {}) {
    let idIndex = 0;
    const putLedgerEntry = jest.fn<
      (entry: LocalSessionLedgerEntry) => Promise<void>
    >(async () => undefined);
    const submit = jest.fn<(clientSessionId: string) => Promise<void>>(
      async () => undefined
    );
    const audio: FocusSessionAudioPort = {
      play: jest.fn(async () => undefined),
      resetForReplay: jest.fn()
    };
    const options: UseFocusSessionOptions = {
      method: resolvedMethod(),
      clockMethod,
      putLedgerEntry,
      outbox: { submit },
      audio,
      now: () => nowMs,
      createClientSessionId: () => IDS[idIndex++] ?? IDS[2],
      ...overrides
    };
    const view = render(<Probe options={options} />);

    function elapse(milliseconds: number) {
      nowMs += milliseconds;
      act(() => jest.advanceTimersByTime(250));
    }

    return { ...view, options, putLedgerEntry, submit, audio, elapse };
  }

  it('writes a natural completion once before a fire-and-catch built-in POST', async () => {
    const write = deferred<void>();
    const view = harness({
      putLedgerEntry: jest.fn(() => write.promise),
      outbox: {
        submit: jest.fn(async () => {
          throw new Error('background outbox failure');
        })
      }
    });

    act(() => latest.start());
    view.elapse(2_000);
    await waitFor(() => expect(view.options.putLedgerEntry).toHaveBeenCalledTimes(1));

    let backFinalization!: Promise<void>;
    let endFinalization!: Promise<void>;
    act(() => {
      backFinalization = latest.persistIntentionalEnd();
      endFinalization = latest.persistIntentionalEnd();
    });
    expect(view.options.putLedgerEntry).toHaveBeenCalledTimes(1);
    expect(view.options.outbox.submit).not.toHaveBeenCalled();
    expect(latest).toMatchObject({
      isPersisting: true,
      controlsUnlocked: false
    });

    write.resolve();
    await act(async () => {
      await Promise.all([backFinalization, endFinalization]);
    });

    const entry = (view.options.putLedgerEntry as jest.Mock).mock.calls[0]![0];
    expect(entry).toMatchObject({
      clientSessionId: IDS[0],
      completed: true,
      actualDurationSeconds: 2,
      state: 'pending'
    });
    await waitFor(() => {
      expect(view.options.outbox.submit).toHaveBeenCalledTimes(1);
      expect(latest.controlsUnlocked).toBe(true);
    });
  });

  it('persists custom intentional endings locally without submitting them', async () => {
    const view = harness({
      method: resolvedMethod({
        id: 'custom',
        title: '自定义',
        origin: 'custom',
        plannedDurationSeconds: 120
      }),
      clockMethod: { ...clockMethod, id: 'custom', slug: 'custom' }
    });

    act(() => latest.start());
    view.elapse(1_000);
    await act(async () => latest.persistIntentionalEnd());

    expect(view.putLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        methodType: 'custom',
        methodId: null,
        customRhythmId: null,
        completed: false,
        origin: 'custom',
        state: 'local-only'
      })
    );
    expect(view.submit).not.toHaveBeenCalled();
  });

  it('retries the same frozen entry after a local-write failure', async () => {
    const putLedgerEntry = jest
      .fn<(entry: LocalSessionLedgerEntry) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const view = harness({ putLedgerEntry });

    act(() => latest.start());
    view.elapse(1_000);
    await act(async () => {
      await expect(latest.persistIntentionalEnd()).rejects.toThrow(
        'LOCAL_SESSION_PERSIST_FAILED'
      );
    });
    const firstEntry = putLedgerEntry.mock.calls[0]![0];
    expect(latest).toMatchObject({
      controlsUnlocked: false,
      persistenceError: '无法在本机保存本次练习，请重试。'
    });

    view.elapse(8_000);
    await act(async () => latest.retryPersistence());

    expect(putLedgerEntry).toHaveBeenCalledTimes(2);
    expect(putLedgerEntry.mock.calls[1]![0]).toEqual(firstEntry);
    expect(latest.controlsUnlocked).toBe(true);
  });

  it('never resumes a frozen finalization after its failed write becomes durable', async () => {
    const putLedgerEntry = jest
      .fn<(entry: LocalSessionLedgerEntry) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const view = harness({ putLedgerEntry });

    act(() => latest.start());
    view.elapse(1_000);
    await act(async () => {
      await expect(latest.persistIntentionalEnd()).rejects.toThrow(
        'LOCAL_SESSION_PERSIST_FAILED'
      );
    });
    const frozenSnapshot = latest.snapshot;

    await act(async () => latest.retryPersistence());
    act(() => latest.resume());
    view.elapse(1_000);

    expect(latest.snapshot).toEqual(frozenSnapshot);
    expect(putLedgerEntry).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed exit frozen through dismissal attempts and leaves after retry', async () => {
    const action = { type: 'NAVIGATE', payload: { name: 'records' } };
    const putLedgerEntry = jest
      .fn<(entry: LocalSessionLedgerEntry) => Promise<void>>()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    const navigation = { dispatch: jest.fn() };
    const audio: FocusSessionAudioPort = {
      play: jest.fn(async () => undefined),
      resetForReplay: jest.fn()
    };
    render(
      <ExitProbe
        navigation={navigation}
        options={{
          method: resolvedMethod(),
          clockMethod,
          putLedgerEntry,
          outbox: { submit: jest.fn(async () => undefined) },
          audio,
          now: () => nowMs,
          createClientSessionId: () => IDS[0]
        }}
      />
    );

    act(() => latest.start());
    nowMs += 1_000;
    act(() => jest.advanceTimersByTime(250));
    act(() => registeredExit?.callback({ data: { action } }));
    await act(async () => {
      await expect(latestExit.endAndLeave()).rejects.toThrow(
        'LOCAL_SESSION_PERSIST_FAILED'
      );
    });
    const frozenSnapshot = latest.snapshot;

    act(() => latestExit.continueSession());
    expect(latestExit.dialogVisible).toBe(true);
    expect(navigation.dispatch).not.toHaveBeenCalled();

    await act(async () => latestExit.retryAndLeave());
    await waitFor(() => expect(navigation.dispatch).toHaveBeenCalledWith(action));

    act(() => latest.resume());
    nowMs += 1_000;
    act(() => jest.advanceTimersByTime(250));
    expect(latest.snapshot).toEqual(frozenSnapshot);
    expect(putLedgerEntry.mock.calls[1]![0]).toEqual(
      putLedgerEntry.mock.calls[0]![0]
    );
  });

  it('creates no record at 999ms and creates one at 1000ms', async () => {
    const below = harness();
    act(() => latest.start());
    below.elapse(999);
    await act(async () => latest.persistIntentionalEnd());
    expect(below.putLedgerEntry).not.toHaveBeenCalled();
    below.unmount();

    nowMs = START_MS;
    const boundary = harness();
    act(() => latest.start());
    boundary.elapse(1_000);
    await act(async () => latest.persistIntentionalEnd());
    expect(boundary.putLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({ actualDurationSeconds: 1 })
    );
  });

  it('refreshes on AppState activation and completes only once', async () => {
    const view = harness();
    act(() => latest.start());
    nowMs += 2_000;

    act(() => appStateListener?.('active'));
    await waitFor(() => expect(view.putLedgerEntry).toHaveBeenCalledTimes(1));
    act(() => appStateListener?.('active'));

    expect(view.putLedgerEntry).toHaveBeenCalledTimes(1);
    expect(view.audio.play).toHaveBeenCalledWith('complete');
  });

  it('automatically persists a natural completion when pause beats the refresh interval', async () => {
    const write = deferred<void>();
    const putLedgerEntry = jest.fn(() => write.promise);
    const submit = jest.fn(async () => undefined);
    const view = harness({ putLedgerEntry, outbox: { submit } });
    act(() => latest.start());
    nowMs += 2_000;

    act(() => latest.pause());
    expect(latest.snapshot).toMatchObject({
      status: 'completed',
      elapsedSeconds: 2
    });
    expect(latest).toMatchObject({
      controlsUnlocked: false,
      isPersisting: true
    });
    expect(putLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        completed: true,
        actualDurationSeconds: 2
      })
    );
    expect(view.audio.play).toHaveBeenCalledWith('complete');
    expect(submit).not.toHaveBeenCalled();

    write.resolve();
    await waitFor(() => {
      expect(latest.controlsUnlocked).toBe(true);
      expect(submit).toHaveBeenCalledWith(IDS[0]);
    });
  });

  it('replays once with fresh identity, clock, timestamp, and cue state', async () => {
    const view = harness({ method: resolvedMethod({ plannedDurationSeconds: 1 }) });
    act(() => latest.start());
    view.elapse(1_000);
    await waitFor(() => expect(latest.controlsUnlocked).toBe(true));
    const firstId = latest.clientSessionId;

    nowMs += 2_000;
    await act(async () => {
      await latest.replay();
      await latest.replay();
    });

    expect(latest.clientSessionId).toBe(IDS[1]);
    expect(latest.clientSessionId).not.toBe(firstId);
    expect(latest.snapshot).toMatchObject({ status: 'running', elapsedSeconds: 0 });
    expect(view.audio.resetForReplay).toHaveBeenCalledTimes(1);

    view.elapse(1_000);
    await waitFor(() => expect(view.putLedgerEntry).toHaveBeenCalledTimes(2));
    expect(view.putLedgerEntry.mock.calls[1]![0]).toMatchObject({
      clientSessionId: IDS[1],
      startedAt: new Date(START_MS + 3_000).toISOString()
    });
  });

  it('finishes an old-store write after unmount without starting its outbox', async () => {
    const write = deferred<void>();
    const view = harness({ putLedgerEntry: jest.fn(() => write.promise) });
    act(() => latest.start());
    view.elapse(1_000);
    let persistence!: Promise<void>;
    act(() => {
      persistence = latest.persistIntentionalEnd();
    });

    view.unmount();
    expect(removeAppStateListener).toHaveBeenCalledTimes(1);
    write.resolve();
    await persistence;

    expect(view.options.outbox.submit).not.toHaveBeenCalled();
  });

  it('keeps the initial method snapshot and first startedAt across refetch and double start', async () => {
    const view = harness();
    act(() => latest.start());
    nowMs += 500;
    act(() => latest.start());

    view.rerender(
      <Probe
        options={{
          ...view.options,
          method: resolvedMethod({
            title: '刷新后的错误标题',
            plannedDurationSeconds: 60
          }),
          clockMethod: { ...clockMethod, title: '刷新后的 API 标题' }
        }}
      />
    );
    view.elapse(500);
    await act(async () => latest.persistIntentionalEnd());

    expect(view.putLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        methodTitleSnapshot: '盒式呼吸法',
        plannedDurationSeconds: 2,
        startedAt: new Date(START_MS).toISOString(),
        actualDurationSeconds: 1
      })
    );
  });
});
