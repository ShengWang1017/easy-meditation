import React from 'react';
import { jest } from '@jest/globals';
import type { SessionClockSnapshot, SessionStatus } from '../domain/sessionClock';
import { act, render, waitFor } from '@testing-library/react-native';

type PreventRemoveCallback = (event: { data: { action: unknown } }) => void;

const mockUsePreventRemove = jest.fn<
  (preventRemove: boolean, callback: PreventRemoveCallback) => void
>();
const mockGoBackAction = { type: 'GO_BACK', source: 'session-route' };

jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    goBack: () => mockGoBackAction
  },
  usePreventRemove: (preventRemove: boolean, callback: (event: unknown) => void) =>
    mockUsePreventRemove(preventRemove, callback)
}));

import {
  useSessionExitGuard,
  type SessionExitGuardController,
  type UseSessionExitGuardOptions
} from './useSessionExitGuard';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function snapshot(status: SessionStatus): SessionClockSnapshot {
  const completed = status === 'completed';
  return {
    status,
    elapsedSeconds: completed ? 60 : status === 'idle' ? 0 : 12,
    remainingSeconds: completed ? 0 : 48,
    phase: {
      kind: completed ? 'complete' : 'inhale',
      label: completed ? '完成' : '吸气',
      phaseIndex: 0,
      phaseProgress: completed ? 1 : 0.5,
      remainingInPhase: completed ? 0 : 2,
      remainingInSession: completed ? 0 : 48,
      elapsedSeconds: completed ? 60 : status === 'idle' ? 0 : 12,
      isComplete: completed
    }
  };
}

let latest: SessionExitGuardController;
let registered:
  | { preventRemove: boolean; callback: PreventRemoveCallback }
  | undefined;

function Probe({ options }: { options: UseSessionExitGuardOptions }) {
  latest = useSessionExitGuard(options);
  return null;
}

describe('useSessionExitGuard', () => {
  beforeEach(() => {
    registered = undefined;
    mockUsePreventRemove.mockReset();
    mockUsePreventRemove.mockImplementation((preventRemove, callback) => {
      registered = { preventRemove, callback };
    });
  });

  function harness(overrides: Partial<UseSessionExitGuardOptions> = {}) {
    const navigation = { dispatch: jest.fn() };
    const persistIntentionalEnd = jest.fn(async () => undefined);
    const retryPersistence = jest.fn(async () => undefined);
    const options: UseSessionExitGuardOptions = {
      snapshot: snapshot('running'),
      controlsUnlocked: true,
      isPersisting: false,
      persistenceError: null,
      persistIntentionalEnd,
      retryPersistence,
      navigation,
      ...overrides
    };
    const view = render(<Probe options={options} />);

    function trigger(action: unknown) {
      act(() => registered?.callback({ data: { action } }));
    }

    return { ...view, options, navigation, persistIntentionalEnd, retryPersistence, trigger };
  }

  it('does not prevent idle removal', () => {
    harness({ snapshot: snapshot('idle') });
    expect(registered?.preventRemove).toBe(false);
  });

  it.each([
    ['header back', { type: 'GO_BACK' }],
    ['Android back', { type: 'GO_BACK', source: 'hardware' }],
    ['records tab', { type: 'NAVIGATE', payload: { name: 'records' } }],
    ['replace', { type: 'REPLACE', payload: { name: 'guide' } }],
    ['deep link', { type: 'RESET', payload: { path: '/records?from=link' } }]
  ])('blocks %s and dispatches its original action only after persistence', async (_label, action) => {
    const persistence = deferred<void>();
    const view = harness({
      persistIntentionalEnd: jest.fn(() => persistence.promise)
    });

    expect(registered?.preventRemove).toBe(true);
    view.trigger(action);
    expect(latest.dialogVisible).toBe(true);
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    let ending!: Promise<void>;
    act(() => {
      ending = latest.endAndLeave();
    });
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    persistence.resolve();
    await act(async () => ending);
    await waitFor(() => expect(view.navigation.dispatch).toHaveBeenCalledWith(action));
    expect(view.navigation.dispatch).toHaveBeenCalledTimes(1);
  });

  it('continues the session without persisting or dispatching', () => {
    const action = { type: 'NAVIGATE', payload: { name: 'records' } };
    const view = harness();
    view.trigger(action);

    act(() => latest.continueSession());

    expect(latest.dialogVisible).toBe(false);
    expect(view.persistIntentionalEnd).not.toHaveBeenCalled();
    expect(view.navigation.dispatch).not.toHaveBeenCalled();
  });

  it('preserves the first blocked action while the dialog is already open', async () => {
    const first = { type: 'NAVIGATE', payload: { name: 'records' } };
    const second = { type: 'REPLACE', payload: { name: 'guide' } };
    const view = harness();
    view.trigger(first);
    view.trigger(second);

    await act(async () => latest.endAndLeave());
    await waitFor(() => expect(view.navigation.dispatch).toHaveBeenCalledWith(first));
    expect(view.navigation.dispatch).not.toHaveBeenCalledWith(second);
  });

  it('routes explicit end through the same barrier with a go-back action', async () => {
    const persistence = deferred<void>();
    const view = harness({
      persistIntentionalEnd: jest.fn(() => persistence.promise)
    });

    let ending!: Promise<void>;
    act(() => {
      ending = latest.requestExplicitEnd();
    });
    expect(latest.dialogVisible).toBe(false);
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    persistence.resolve();
    await act(async () => ending);
    await waitFor(() =>
      expect(view.navigation.dispatch).toHaveBeenCalledWith(mockGoBackAction)
    );
  });

  it('keeps the failed finalization locked to its original action until retry leaves', async () => {
    const action = { type: 'NAVIGATE', payload: { name: 'records' } };
    const persistIntentionalEnd = jest.fn(async () => {
      throw new Error('LOCAL_SESSION_PERSIST_FAILED');
    });
    const retry = deferred<void>();
    const retryPersistence = jest.fn(() => retry.promise);
    const view = harness({ persistIntentionalEnd, retryPersistence });
    view.trigger(action);

    await act(async () => {
      await expect(latest.endAndLeave()).rejects.toThrow(
        'LOCAL_SESSION_PERSIST_FAILED'
      );
    });
    view.rerender(
      <Probe
        options={{
          ...view.options,
          persistenceError: '无法在本机保存本次练习，请重试。'
        }}
      />
    );
    expect(latest.dialogVisible).toBe(true);
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    act(() => latest.continueSession());

    expect(latest.dialogVisible).toBe(true);
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    let retrying!: Promise<void>;
    act(() => {
      retrying = latest.retryAndLeave();
    });
    expect(view.navigation.dispatch).not.toHaveBeenCalled();
    retry.resolve();
    await act(async () => retrying);
    await waitFor(() => expect(view.navigation.dispatch).toHaveBeenCalledWith(action));
  });

  it('queues a completed removal until the automatic local write unlocks controls', async () => {
    const action = { type: 'GO_BACK', source: 'hardware' };
    const view = harness({
      snapshot: snapshot('completed'),
      controlsUnlocked: false,
      isPersisting: true
    });
    view.trigger(action);

    expect(latest.dialogVisible).toBe(false);
    expect(view.navigation.dispatch).not.toHaveBeenCalled();

    view.rerender(
      <Probe
        options={{
          ...view.options,
          snapshot: snapshot('completed'),
          controlsUnlocked: true,
          isPersisting: false
        }}
      />
    );
    await waitFor(() => expect(view.navigation.dispatch).toHaveBeenCalledWith(action));
  });
});
