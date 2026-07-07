import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

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

type ExpoConfigWithDevHost = {
  hostUri?: string | null;
  debuggerHost?: string | null;
};

function getExpoHost(): string | null {
  const expoConfig = Constants.expoConfig as ExpoConfigWithDevHost | null;
  const hostUri = expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0] ?? null;
  }

  const debuggerHost = expoConfig?.debuggerHost ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    return debuggerHost.split(':')[0] ?? null;
  }

  return null;
}

export function resolveApiBaseUrl(): string {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:4000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  return 'http://127.0.0.1:4000';
}

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

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers
  });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.error || body.data === null) {
    throw new Error(body.error?.message ?? '请求失败，请稍后再试。');
  }

  return body.data;
}
