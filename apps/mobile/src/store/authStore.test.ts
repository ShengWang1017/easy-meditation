import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthLoginInput, AuthRegisterInput } from '@easy-meditation/shared';
import { ApiRequestError } from '../api/client';
import { useAuthStore } from './authStore';
import * as authApi from '../api/auth';
import { activeUserScopeCoordinator } from '../query/client';

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
      isRestoring: true,
      restoreError: null,
      pendingRestoreTokens: null,
      sessionRevision: 0,
      isTerminating: false
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
      isRestoring: false,
      sessionRevision: 1
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
      isRestoring: false,
      sessionRevision: 1
    });
  });

  it('keeps the restore gate closed and retries persisting rotated tokens before refreshing again', async () => {
    secureStore.getItemAsync.mockResolvedValue('old-refresh');
    vi.spyOn(authApi, 'refresh').mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh'
    });
    const storageError = new Error('secure store write failed');
    secureStore.setItemAsync
      .mockRejectedValueOnce(storageError)
      .mockResolvedValueOnce(undefined);

    await expect(useAuthStore.getState().restore()).resolves.toBeUndefined();

    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'new-refresh'
    );
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: 'new-refresh',
      isRestoring: false,
      restoreError: storageError,
      sessionRevision: 0
    });

    await expect(useAuthStore.getState().restore()).resolves.toBeUndefined();

    expect(secureStore.getItemAsync).toHaveBeenCalledTimes(1);
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(2);
    expect(secureStore.setItemAsync).toHaveBeenLastCalledWith(
      'easyMeditation.refreshToken',
      'new-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      isRestoring: false,
      restoreError: null,
      sessionRevision: 1
    });
  });

  it('deletes the saved refresh token only when refresh returns INVALID_REFRESH_TOKEN', async () => {
    secureStore.getItemAsync.mockResolvedValue('stale-refresh');
    vi.spyOn(authApi, 'refresh').mockRejectedValue(
      new ApiRequestError({
        status: 401,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid.'
      })
    );

    await useAuthStore.getState().restore();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('keeps the saved refresh token when refresh fails with a transient structured error', async () => {
    secureStore.getItemAsync.mockResolvedValue('saved-refresh');
    vi.spyOn(authApi, 'refresh').mockRejectedValue(
      new ApiRequestError({
        status: 500,
        code: 'SERVER_ERROR',
        message: 'Server unavailable.'
      })
    );

    await useAuthStore.getState().restore();

    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: 'saved-refresh',
      isRestoring: false,
      restoreError: expect.any(ApiRequestError)
    });
  });

  it('keeps the saved refresh token when refresh fails with a transport error', async () => {
    secureStore.getItemAsync.mockResolvedValue('saved-refresh');
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new TypeError('Network request failed'));

    await useAuthStore.getState().restore();

    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: 'saved-refresh',
      isRestoring: false,
      restoreError: expect.any(TypeError)
    });
  });

  it('keeps retry material when secure storage read fails during restore', async () => {
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
      accessToken: 'stale-access',
      refreshToken: 'stale-refresh',
      isRestoring: false,
      restoreError: expect.any(Error)
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
      isRestoring: false,
      sessionRevision: 1
    });
  });

  it('keeps the latest login or registration attempt when an older request resolves last', async () => {
    let resolveLogin!: (tokens: {
      accessToken: string;
      refreshToken: string;
    }) => void;
    const delayedLogin = new Promise<{
      accessToken: string;
      refreshToken: string;
    }>((resolve) => {
      resolveLogin = resolve;
    });
    vi.spyOn(authApi, 'login').mockReturnValue(delayedLogin);
    vi.spyOn(authApi, 'register').mockResolvedValue({
      user: {
        id: '3d3ca763-0ed4-4189-bd4e-bc0fb6302b72',
        email: 'new@example.com',
        nickname: null,
        createdAt: '2026-07-08T00:00:00.000Z'
      },
      tokens: {
        accessToken: 'registered-access',
        refreshToken: 'registered-refresh'
      }
    });

    const oldAttempt = useAuthStore.getState().login({
      email: 'old@example.com',
      password: 'password123'
    });
    await useAuthStore.getState().register({
      email: 'new@example.com',
      password: 'password123'
    });

    resolveLogin({
      accessToken: 'stale-login-access',
      refreshToken: 'stale-login-refresh'
    });
    await oldAttempt;

    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'registered-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'registered-access',
      refreshToken: 'registered-refresh',
      sessionRevision: 1
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

    expect(authApi.logout).toHaveBeenCalledWith('session-refresh', expect.anything());
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false,
      sessionRevision: 1
    });
  });

  it('does not increment the session revision for refresh-token rotation', async () => {
    useAuthStore.setState({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      isRestoring: false,
      sessionRevision: 7
    });

    await useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'new-access', refreshToken: 'new-refresh' },
      'old-refresh'
    );

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      sessionRevision: 7
    });
  });

  it('does not let a stale failed token write delete a newer persisted refresh token', async () => {
    useAuthStore.setState({
      accessToken: 'access-0',
      refreshToken: 'refresh-0',
      isRestoring: false,
      sessionRevision: 7
    });
    let rejectOldWrite!: (error: Error) => void;
    const oldWrite = new Promise<void>((_resolve, reject) => {
      rejectOldWrite = reject;
    });
    secureStore.setItemAsync
      .mockReturnValueOnce(oldWrite)
      .mockResolvedValueOnce(undefined);

    const firstRotation = useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      'refresh-0'
    );
    const secondRotation = useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'access-2', refreshToken: 'refresh-2' },
      'refresh-1'
    );

    rejectOldWrite(new Error('stale write failed late'));
    await Promise.all([firstRotation, secondRotation]);

    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(
      1,
      'easyMeditation.refreshToken',
      'refresh-1'
    );
    expect(secureStore.setItemAsync).toHaveBeenNthCalledWith(
      2,
      'easyMeditation.refreshToken',
      'refresh-2'
    );
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      sessionRevision: 7
    });
  });

  it('serializes refresh writes so a stale success cannot overwrite the newer token', async () => {
    useAuthStore.setState({
      accessToken: 'access-0',
      refreshToken: 'refresh-0',
      isRestoring: false,
      sessionRevision: 7
    });
    let persistedRefreshToken: string | null = 'refresh-0';
    let releaseFirstWrite!: () => void;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    secureStore.setItemAsync.mockImplementation(async (_key, refreshToken: string) => {
      if (refreshToken === 'refresh-1') {
        await firstWriteGate;
      }
      persistedRefreshToken = refreshToken;
    });

    const firstRotation = useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      'refresh-0'
    );
    const secondRotation = useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'access-2', refreshToken: 'refresh-2' },
      'refresh-1'
    );

    try {
      await vi.waitFor(() => {
        expect(useAuthStore.getState().refreshToken).toBe('refresh-2');
      });
      expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
      expect(persistedRefreshToken).toBe('refresh-0');
    } finally {
      releaseFirstWrite();
      await Promise.all([firstRotation, secondRotation]);
    }

    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(2);
    expect(persistedRefreshToken).toBe('refresh-2');
  });

  it('queues logout deletion after a pending refresh write so disk ends empty', async () => {
    useAuthStore.setState({
      accessToken: 'access-0',
      refreshToken: 'refresh-0',
      isRestoring: false,
      sessionRevision: 3
    });
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    let persistedRefreshToken: string | null = 'refresh-0';
    let releaseRefreshWrite!: () => void;
    const refreshWriteGate = new Promise<void>((resolve) => {
      releaseRefreshWrite = resolve;
    });
    secureStore.setItemAsync.mockImplementation(async (_key, refreshToken: string) => {
      await refreshWriteGate;
      persistedRefreshToken = refreshToken;
    });
    secureStore.deleteItemAsync.mockImplementation(async () => {
      persistedRefreshToken = null;
    });

    const rotation = useAuthStore.getState().acceptRefreshedTokens(
      { accessToken: 'access-1', refreshToken: 'refresh-1' },
      'refresh-0'
    );
    const logout = useAuthStore.getState().logout();

    try {
      await vi.waitFor(() => expect(authApi.logout).toHaveBeenCalled());
      await Promise.resolve();
      expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        isTerminating: true,
        sessionRevision: 3
      });
    } finally {
      releaseRefreshWrite();
      await Promise.all([rotation, logout]);
    }

    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(secureStore.deleteItemAsync).toHaveBeenCalledTimes(1);
    expect(persistedRefreshToken).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isTerminating: false,
      sessionRevision: 4
    });
  });

  it('keeps tokens visible until logout retires the active user scope', async () => {
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      isRestoring: false,
      sessionRevision: 4
    });
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    let releaseRetirement!: () => void;
    vi.spyOn(activeUserScopeCoordinator, 'retire').mockReturnValue(
      new Promise<void>((resolve) => {
        releaseRetirement = resolve;
      })
    );

    const logout = useAuthStore.getState().logout();
    await Promise.resolve();
    await Promise.resolve();

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      sessionRevision: 4,
      isTerminating: true
    });
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();

    releaseRetirement();
    await logout;

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      sessionRevision: 5
    });
  });

  it('opens the terminal gate synchronously and clears on a macrotask after retirement', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: null,
      isRestoring: false,
      sessionRevision: 2,
      isTerminating: false
    });
    const retireSpy = vi
      .spyOn(activeUserScopeCoordinator, 'retire')
      .mockResolvedValue(undefined);

    useAuthStore.getState().requestTerminalSessionClear();
    useAuthStore.getState().requestTerminalSessionClear();

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'session-access',
      isTerminating: true,
      sessionRevision: 2
    });
    expect(retireSpy).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(retireSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isTerminating: false,
      sessionRevision: 3
    });
    vi.useRealTimers();
  });

  it('still clears local auth state when backend logout revocation fails', async () => {
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      isRestoring: false
    });
    vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('network down'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(authApi.logout).toHaveBeenCalledWith('session-refresh', expect.anything());
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('still clears local auth state when secure storage deletion fails during logout', async () => {
    useAuthStore.setState({
      accessToken: 'session-access',
      refreshToken: 'session-refresh',
      isRestoring: true
    });
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined);
    secureStore.deleteItemAsync.mockRejectedValue(new Error('secure store unavailable'));

    await expect(useAuthStore.getState().logout()).resolves.toBeUndefined();

    expect(authApi.logout).toHaveBeenCalledWith('session-refresh', expect.anything());
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false
    });
  });

  it('aborts a hung logout revocation and continues cleanup after five seconds', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({
        accessToken: 'session-access',
        refreshToken: 'session-refresh',
        isRestoring: false,
        sessionRevision: 6,
        isTerminating: false
      });
      let logoutSignal: AbortSignal | undefined;
      let rejectLateRevocation!: (error: Error) => void;
      const lateRevocation = new Promise<void>((_resolve, reject) => {
        rejectLateRevocation = reject;
      });
      vi.spyOn(authApi, 'logout').mockImplementation(
        async (_refreshToken, signal?: AbortSignal) => {
          logoutSignal = signal;
          await lateRevocation;
        }
      );
      const retireSpy = vi
        .spyOn(activeUserScopeCoordinator, 'retire')
        .mockResolvedValue(undefined);
      let settled = false;

      const logout = useAuthStore.getState().logout();
      void logout.then(() => {
        settled = true;
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(authApi.logout).toHaveBeenCalledWith(
        'session-refresh',
        expect.anything()
      );
      expect(settled).toBe(false);
      expect(retireSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      expect(retireSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(logoutSignal?.aborted).toBe(true);
      expect(retireSpy).toHaveBeenCalledTimes(1);
      expect(settled).toBe(true);
      await logout;
      expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
        'easyMeditation.refreshToken'
      );
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: null,
        refreshToken: null,
        isTerminating: false,
        sessionRevision: 7
      });
      rejectLateRevocation(new Error('aborted revoke rejected late'));
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      vi.useRealTimers();
    }
  });
});
