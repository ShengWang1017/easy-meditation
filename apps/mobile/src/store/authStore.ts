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
  sessionRevision: number;
  login(input: AuthLoginInput): Promise<void>;
  register(input: AuthRegisterInput): Promise<void>;
  restore(): Promise<void>;
  logout(): Promise<void>;
  acceptRefreshedTokens(tokens: TokenPair, expectedRefreshToken: string): Promise<boolean>;
};

let restorePromise: Promise<void> | null = null;
let cleanupTail: Promise<void> = Promise.resolve();
let terminalClearScheduled = false;

function isInvalidRefreshTokenError(error: unknown): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    error.status === 401 &&
    error.code === 'INVALID_REFRESH_TOKEN'
  );
}

async function deleteStoredRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Local session cleanup must still finish if secure storage is unavailable.
  }
}

function enqueueCleanup(operation: () => Promise<void>): Promise<void> {
  const result = cleanupTail.then(operation);
  cleanupTail = result.catch(() => undefined);
  return result;
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
    sessionRevision: 0,
    isTerminating: false,
    async login(input) {
      const tokens = await authApi.login(input);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      set((state) => ({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isRestoring: false,
        restoreError: null,
        isTerminating: false,
        sessionRevision: state.sessionRevision + 1
      }));
    },
    async register(input) {
      const result = await authApi.register(input);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.tokens.refreshToken);
      set((state) => ({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        isRestoring: false,
        restoreError: null,
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
            restoreError: null
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
              restoreError: null
            });
          } else {
            set({
              accessToken: null,
              refreshToken: savedRefreshToken,
              isRestoring: false,
              restoreError: error
            });
          }
          return;
        }

        set((state) => ({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isRestoring: false,
          restoreError: null,
          isTerminating: false,
          sessionRevision: state.sessionRevision + 1
        }));

        try {
          await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
        } catch {
          await deleteStoredRefreshToken();
        }
      })().finally(() => {
        restorePromise = null;
      });

      return restorePromise;
    },
    logout() {
      set({ isTerminating: true });
      return enqueueCleanup(async () => {
        const refreshToken = get().refreshToken;
        if (refreshToken) {
          try {
            await authApi.logout(refreshToken);
          } catch {
            // Revocation is best effort; retirement and local deletion are mandatory.
          }
        }
        await finishLocalSessionCleanup();
      });
    },
    clearAuthenticatedSession() {
      set({ isTerminating: true });
      return enqueueCleanup(finishLocalSessionCleanup);
    },
    requestTerminalSessionClear() {
      if (terminalClearScheduled || get().isTerminating) {
        return;
      }

      terminalClearScheduled = true;
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
        restoreError: null
      });

      try {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      } catch {
        await deleteStoredRefreshToken();
      }
      return true;
    }
  };
});
