import type { AuthLoginInput, AuthRegisterInput, Me, TokenPair } from '@easy-meditation/shared';
import { apiRequest } from './client';

export async function login(input: AuthLoginInput): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(input)
  });
}

export async function register(input: AuthRegisterInput): Promise<{ user: Me; tokens: TokenPair }> {
  return apiRequest<{ user: Me; tokens: TokenPair }>('/auth/register', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(input)
  });
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  return apiRequest<TokenPair>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ refreshToken })
  });
}

export async function logout(refreshToken: string): Promise<void> {
  await apiRequest<{ ok: true }>('/auth/logout', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ refreshToken })
  });
}

export async function getMe(): Promise<Me> {
  return apiRequest<Me>('/me');
}
