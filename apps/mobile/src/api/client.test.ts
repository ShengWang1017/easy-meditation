import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}));

import { useAuthStore } from '../store/authStore';
import { apiRequest } from './client';

describe('apiRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4000/me', expect.objectContaining({
      headers: expect.any(Headers)
    }));

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

  it('throws the server error message from an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          data: null,
          error: { code: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确。' }
        })
      })
    );

    await expect(apiRequest('/auth/login')).rejects.toThrow('邮箱或密码不正确。');
  });
});
