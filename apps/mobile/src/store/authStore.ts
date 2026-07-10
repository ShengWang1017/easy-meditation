import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type {
  AuthLoginInput,
  AuthRegisterInput,
  TokenPair
} from '@easy-meditation/shared';

import * as authApi from '../api/auth';
import { ApiRequestError } from '../api/client';
import { activeUserScopeCoordinator } from '../query/client';

export const REFRESH_TOKEN_KEY = 'easyMeditation.refreshToken';
export const AUTH_LOGOUT_TIMEOUT_MS = 5_000;

export type AuthTerminationState = {
  isTerminating: boolean;
  clearAuthenticatedSession(): Promise<void>;
  requestTerminalSessionClear(): void;
};

type AuthState = AuthTerminationState & {
  accessToken: string | null;
  refreshToken: string | null;
  isRestoring: boolean;
  restoreError: unknown | null;
  pendingRestoreTokens: TokenPair | null;
  sessionRevision: number;
  login(input: AuthLoginInput): Promise<void>;
  register(input: AuthRegisterInput): Promise<void>;
  restore(): Promise<void>;
  logout(): Promise<void>;
  acceptRefreshedTokens(tokens: TokenPair, expectedRefreshToken: string): Promise<boolean>;
};

let restorePromise: Promise<void> | null = null;
let cleanupTail: Promise<void> = Promise.resolve();
let secureStoreMutationTail: Promise<void> = Promise.resolve();
let terminalClearScheduled = false;
let tokenPersistenceGeneration = 0;
let authAttemptGeneration = 0;

function isInvalidRefreshTokenError(error: unknown): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    error.status === 401 &&
    error.code === 'INVALID_REFRESH_TOKEN'
  );
}

function enqueueSecureStoreMutation(
  operation: () => Promise<void>
): Promise<void> {
  const result = secureStoreMutationTail.then(operation);
  secureStoreMutationTail = result.catch(() => undefined);
  return result;
}

function queueStoredRefreshTokenWrite(refreshToken: string): {
  generation: number;
  result: Promise<void>;
} {
  const generation = ++tokenPersistenceGeneration;
  return {
    generation,
    result: enqueueSecureStoreMutation(() =>
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken)
    )
  };
}

async function deleteStoredRefreshToken(): Promise<void> {
  tokenPersistenceGeneration += 1;
  try {
    await enqueueSecureStoreMutation(() =>
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
    );
  } catch {
    // Local session cleanup must still finish if secure storage is unavailable.
  }
}

function enqueueCleanup(operation: () => Promise<void>): Promise<void> {
  const result = cleanupTail.then(operation);
  cleanupTail = result.catch(() => undefined);
  return result;
}

async function revokeRefreshTokenBestEffort(refreshToken: string): Promise<void> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const revocation = Promise.resolve()
    .then(() => authApi.logout(refreshToken, controller.signal))
    .catch(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve();
    }, AUTH_LOGOUT_TIMEOUT_MS);
  });

  await Promise.race([revocation, timeout]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  async function finishLocalSessionCleanup(): Promise<void> {
    await activeUserScopeCoordinator.retire();
    await deleteStoredRefreshToken();
    set((state) => ({
      accessToken: null,
      refreshToken: null,
      isRestoring: false,
      restoreError: null,
      pendingRestoreTokens: null,
      isTerminating: false,
      sessionRevision:
        state.sessionRevision + (state.accessToken !== null ? 1 : 0)
    }));
  }

  return {
    accessToken: null,
    refreshToken: null,
    isRestoring: true,
    restoreError: null,
    pendingRestoreTokens: null,
    sessionRevision: 0,
    isTerminating: false,
    async login(input) {
      const attempt = ++authAttemptGeneration;
      const tokens = await authApi.login(input);
      if (attempt !== authAttemptGeneration) {
        return;
      }
      await queueStoredRefreshTokenWrite(tokens.refreshToken).result;
      if (attempt !== authAttemptGeneration) {
        return;
      }
      set((state) => ({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isRestoring: false,
        restoreError: null,
        pendingRestoreTokens: null,
        isTerminating: false,
        sessionRevision: state.sessionRevision + 1
      }));
    },
    async register(input) {
      const attempt = ++authAttemptGeneration;
      const result = await authApi.register(input);
      if (attempt !== authAttemptGeneration) {
        return;
      }
      await queueStoredRefreshTokenWrite(result.tokens.refreshToken).result;
      if (attempt !== authAttemptGeneration) {
        return;
      }
      set((state) => ({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        isRestoring: false,
        restoreError: null,
        pendingRestoreTokens: null,
        isTerminating: false,
        sessionRevision: state.sessionRevision + 1
      }));
    },
    restore() {
      if (restorePromise) {
        return restorePromise;
      }

      restorePromise = (async () => {
        set({ isRestoring: true, restoreError: null });
        const pendingRestoreTokens = get().pendingRestoreTokens;
        if (pendingRestoreTokens) {
          try {
            await queueStoredRefreshTokenWrite(
              pendingRestoreTokens.refreshToken
            ).result;
          } catch (error) {
            set({
              accessToken: null,
              refreshToken: pendingRestoreTokens.refreshToken,
              isRestoring: false,
              restoreError: error,
              pendingRestoreTokens
            });
            return;
          }

          set((state) => ({
            accessToken: pendingRestoreTokens.accessToken,
            refreshToken: pendingRestoreTokens.refreshToken,
            isRestoring: false,
            restoreError: null,
            pendingRestoreTokens: null,
            isTerminating: false,
            sessionRevision: state.sessionRevision + 1
          }));
          return;
        }

        let savedRefreshToken: string | null;

        try {
          savedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        } catch (error) {
          set({ isRestoring: false, restoreError: error });
          return;
        }

        if (!savedRefreshToken) {
          set({
            accessToken: null,
            refreshToken: null,
            isRestoring: false,
            restoreError: null,
            pendingRestoreTokens: null
          });
          return;
        }

        let tokens: TokenPair;
        try {
          tokens = await authApi.refresh(savedRefreshToken);
        } catch (error) {
          if (isInvalidRefreshTokenError(error)) {
            await deleteStoredRefreshToken();
            set({
              accessToken: null,
              refreshToken: null,
              isRestoring: false,
              restoreError: null,
              pendingRestoreTokens: null
            });
          } else {
            set({
              accessToken: null,
              refreshToken: savedRefreshToken,
              isRestoring: false,
              restoreError: error,
              pendingRestoreTokens: null
            });
          }
          return;
        }

        try {
          await queueStoredRefreshTokenWrite(tokens.refreshToken).result;
        } catch (error) {
          set({
            accessToken: null,
            refreshToken: tokens.refreshToken,
            isRestoring: false,
            restoreError: error,
            pendingRestoreTokens: tokens,
            isTerminating: false
          });
          return;
        }

        set((state) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isRestoring: false,
          restoreError: null,
          pendingRestoreTokens: null,
          isTerminating: false,
          sessionRevision: state.sessionRevision + 1
        }));
      })().finally(() => {
        restorePromise = null;
      });

      return restorePromise;
    },
    logout() {
      authAttemptGeneration += 1;
      set({ isTerminating: true });
      return enqueueCleanup(async () => {
        const refreshToken = get().refreshToken;
        if (refreshToken) {
          await revokeRefreshTokenBestEffort(refreshToken);
        }
        await finishLocalSessionCleanup();
      });
    },
    clearAuthenticatedSession() {
      authAttemptGeneration += 1;
      set({ isTerminating: true });
      return enqueueCleanup(finishLocalSessionCleanup);
    },
    requestTerminalSessionClear() {
      if (terminalClearScheduled || get().isTerminating) {
        return;
      }

      terminalClearScheduled = true;
      authAttemptGeneration += 1;
      set({ isTerminating: true });
      setTimeout(() => {
        void get()
          .clearAuthenticatedSession()
          .finally(() => {
            terminalClearScheduled = false;
            if (get().isTerminating) {
              set({ isTerminating: false });
            }
          });
      }, 0);
    },
    async acceptRefreshedTokens(tokens, expectedRefreshToken) {
      const current = get();
      if (
        current.isTerminating ||
        current.refreshToken !== expectedRefreshToken
      ) {
        return false;
      }

      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isRestoring: false,
        restoreError: null,
        pendingRestoreTokens: null
      });

      const persistence = queueStoredRefreshTokenWrite(tokens.refreshToken);
      try {
        await persistence.result;
      } catch {
        const latest = get();
        if (
          persistence.generation === tokenPersistenceGeneration &&
          latest.refreshToken === tokens.refreshToken
        ) {
          await deleteStoredRefreshToken();
        }
      }
      return true;
    }
  };
});
