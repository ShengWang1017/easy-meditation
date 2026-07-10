import { useCallback, useEffect, useRef, useState } from 'react';
import { CommonActions, usePreventRemove } from '@react-navigation/native';

import type { SessionClockSnapshot } from '../domain/sessionClock';

export type SessionExitNavigationPort = {
  dispatch(action: unknown): void;
};

export type UseSessionExitGuardOptions = {
  snapshot: SessionClockSnapshot;
  controlsUnlocked: boolean;
  isPersisting: boolean;
  persistenceError: string | null;
  persistIntentionalEnd(): Promise<void>;
  retryPersistence(): Promise<void>;
  navigation: SessionExitNavigationPort;
};

export type SessionExitGuardController = {
  dialogVisible: boolean;
  isPersisting: boolean;
  persistenceError: string | null;
  continueSession(): void;
  endAndLeave(): Promise<void>;
  retryAndLeave(): Promise<void>;
  requestExplicitEnd(): Promise<void>;
};

export function useSessionExitGuard(
  options: UseSessionExitGuardOptions
): SessionExitGuardController {
  const [dialogVisible, setDialogVisible] = useState(false);
  const [allowRemoval, setAllowRemoval] = useState(false);
  const pendingActionRef = useRef<unknown | null>(null);
  const mountedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingActionRef.current = null;
    };
  }, []);

  const completedAndDurable =
    options.snapshot.status === 'completed' && options.controlsUnlocked;
  const shouldPrevent =
    !allowRemoval &&
    options.snapshot.status !== 'idle' &&
    !completedAndDurable;

  usePreventRemove(shouldPrevent, ({ data }) => {
    pendingActionRef.current ??= data.action;
    if (
      optionsRef.current.snapshot.status === 'running' ||
      optionsRef.current.snapshot.status === 'paused'
    ) {
      setDialogVisible(true);
    }
  });

  const approvePendingAction = useCallback(() => {
    if (!mountedRef.current || pendingActionRef.current === null) return;
    setDialogVisible(false);
    setAllowRemoval(true);
  }, []);

  useEffect(() => {
    if (!allowRemoval) return;
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action !== null && mountedRef.current) {
      optionsRef.current.navigation.dispatch(action);
    }
    setAllowRemoval(false);
  }, [allowRemoval]);

  useEffect(() => {
    if (
      options.snapshot.status === 'completed' &&
      options.controlsUnlocked &&
      pendingActionRef.current !== null
    ) {
      approvePendingAction();
    }
  }, [approvePendingAction, options.controlsUnlocked, options.snapshot.status]);

  const continueSession = useCallback(() => {
    pendingActionRef.current = null;
    setDialogVisible(false);
  }, []);

  const persistAndApprove = useCallback(async () => {
    try {
      await optionsRef.current.persistIntentionalEnd();
      approvePendingAction();
    } catch (error) {
      if (mountedRef.current) setDialogVisible(true);
      throw error;
    }
  }, [approvePendingAction]);

  const endAndLeave = useCallback(() => persistAndApprove(), [persistAndApprove]);

  const retryAndLeave = useCallback(async () => {
    try {
      await optionsRef.current.retryPersistence();
      approvePendingAction();
    } catch (error) {
      if (mountedRef.current) setDialogVisible(true);
      throw error;
    }
  }, [approvePendingAction]);

  const requestExplicitEnd = useCallback(() => {
    pendingActionRef.current ??= CommonActions.goBack();
    setDialogVisible(false);
    return persistAndApprove();
  }, [persistAndApprove]);

  return {
    dialogVisible,
    isPersisting: options.isPersisting,
    persistenceError: options.persistenceError,
    continueSession,
    endAndLeave,
    retryAndLeave,
    requestExplicitEnd
  };
}
