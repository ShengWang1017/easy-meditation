import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthLoginInput, AuthRegisterInput } from '@easy-meditation/shared';
import * as authApi from '../api/auth';
import { ApiRequestError } from '../api/client';

export const REFRESH_TOKEN_KEY = 'easyMeditation.refreshToken';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  isRestoring: boolean;
  login(input: AuthLoginInput): Promise<void>;
  register(input: AuthRegisterInput): Promise<void>;
  restore(): Promise<void>;
  logout(): Promise<void>;
};

function isInvalidRefreshTokenError(error: unknown): error is ApiRequestError {
  return (
    error instanceof ApiRequestError &&
    error.status === 401 &&
    error.code === 'INVALID_REFRESH_TOKEN'
  );
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isRestoring: true,
  async login(input) {
    const tokens = await authApi.login(input);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isRestoring: false
    });
  },
  async register(input) {
    const result = await authApi.register(input);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.tokens.refreshToken);
    set({
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      isRestoring: false
    });
  },
  async restore() {
    let savedRefreshToken: string | null;

    try {
      savedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      set({ accessToken: null, refreshToken: null, isRestoring: false });
      return;
    }

    if (!savedRefreshToken) {
      set({ accessToken: null, refreshToken: null, isRestoring: false });
      return;
    }

    let tokens;
    try {
      tokens = await authApi.refresh(savedRefreshToken);
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        try {
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        } catch {
          // Ignore secure storage cleanup failures so auth restore can still complete locally.
        }
      }

      set({
        accessToken: null,
        refreshToken: null,
        isRestoring: false
      });
      return;
    }

    set({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      isRestoring: false
    });

    try {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
    } catch {
      try {
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } catch {
        // Best-effort cleanup: keep the fresh in-memory session even if secure storage stays stale.
      }
    }
  },
  async logout() {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      if (refreshToken) {
        try {
          await authApi.logout(refreshToken);
        } catch {
          // Best-effort revocation: clear local state even if the network call fails.
        }
      }

      try {
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } catch {
        // Best-effort secure storage cleanup: clear local state even if deletion fails.
      }
    } finally {
      set({
        accessToken: null,
        refreshToken: null,
        isRestoring: false
      });
    }
  }
}));
