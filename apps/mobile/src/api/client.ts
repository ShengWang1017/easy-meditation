import type { TokenPair } from '@easy-meditation/shared';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { REFRESH_TOKEN_KEY, useAuthStore } from '../store/authStore';

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

type ApiRequestErrorOptions = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
};

const GENERIC_REQUEST_ERROR_MESSAGE = '请求失败，请稍后再试。';

export class ApiRequestError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor({ status, code, message, fields }: ApiRequestErrorOptions) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

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

function buildHeaders(options: ApiRequestOptions, accessToken: string | null): Headers {
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');

  if (accessToken && !options.skipAuth) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

async function sendApiRequest<T>(
  path: string,
  options: ApiRequestOptions,
  accessToken: string | null
): Promise<{ response: Response; body: ApiEnvelope<T> }> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...options,
    headers: buildHeaders(options, accessToken)
  });
  const body = (await response.json()) as ApiEnvelope<T>;

  return { response, body };
}

function toApiRequestError<T>(response: Response, body: ApiEnvelope<T>): ApiRequestError | null {
  if (!body.error) {
    return null;
  }

  return new ApiRequestError({
    status: response.status,
    code: body.error.code,
    message: body.error.message,
    fields: body.error.fields
  });
}

async function clearAuthState(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Best-effort secure storage cleanup: clear local state even if deletion fails.
  }

  useAuthStore.setState({
    accessToken: null,
    refreshToken: null,
    isRestoring: false
  });
}

async function storeTokenPair(tokens: TokenPair): Promise<void> {
  useAuthStore.setState({
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
}

async function refreshTokenPair(refreshToken: string): Promise<TokenPair> {
  const response = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: buildHeaders({ skipAuth: true }, null),
    body: JSON.stringify({ refreshToken })
  });
  const body = (await response.json()) as ApiEnvelope<TokenPair>;
  const error = toApiRequestError(response, body);

  if (error) {
    if (error.status === 401 && error.code === 'INVALID_REFRESH_TOKEN') {
      await clearAuthState();
    }

    throw error;
  }

  if (!response.ok || body.data === null) {
    throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
  }

  await storeTokenPair(body.data);
  return body.data;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const first = await sendApiRequest<T>(path, options, useAuthStore.getState().accessToken);
  const firstError = toApiRequestError(first.response, first.body);

  if (firstError?.status === 401 && !options.skipAuth) {
    const refreshToken = useAuthStore.getState().refreshToken;
    if (refreshToken) {
      const tokens = await refreshTokenPair(refreshToken);
      const retry = await sendApiRequest<T>(path, options, tokens.accessToken);
      const retryError = toApiRequestError(retry.response, retry.body);

      if (retryError) {
        throw retryError;
      }

      if (!retry.response.ok || retry.body.data === null) {
        throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
      }

      return retry.body.data;
    }
  }

  if (firstError) {
    throw firstError;
  }

  if (!first.response.ok || first.body.data === null) {
    throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
  }

  return first.body.data;
}
