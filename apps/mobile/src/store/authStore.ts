import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AuthLoginInput, AuthRegisterInput } from '@easy-meditation/shared';
import * as authApi from '../api/auth';

const REFRESH_TOKEN_KEY = 'easyMeditation.refreshToken';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  isRestoring: boolean;
  login(input: AuthLoginInput): Promise<void>;
  register(input: AuthRegisterInput): Promise<void>;
  restore(): Promise<void>;
  logout(): Promise<void>;
};

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
    const savedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!savedRefreshToken) {
      set({ accessToken: null, refreshToken: null, isRestoring: false });
      return;
    }

    try {
      const tokens = await authApi.refresh(savedRefreshToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
      set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isRestoring: false
      });
    } catch {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      set({
        accessToken: null,
        refreshToken: null,
        isRestoring: false
      });
    }
  },
  async logout() {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  }
}));
