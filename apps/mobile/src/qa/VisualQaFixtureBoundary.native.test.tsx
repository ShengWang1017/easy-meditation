import React, { useEffect } from 'react';
import { jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BreathingMethod,
  PracticeSession,
  StatsSummary
} from '@easy-meditation/shared';
import {
  useQuery,
  useQueryClient,
  type QueryClient
} from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    const breathingPhaseSchema = z.object({
      kind: z.enum(['inhale', 'hold', 'exhale']),
      label: z.string().min(1),
      durationSeconds: z.number().int().min(1).max(60)
    });
    const practiceSessionCreateSchema = z.object({
      clientSessionId: z.string().uuid(),
      methodType: z.enum(['built_in', 'custom']),
      methodId: z.string().min(1).nullable(),
      customRhythmId: z.string().uuid().nullable(),
      methodTitleSnapshot: z.string().min(1),
      rhythmSnapshot: z.array(breathingPhaseSchema).min(1),
      plannedDurationSeconds: z.number().int().min(1),
      actualDurationSeconds: z.number().int().min(1),
      completed: z.boolean(),
      startedAt: z.string().datetime(),
      endedAt: z.string().datetime()
    });
    const practiceSessionSchema = practiceSessionCreateSchema.extend({
      id: z.string().uuid(),
      createdAt: z.string()
    });
    return {
      breathingMethodSchema: z.object({
        id: z.string().min(1),
        slug: z.string().min(1),
        title: z.string().min(1),
        subtitle: z.string().min(1),
        category: z.enum(['classic', 'system']),
        defaultDurationSeconds: z.number().int().min(60),
        phases: z.array(breathingPhaseSchema).min(1),
        sortOrder: z.number().int(),
        isActive: z.boolean()
      }),
      meSchema: z.object({
        id: z.string().uuid(),
        email: z.string().email(),
        nickname: z.string().nullable(),
        createdAt: z.string()
      }),
      practiceSessionCreateSchema,
      practiceSessionSchema,
      statsSummarySchema: z.object({
        totalSessions: z.number().int().min(0),
        totalPracticeSeconds: z.number().int().min(0),
        weeklyPracticeSeconds: z.number().int().min(0),
        currentStreak: z.number().int().min(0),
        recentSessions: z.array(practiceSessionSchema).max(10)
      })
    };
  },
  { virtual: true }
);

jest.mock('./VisualQaReporter', () => ({
  VisualQaReporter: ({ children }: { children: React.ReactNode }) => children
}));

import { useAuthSession } from '../auth/AuthSessionBoundary';
import { publicQueryKeys, userQueryKeys } from '../query/keys';
import { usePreferencesStore } from '../store/PreferencesStoreProvider';
import type { UserPreferencesStore } from '../store/preferencesStore';
import {
  VisualQaFixtureBoundary,
  useVisualQaFixtureRuntime,
  type VisualQaFixtureRuntimeValue
} from './VisualQaFixtureBoundary';
import type { VisualQaState } from './visualQaContract';
import { createTestQueryClient, renderWithProviders } from '../test/renderWithProviders';
import type { SessionOutbox } from '../services/sessionOutbox';

type CapturedRuntime = {
  fixture: VisualQaFixtureRuntimeValue;
  queryClient: QueryClient;
  preferencesStore: UserPreferencesStore;
  outbox: SessionOutbox;
  methods: BreathingMethod[] | undefined;
  stats: StatsSummary | undefined;
  sessions: PracticeSession[] | undefined;
};

const networkQuery = jest.fn(async () => {
  throw new Error('visual QA queries must never reach the network');
});

function RuntimeProbe({ onReady }: { onReady(value: CapturedRuntime): void }) {
  const fixture = useVisualQaFixtureRuntime();
  const session = useAuthSession();
  const queryClient = useQueryClient();
  const soundEnabled = usePreferencesStore((state) => state.soundEnabled);
  const methods = useQuery({
    queryKey: publicQueryKeys.methods,
    queryFn: networkQuery
  }).data as BreathingMethod[] | undefined;
  const stats = useQuery({
    queryKey: userQueryKeys.stats(session.userId),
    queryFn: networkQuery
  }).data as StatsSummary | undefined;
  const sessions = useQuery({
    queryKey: userQueryKeys.sessions(session.userId),
    queryFn: networkQuery
  }).data as PracticeSession[] | undefined;

  useEffect(() => {
    onReady({
      fixture,
      queryClient,
      preferencesStore: session.preferencesStore,
      outbox: session.sessionOutbox,
      methods,
      stats,
      sessions
    });
  }, [fixture, methods, onReady, queryClient, session, sessions, stats]);

  return (
    <Text testID="qa-runtime">
      {fixture.state}:{soundEnabled ? 'sound-on' : 'sound-off'}
    </Text>
  );
}

function BoundaryHarness({
  dev = true,
  pathname,
  requested = true,
  state,
  onReady,
  renderFixture
}: {
  dev?: boolean;
  pathname?: string;
  requested?: boolean;
  state: unknown;
  onReady?: (value: CapturedRuntime) => void;
  renderFixture?: jest.Mock;
}) {
  return (
    <VisualQaFixtureBoundary
      dev={dev}
      fallback={<Text testID="normal-runtime">normal</Text>}
      pathname={pathname ?? pathnameForState(state)}
      requested={requested}
      state={state}
    >
      {(fixture) => {
        renderFixture?.(fixture);
        return fixture.authScope === 'authenticated' && onReady ? (
          <RuntimeProbe onReady={onReady} />
        ) : (
          <Text testID="unauth-runtime">{fixture.authScope}</Text>
        );
      }}
    </VisualQaFixtureBoundary>
  );
}

function pathnameForState(state: unknown): string {
  if (state === 'login') return '/login';
  if (state === 'register') return '/register';
  if (state === 'guide') return '/guide';
  if (state === 'custom') return '/custom-rhythm';
  if (typeof state === 'string' && state.startsWith('session-')) {
    return '/session/box';
  }
  if (state === 'records-empty' || state === 'records-populated') {
    return '/records';
  }
  return '/practice';
}

describe('VisualQaFixtureBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    networkQuery.mockClear();
  });

  it('returns the normal tree before touching fixture state in production', () => {
    const renderFixture = jest.fn();
    const view = renderWithProviders(
      <BoundaryHarness
        dev={false}
        renderFixture={renderFixture}
        state="practice"
      />
    );

    expect(view.getByTestId('normal-runtime')).toBeTruthy();
    expect(renderFixture).not.toHaveBeenCalled();
    expect(networkQuery).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    { requested: false, state: 'practice' },
    { requested: true, state: 'unknown-state' }
  ])('keeps the normal path for an inactive request %#', ({ requested, state }) => {
    const view = renderWithProviders(
      <BoundaryHarness requested={requested} state={state} />
    );
    expect(view.getByTestId('normal-runtime')).toBeTruthy();
  });

  it('fails closed when a valid fixture state is requested on another route', () => {
    const renderFixture = jest.fn();
    const view = renderWithProviders(
      <BoundaryHarness
        pathname="/records"
        renderFixture={renderFixture}
        state="practice"
      />
    );

    expect(view.getByTestId('normal-runtime')).toBeTruthy();
    expect(renderFixture).not.toHaveBeenCalled();
  });

  it('hydrates an isolated memory scope and seeds authenticated query data', async () => {
    const outerQueryClient = createTestQueryClient();
    let captured: CapturedRuntime | undefined;
    const view = renderWithProviders(
      <BoundaryHarness
        onReady={(value) => {
          captured = value;
        }}
        state="practice"
      />,
      { queryClient: outerQueryClient }
    );

    await waitFor(() => expect(view.getByTestId('qa-runtime')).toBeTruthy());
    expect(captured).toBeDefined();
    expect(captured!.queryClient).not.toBe(outerQueryClient);
    expect(captured!.fixture.now).toBe('2026-07-10T12:00:00+08:00');
    expect(captured!.fixture.state).toBe('practice');
    expect(captured!.methods?.map(({ id }) => id)).toEqual([
      'box',
      'four-seven-eight',
      'coherent'
    ]);
    expect(captured!.stats?.totalSessions).toBe(1);
    expect(captured!.sessions).toHaveLength(1);
    expect(captured!.preferencesStore.persist.hasHydrated()).toBe(true);
    expect(captured!.preferencesStore.getState()).toMatchObject({
      customRhythm: {
        name: '自定义',
        inhaleSeconds: 4,
        holdSeconds: 2,
        exhaleSeconds: 5,
        durationMinutes: 5
      },
      durationOverrides: { box: 5 },
      soundEnabled: true,
      beforeStartDismissed: false
    });
    expect(captured!.preferencesStore.getState().localSessionLedger).toHaveLength(1);
    expect(networkQuery).not.toHaveBeenCalled();
    expect(
      captured!.queryClient.getDefaultOptions().queries
    ).toMatchObject({
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      retry: false
    });

    await act(async () => {
      await captured!.preferencesStore.getState().setSoundEnabled(false);
      await captured!.outbox.submit('never-post');
      await captured!.outbox.drainDue();
      await captured!.outbox.retryNow('never-post');
    });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(networkQuery).not.toHaveBeenCalled();
  });

  it('clears both records data and the local ledger for records-empty', async () => {
    let captured: CapturedRuntime | undefined;
    const view = renderWithProviders(
      <BoundaryHarness
        onReady={(value) => {
          captured = value;
        }}
        state="records-empty"
      />
    );

    await waitFor(() => expect(view.getByTestId('qa-runtime')).toBeTruthy());
    expect(captured!.stats?.totalSessions).toBe(0);
    expect(captured!.sessions).toEqual([]);
    expect(captured!.preferencesStore.getState().localSessionLedger).toEqual([]);
  });

  it('renders unauthenticated fixtures without creating a synthetic account scope', () => {
    const renderFixture = jest.fn();
    const view = renderWithProviders(
      <BoundaryHarness renderFixture={renderFixture} state="login" />
    );

    expect(view.getByTestId('unauth-runtime').props.children).toBe(
      'unauthenticated'
    );
    expect(renderFixture).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'login',
        authScope: 'unauthenticated'
      })
    );
    expect(networkQuery).not.toHaveBeenCalled();
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('rebuilds the isolated query and preference scope when state changes', async () => {
    const captures: CapturedRuntime[] = [];
    const onReady = (value: CapturedRuntime) => {
      if (captures.at(-1)?.fixture.state !== value.fixture.state) {
        captures.push(value);
      }
    };
    const view = renderWithProviders(
      <BoundaryHarness onReady={onReady} state="records-empty" />
    );
    await waitFor(() => expect(captures).toHaveLength(1));

    view.rerender(
      <BoundaryHarness onReady={onReady} state="records-populated" />
    );
    await waitFor(() => expect(captures).toHaveLength(2));

    expect(captures[1]!.queryClient).not.toBe(captures[0]!.queryClient);
    expect(captures[1]!.preferencesStore).not.toBe(
      captures[0]!.preferencesStore
    );
    expect(captures[0]!.stats?.totalSessions).toBe(0);
    expect(captures[1]!.stats?.totalSessions).toBe(1);
  });
});
