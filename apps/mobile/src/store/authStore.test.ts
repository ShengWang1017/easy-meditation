import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthLoginInput, AuthRegisterInput } from '@easy-meditation/shared';
import { useAuthStore } from './authStore';
import * as authApi from '../api/auth';

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: null,
    manifest2: null
  }
}));

vi.mock('expo-secure-store', () => secureStore);

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secureStore.setItemAsync.mockReset();
    secureStore.getItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      isRestoring: true
    });
  });

  it('stores access and refresh tokens after login', async () => {
    const input: AuthLoginInput = { email: 'person@example.com', password: 'password123' };
    vi.spyOn(authApi, 'login').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh'
    });

    await useAuthStore.getState().login(input);

    expect(authApi.login).toHaveBeenCalledWith(input);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'new-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      isRestoring: false
    });
  });

  it('refreshes tokens from secure storage during restore', async () => {
    secureStore.getItemAsync.mockResolvedValue('saved-refresh');
    vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: 'restored-access',
      refreshToken: 'rotated-refresh'
    });

    await useAuthStore.getState().restore();

    expect(authApi.refresh).toHaveBeenCalledWith('saved-refresh');
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'rotated-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'restored-access',
      refreshToken: 'rotated-refresh',
      isRestoring: false
    });
  });

  it('clears local auth state when refresh restore fails', async () => {
    secureStore.getItemAsync.mockResolvedValue('stale-refresh');
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('expired'));

    await useAuthStore.getState().restore();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('clears local auth state when secure storage read fails during restore', async () => {
    useAuthStore.setState({
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      isRestoring: true
    });
    secureStore.getItemAsync.mockRejectedValue(new Error('secure store unavailable'));
    const refreshSpy = vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: 'unused-access',
      refreshToken: 'unused-refresh'
    });

    await expect(useAuthStore.getState().restore()).resolves.toBeUndefined();

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('stores tokens after registration', async () => {
    const input: AuthRegisterInput = {
      email: 'new@example.com',
      password: 'password123',
      nickname: '小安'
    };
    vi.spyOn(authApi, 'register').mockResolvedValue({
      user: {
        id: '3d3ca763-0ed4-4189-bd4e-bc0fb6302b72',
        email: input.email,
        nickname: input.nickname ?? null,
        createdAt: '2026-07-08T00:00:00.000Z'
      },
      tokens: {
        accessToken: 'registered-access',
        refreshToken: 'registered-refresh'
      }
    });

    await useAuthStore.getState().register(input);

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'registered-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'registered-access',
      refreshToken: 'registered-refresh',
      isRestoring: false
    });
  });

  it('revokes the refresh token with the backend before local logout cleanup', async () => {
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      isRestoring: false
    });
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith('session-refresh');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('still clears local auth state when backend logout revocation fails', async () => {
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      isRestoring: false
    });
    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('network down'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(authApi.logout).toHaveBeenCalledWith('session-refresh');
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });
});
