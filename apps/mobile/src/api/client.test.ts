import { beforeEach, describe, expect, it, vi } from 'vitest';

const expoConstants = vi.hoisted(() => ({
  expoConfig: null as { hostUri?: string | null; debuggerHost?: string | null } | null,
  manifest2: null as { extra?: { expoGo?: { debuggerHost?: string | null } } } | null
}));

const platformMock = vi.hoisted(() => ({
  OS: 'ios' as 'ios' | 'android' | 'web'
}));

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

vi.mock('expo-constants', () => ({
  default: expoConstants
}));

vi.mock('react-native', () => ({
  Platform: platformMock
}));

import { useAuthStore } from '../store/authStore';
import { apiRequest, resolveApiBaseUrl } from './client';

describe('apiRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expoConstants.expoConfig = null;
    expoConstants.manifest2 = null;
    platformMock.OS = 'ios';
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: null,
      isRestoring: false
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

    await expect(apiRequest('/auth/login')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码不正确。',
      fields: { email: 'NOT_FOUND' }
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
