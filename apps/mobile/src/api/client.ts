import type { TokenPair } from '@easy-meditation/shared';
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

type ApiRequestErrorOptions = {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  retryAfterMs?: number;
};

type AuthSessionSnapshot = {
  sessionRevision: number;
  accessToken: string | null;
  refreshToken: string | null;
};

const GENERIC_REQUEST_ERROR_MESSAGE = '请求失败，请稍后再试。';

const inFlightRefreshes = new Map<string, Promise<TokenPair>>();

export class ApiRequestError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  retryAfterMs?: number;

  constructor({
    status,
    code,
    message,
    fields,
    retryAfterMs
  }: ApiRequestErrorOptions) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterMs = retryAfterMs;
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
    fields: body.error.fields,
    retryAfterMs: parseRetryAfterMs(response)
  });
}

function parseRetryAfterMs(response: Response): number | undefined {
  const retryAfter = response.headers?.get?.('retry-after')?.trim();
  if (!retryAfter) {
    return undefined;
  }

  if (/^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : undefined;
  }

  const retryAtMs = Date.parse(retryAfter);
  return Number.isFinite(retryAtMs)
    ? Math.max(0, retryAtMs - Date.now())
    : undefined;
}

function getCurrentTokenPair(): TokenPair | null {
  const { accessToken, refreshToken } = useAuthStore.getState();
  if (!accessToken || !refreshToken) {
    return null;
  }

  return { accessToken, refreshToken };
}

function getAuthSessionSnapshot(): AuthSessionSnapshot {
  const { sessionRevision, accessToken, refreshToken } = useAuthStore.getState();
  return { sessionRevision, accessToken, refreshToken };
}

function isSessionRevisionCurrent(sessionRevision: number): boolean {
  const current = useAuthStore.getState();
  return (
    current.sessionRevision === sessionRevision &&
    !current.isTerminating
  );
}

function sessionChangedError(): ApiRequestError {
  return new ApiRequestError({
    status: 401,
    code: 'SESSION_CHANGED',
    message: 'The authenticated session changed while the request was in flight.'
  });
}

async function runRefreshTokenPair(
  refreshToken: string,
  expectedSessionRevision: number
): Promise<TokenPair> {
  const response = await fetch(`${resolveApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: buildHeaders({ skipAuth: true }, null),
    body: JSON.stringify({ refreshToken })
  });
  const body = (await response.json()) as ApiEnvelope<TokenPair>;
  const error = toApiRequestError(response, body);

  if (!isSessionRevisionCurrent(expectedSessionRevision)) {
    throw sessionChangedError();
  }

  if (error) {
    if (error.status === 401 && error.code === 'INVALID_REFRESH_TOKEN') {
      const currentTokens = getCurrentTokenPair();
      if (currentTokens && currentTokens.refreshToken !== refreshToken) {
        return currentTokens;
      }

      useAuthStore.getState().requestTerminalSessionClear();
    }

    throw error;
  }

  if (!response.ok || body.data === null) {
    throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
  }

  const accepted = await useAuthStore
    .getState()
    .acceptRefreshedTokens(body.data, refreshToken);
  if (accepted) {
    return body.data;
  }

  const currentTokens = getCurrentTokenPair();
  if (currentTokens && currentTokens.refreshToken !== refreshToken) {
    return currentTokens;
  }

  throw new ApiRequestError({
    status: 401,
    code: 'AUTH_SESSION_TERMINATING',
    message: 'The authenticated session is ending.'
  });
}

async function refreshTokenPair(
  refreshToken: string,
  expectedSessionRevision: number
): Promise<TokenPair> {
  const refreshKey = `${expectedSessionRevision}\u0000${refreshToken}`;
  const inFlightRefresh = inFlightRefreshes.get(refreshKey);
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  const refreshPromise = runRefreshTokenPair(
    refreshToken,
    expectedSessionRevision
  ).finally(() => {
    if (inFlightRefreshes.get(refreshKey) === refreshPromise) {
      inFlightRefreshes.delete(refreshKey);
    }
  });

  inFlightRefreshes.set(refreshKey, refreshPromise);
  return refreshPromise;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const initialSession = getAuthSessionSnapshot();
  const first = await sendApiRequest<T>(path, options, initialSession.accessToken);
  const firstError = toApiRequestError(first.response, first.body);

  if (
    !options.skipAuth &&
    !isSessionRevisionCurrent(initialSession.sessionRevision)
  ) {
    if (firstError) {
      throw firstError;
    }
    throw sessionChangedError();
  }

  if (firstError?.status === 401 && !options.skipAuth) {
    const refreshToken = initialSession.refreshToken;
    if (refreshToken) {
      const tokens = await refreshTokenPair(
        refreshToken,
        initialSession.sessionRevision
      );
      if (!isSessionRevisionCurrent(initialSession.sessionRevision)) {
        throw sessionChangedError();
      }
      const retry = await sendApiRequest<T>(path, options, tokens.accessToken);
      const retryError = toApiRequestError(retry.response, retry.body);

      if (!isSessionRevisionCurrent(initialSession.sessionRevision)) {
        if (retryError) {
          throw retryError;
        }
        throw sessionChangedError();
      }

      if (retryError) {
        if (retryError.status === 401) {
          useAuthStore.getState().requestTerminalSessionClear();
        }
        throw retryError;
      }

      if (!retry.response.ok || retry.body.data === null) {
        throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
      }

      return retry.body.data;
    }

    useAuthStore.getState().requestTerminalSessionClear();
  }

  if (firstError) {
    throw firstError;
  }

  if (!first.response.ok || first.body.data === null) {
    throw new Error(GENERIC_REQUEST_ERROR_MESSAGE);
  }

  return first.body.data;
}
