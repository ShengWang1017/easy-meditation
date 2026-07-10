import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StateStorage } from 'zustand/middleware';

import { AuthSessionProvider } from '../auth/AuthSessionBoundary';
import { publicQueryKeys, userQueryKeys } from '../query/keys';
import type { SessionOutbox } from '../services/sessionOutbox';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../store/preferencesStore';
import { VisualQaReporter } from './VisualQaReporter';
import {
  resolveVisualQaFixture,
  type ResolvedVisualQaFixture
} from './visualQa';
import {
  createVisualQaSessionOverride,
  VisualQaSessionOverrideProvider,
  type VisualQaSessionOverride
} from './visualQaSession';

export type VisualQaFixtureRuntimeValue = {
  state: ResolvedVisualQaFixture['id'];
  now: ResolvedVisualQaFixture['now'];
  authScope: ResolvedVisualQaFixture['authScope'];
};

const VisualQaFixtureRuntimeContext =
  createContext<VisualQaFixtureRuntimeValue | null>(null);

export function useVisualQaFixtureRuntime(): VisualQaFixtureRuntimeValue {
  const value = useOptionalVisualQaFixtureRuntime();
  if (!value) {
    throw new Error(
      'useVisualQaFixtureRuntime must be used inside an active visual QA fixture'
    );
  }
  return value;
}

export function useOptionalVisualQaFixtureRuntime(): VisualQaFixtureRuntimeValue | null {
  return useContext(VisualQaFixtureRuntimeContext);
}

export function VisualQaFixtureBoundary({
  children,
  dev,
  fallback,
  pathname,
  requested,
  state
}: {
  children(fixture: ResolvedVisualQaFixture): ReactNode;
  dev: boolean;
  fallback: ReactNode;
  pathname: string;
  requested: boolean;
  state: unknown;
}) {
  const fixture = resolveVisualQaFixture({ dev, requested, state });
  if (!fixture || pathname !== pathnameForRoute(fixture.route)) return fallback;

  return (
    <VisualQaRuntime key={fixture.id} fixture={fixture}>
      {children(fixture)}
    </VisualQaRuntime>
  );
}

function pathnameForRoute(route: ResolvedVisualQaFixture['route']): string {
  return route.replace(/^\/\([^/]+\)/, '');
}

function VisualQaRuntime({
  children,
  fixture
}: {
  children: ReactNode;
  fixture: ResolvedVisualQaFixture;
}) {
  const runtimeValue = useMemo<VisualQaFixtureRuntimeValue>(
    () => ({
      state: fixture.id,
      now: fixture.now,
      authScope: fixture.authScope
    }),
    [fixture.authScope, fixture.id, fixture.now]
  );

  if (fixture.authScope === 'unauthenticated') {
    return (
      <VisualQaFixtureRuntimeContext.Provider value={runtimeValue}>
        <VisualQaReporter enabled state={fixture.id}>
          {children}
        </VisualQaReporter>
      </VisualQaFixtureRuntimeContext.Provider>
    );
  }

  return (
    <AuthenticatedVisualQaRuntime fixture={fixture} runtimeValue={runtimeValue}>
      {children}
    </AuthenticatedVisualQaRuntime>
  );
}

type VisualQaResources = {
  queryClient: QueryClient;
  preferencesStore: UserPreferencesStore;
  sessionOutbox: SessionOutbox;
  sessionOverride: VisualQaSessionOverride | null;
};

function AuthenticatedVisualQaRuntime({
  children,
  fixture,
  runtimeValue
}: {
  children: ReactNode;
  fixture: ResolvedVisualQaFixture;
  runtimeValue: VisualQaFixtureRuntimeValue;
}) {
  const [resources] = useState(() => createVisualQaResources(fixture));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hydrateUserPreferencesStore(resources.preferencesStore).then(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
      resources.queryClient.clear();
    };
  }, [resources]);

  if (!hydrated) return null;

  const session = {
    user: fixture.api.me,
    userId: fixture.api.me.id,
    preferencesStore: resources.preferencesStore,
    sessionOutbox: resources.sessionOutbox
  };

  return (
    <VisualQaFixtureRuntimeContext.Provider value={runtimeValue}>
      <QueryClientProvider client={resources.queryClient}>
        <AuthSessionProvider value={session}>
          <VisualQaSessionOverrideProvider value={resources.sessionOverride}>
            <VisualQaReporter enabled state={fixture.id}>
              {children}
            </VisualQaReporter>
          </VisualQaSessionOverrideProvider>
        </AuthSessionProvider>
      </QueryClientProvider>
    </VisualQaFixtureRuntimeContext.Provider>
  );
}

function createVisualQaResources(
  fixture: ResolvedVisualQaFixture
): VisualQaResources {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        staleTime: Infinity,
        retry: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false
      },
      mutations: { retry: false }
    }
  });
  queryClient.setQueryData(publicQueryKeys.methods, fixture.api.methods);
  queryClient.setQueryData(
    userQueryKeys.stats(fixture.api.me.id),
    fixture.stats
  );
  queryClient.setQueryData(
    userQueryKeys.sessions(fixture.api.me.id),
    fixture.sessions
  );

  const preferences = {
    customRhythm: fixture.preferences.customRhythm,
    durationOverrides: fixture.preferences.durationOverrides,
    soundEnabled: fixture.preferences.soundEnabled,
    beforeStartDismissed: fixture.preferences.beforeStartDismissed,
    localSessionLedger:
      fixture.id === 'records-empty'
        ? []
        : fixture.preferences.localSessionLedger
  };
  const storage = createMemoryStorage({
    [fixture.preferences.storageKey]: JSON.stringify({
      state: preferences,
      version: 0
    })
  });
  const preferencesStore = createUserPreferencesStore(
    fixture.api.me.id,
    storage
  );
  const noOpAsync = async () => undefined;
  const sessionOutbox: SessionOutbox = {
    submit: noOpAsync,
    drainDue: noOpAsync,
    retryNow: noOpAsync
  };
  const boxMethod = fixture.api.methods.find(({ id }) => id === 'box');
  const sessionOverride =
    fixture.session && boxMethod
      ? createVisualQaSessionOverride({
          snapshot: fixture.session,
          phases: boxMethod.phases
        })
      : null;

  return {
    queryClient,
    preferencesStore,
    sessionOutbox,
    sessionOverride
  };
}

function createMemoryStorage(initial: Record<string, string>): StateStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem(name) {
      return values.get(name) ?? null;
    },
    setItem(name, value) {
      values.set(name, value);
    },
    removeItem(name) {
      values.delete(name);
    }
  };
}
