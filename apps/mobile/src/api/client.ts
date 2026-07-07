import { useAuthStore } from '../store/authStore';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000';

export type ApiRequestOptions = RequestInit & {
  skipAuth?: boolean;
};

type ApiEnvelope<T> = {
  data: T | null;
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  } | null;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');

  const token = useAuthStore.getState().accessToken;
  if (token && !options.skipAuth) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.error || body.data === null) {
    throw new Error(body.error?.message ?? '请求失败，请稍后再试。');
  }

  return body.data;
}
