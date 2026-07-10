import { beforeEach, describe, expect, it, vi } from 'vitest';

const expoConstants = vi.hoisted(() => ({
  expoConfig: null as { hostUri?: string | null; debuggerHost?: string | null } | null,
  manifest2: null as { extra?: { expoGo?: { debuggerHost?: string | null } } } | null
}));

const platformMock = vi.hoisted(() => ({
  OS: 'ios' as 'ios' | 'android' | 'web'
}));

const secureStore = vi.hoisted(() => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock('expo-secure-store', () => ({
  setItemAsync: secureStore.setItemAsync,
  getItemAsync: secureStore.getItemAsync,
  deleteItemAsync: secureStore.deleteItemAsync
}));

vi.mock('expo-constants', () => ({
  default: expoConstants
}));

vi.mock('react-native', () => ({
  Platform: platformMock
}));

import { useAuthStore } from '../store/authStore';
import { apiRequest, resolveApiBaseUrl } from './client';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secureStore.setItemAsync.mockReset();
    secureStore.getItemAsync.mockReset();
    secureStore.deleteItemAsync.mockReset();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expoConstants.expoConfig = null;
    expoConstants.manifest2 = null;
    platformMock.OS = 'ios';
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: null,
      isRestoring: false,
      restoreError: null,
      pendingRestoreTokens: null,
      sessionRevision: 0,
      isTerminating: false
    });
  });

  it('adds json and authorization headers by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true }, error: null })
    });

    vi.stubGlobal('fetch', fetchMock);

    await apiRequest<{ ok: boolean }>('/me');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/me',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    );

    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(requestHeaders).toBeInstanceOf(Headers);
    expect((requestHeaders as Headers).get('content-type')).toBe('application/json');
    expect((requestHeaders as Headers).get('authorization')).toBe('Bearer access-token');
  });

  it('omits authorization when skipAuth is enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { ok: true }, error: null })
    });

    vi.stubGlobal('fetch', fetchMock);

    await apiRequest<{ ok: boolean }>('/auth/login', { skipAuth: true, method: 'POST' });

    const requestHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(requestHeaders.get('authorization')).toBeNull();
  });

  it('throws a structured error from an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: '邮箱或密码不正确。',
            fields: { email: 'NOT_FOUND' }
          }
        })
      })
    );

    await expect(apiRequest('/auth/login', { skipAuth: true })).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码不正确。',
      fields: { email: 'NOT_FOUND' }
    });
  });

  it('refreshes an expired access token and retries the authenticated request once', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'refresh-token',
      isRestoring: false
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Access token expired.' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { accessToken: 'fresh-access', refreshToken: 'rotated-refresh' },
          error: null
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { email: 'person@example.com' }, error: null })
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest<{ email: string }>('/me')).resolves.toEqual({
      email: 'person@example.com'
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:4000/auth/refresh');
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'refresh-token' })
      })
    );
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('authorization')).toBe(
      'Bearer expired-access'
    );
    expect((fetchMock.mock.calls[1]?.[1]?.headers as Headers).get('authorization')).toBeNull();
    expect((fetchMock.mock.calls[2]?.[1]?.headers as Headers).get('authorization')).toBe(
      'Bearer fresh-access'
    );
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'rotated-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh'
    });
  });

  it('opens the terminal gate when refresh is invalid and clears on a macrotask', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'stale-refresh',
      isRestoring: false
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Access token expired.' }
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
        })
      });

    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/me')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'INVALID_REFRESH_TOKEN'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'expired-access',
      refreshToken: 'stale-refresh',
      isTerminating: true
    });

    await vi.runAllTimersAsync();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('easyMeditation.refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isRestoring: false,
      isTerminating: false,
      sessionRevision: 1
    });
    vi.useRealTimers();
  });

  it('opens the terminal gate synchronously when a protected 401 has no refresh token', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: null,
      isRestoring: false,
      isTerminating: false
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Access token expired.' }
        })
      })
    );

    const request = apiRequest('/stats/summary');
    await expect(request).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'expired-access',
      isTerminating: true
    });
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(useAuthStore.getState().accessToken).toBeNull();
    vi.useRealTimers();
  });

  it('throws the retry 401 before terminal cleanup retires the user query', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'refresh-token',
      isRestoring: false,
      isTerminating: false
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Expired.' }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: { accessToken: 'fresh-access', refreshToken: 'rotated-refresh' },
          error: null
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'Still unauthorized.' }
        })
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/stats/summary')).rejects.toMatchObject({
      status: 401,
      message: 'Still unauthorized.'
    });

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
      isTerminating: true
    });
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      isTerminating: false
    });
    vi.useRealTimers();
  });

  it('does not refresh or replay an A request whose first 401 arrives after B signs in', async () => {
    useAuthStore.setState({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      sessionRevision: 4,
      isTerminating: false
    });
    const firstResponse = deferred<{
      ok: boolean;
      status: number;
      json(): Promise<{
        data: null;
        error: { code: string; message: string };
      }>;
    }>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse.promise)
      .mockRejectedValue(new Error('must not fetch across sessions'));
    vi.stubGlobal('fetch', fetchMock);

    const request = apiRequest('/practice-sessions', {
      method: 'POST',
      body: JSON.stringify({ owner: 'A' })
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    useAuthStore.setState({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      sessionRevision: 5,
      isTerminating: false
    });
    firstResponse.resolve({
      ok: false,
      status: 401,
      json: async () => ({
        data: null,
        error: { code: 'UNAUTHORIZED', message: 'A expired.' }
      })
    });

    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'A expired.'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      sessionRevision: 5,
      isTerminating: false
    });
  });

  it('does not terminal-clear B when A retry returns 401 after the session changes', async () => {
    vi.useFakeTimers();
    try {
      useAuthStore.setState({
        accessToken: 'expired-a',
        refreshToken: 'refresh-a',
        sessionRevision: 8,
        isTerminating: false
      });
      const retryResponse = deferred<{
        ok: boolean;
        status: number;
        json(): Promise<{
          data: null;
          error: { code: string; message: string };
        }>;
      }>();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            data: null,
            error: { code: 'UNAUTHORIZED', message: 'A expired.' }
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            data: { accessToken: 'fresh-a', refreshToken: 'rotated-a' },
            error: null
          })
        })
        .mockReturnValueOnce(retryResponse.promise);
      vi.stubGlobal('fetch', fetchMock);

      const request = apiRequest('/practice-sessions', {
        method: 'POST',
        body: JSON.stringify({ owner: 'A' })
      });
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

      useAuthStore.setState({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        sessionRevision: 9,
        isTerminating: false
      });
      retryResponse.resolve({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'A retry rejected.' }
        })
      });

      await expect(request).rejects.toMatchObject({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'A retry rejected.'
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        sessionRevision: 9,
        isTerminating: false
      });
    } finally {
      await vi.runAllTimersAsync();
      vi.useRealTimers();
    }
  });

  it('does not return B as a stale-token fallback when A refresh fails after revision change', async () => {
    useAuthStore.setState({
      accessToken: 'expired-a',
      refreshToken: 'refresh-a',
      sessionRevision: 12,
      isTerminating: false
    });
    const refreshResponse = deferred<{
      ok: boolean;
      status: number;
      json(): Promise<{
        data: null;
        error: { code: string; message: string };
      }>;
    }>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          data: null,
          error: { code: 'UNAUTHORIZED', message: 'A expired.' }
        })
      })
      .mockReturnValueOnce(refreshResponse.promise)
      .mockRejectedValue(new Error('must not retry A with B tokens'));
    vi.stubGlobal('fetch', fetchMock);

    const request = apiRequest('/me');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    useAuthStore.setState({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      sessionRevision: 13,
      isTerminating: false
    });
    refreshResponse.resolve({
      ok: false,
      status: 401,
      json: async () => ({
        data: null,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'A refresh is stale.'
        }
      })
    });

    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_CHANGED'
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-b',
      refreshToken: 'refresh-b',
      sessionRevision: 13,
      isTerminating: false
    });
  });

  it('shares a single refresh rotation across concurrent authenticated 401s', async () => {
    useAuthStore.setState({
      accessToken: 'expired-access',
      refreshToken: 'refresh-token',
      isRestoring: false
    });

    let refreshCalls = 0;
    let meCalls = 0;
    let releaseRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const authHeader = (init?.headers as Headers | undefined)?.get('authorization');

      if (input === 'http://127.0.0.1:4000/me') {
        meCalls += 1;
        const requestNumber = meCalls;
        if (authHeader === 'Bearer expired-access') {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              data: null,
              error: { code: 'UNAUTHORIZED', message: 'Access token expired.' }
            })
          };
        }

        if (authHeader === 'Bearer fresh-access') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: { email: `person${requestNumber}@example.com` },
              error: null
            })
          };
        }
      }

      if (input === 'http://127.0.0.1:4000/auth/refresh') {
        refreshCalls += 1;

        if (refreshCalls === 1) {
          await refreshGate;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: { accessToken: 'fresh-access', refreshToken: 'rotated-refresh' },
              error: null
            })
          };
        }

        return {
          ok: false,
          status: 401,
          json: async () => ({
            data: null,
            error: { code: 'INVALID_REFRESH_TOKEN', message: 'Please log in again.' }
          })
        };
      }

      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const firstRequest = apiRequest<{ email: string }>('/me');
    const secondRequest = apiRequest<{ email: string }>('/me');

    await Promise.resolve();
    await Promise.resolve();
    releaseRefresh();

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { email: 'person3@example.com' },
      { email: 'person4@example.com' }
    ]);

    expect(refreshCalls).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'easyMeditation.refreshToken',
      'rotated-refresh'
    );
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
      isRestoring: false
    });
  });

  it('prefers EXPO_PUBLIC_API_BASE_URL when provided', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.com';
    platformMock.OS = 'android';

    expect(resolveApiBaseUrl()).toBe('https://api.example.com');
  });

  it('derives the dev API host from Expo host metadata when available', () => {
    platformMock.OS = 'android';
    expoConstants.expoConfig = { hostUri: '192.168.1.25:8081' };

    expect(resolveApiBaseUrl()).toBe('http://192.168.1.25:4000');
  });

  it('uses the Android emulator loopback when no env or Expo host is available', () => {
    platformMock.OS = 'android';

    expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:4000');
  });
});
