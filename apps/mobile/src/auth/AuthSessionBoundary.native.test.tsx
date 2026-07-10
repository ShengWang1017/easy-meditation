import React from 'react';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRouterState: {
  segments: string[];
  renderSlot: () => React.ReactElement;
} = {
  segments: ['(auth)'],
  renderSlot: () => <Text testID="root-slot">slot</Text>
};
const mockNativeSecureStore = {
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined)
};
const mockSessionOutbox = {
  submit: jest.fn(async (): Promise<void> => undefined),
  drainDue: jest.fn(async (): Promise<void> => undefined),
  retryNow: jest.fn(async (): Promise<void> => undefined)
};

jest.mock(
  '@easy-meditation/shared',
  () => {
    const { z } = jest.requireActual<typeof import('zod')>('zod');
    return {
      meSchema: z.object({
        id: z.string().uuid(),
        email: z.string().email(),
        nickname: z.string().nullable(),
        createdAt: z.string()
      })
    };
  },
  { virtual: true }
);
jest.mock('../api/auth', () => ({
  getMe: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
  register: jest.fn()
}));
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  setItemAsync: (...args: Parameters<typeof mockNativeSecureStore.setItemAsync>) =>
    mockNativeSecureStore.setItemAsync(...args),
  getItemAsync: (...args: Parameters<typeof mockNativeSecureStore.getItemAsync>) =>
    mockNativeSecureStore.getItemAsync(...args),
  deleteItemAsync: (...args: Parameters<typeof mockNativeSecureStore.deleteItemAsync>) =>
    mockNativeSecureStore.deleteItemAsync(...args)
}));
jest.mock('../query/client', () => {
  const { QueryClient } = jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  );
  return {
    appQueryClient: new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } }
    }),
    activeUserScopeCoordinator: {
      getUserId: jest.fn(),
      activate: jest.fn(),
      retire: jest.fn()
    }
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: 'root-redirect' }, href),
    Slot: () => mockRouterState.renderSlot(),
    useSegments: () => mockRouterState.segments
  };
});
jest.mock('../theme/PrototypeFontBoundary', () => ({
  PrototypeFontBoundary: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context'
  );
  return {
    ...actual,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
  };
});
jest.mock('../store/preferencesStore', () => ({
  createUserPreferencesStore: jest.fn(),
  hydrateUserPreferencesStore: jest.fn()
}));
jest.mock('../services/sessionOutbox', () => ({
  createAuthenticatedSessionOutbox: jest.fn()
}));

import type { Me } from '@easy-meditation/shared';
import { getMe, login, logout } from '../api/auth';
import { activeUserScopeCoordinator, appQueryClient } from '../query/client';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../store/preferencesStore';
import {
  createAuthenticatedSessionOutbox,
  type SessionOutbox
} from '../services/sessionOutbox';
import { useAuthStore } from '../store/authStore';
import { createTestQueryClient, renderWithProviders } from '../test/renderWithProviders';
import { AuthSessionBoundary, useAuthSession } from './AuthSessionBoundary';
import {
  createActiveUserScopeCoordinator,
  type ActiveUserScopeCoordinator
} from './activeUserScope';
import RootLayout from '../../app/_layout';

const USER_A: Me = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@example.com',
  nickname: 'A',
  createdAt: '2026-07-10T00:00:00.000Z'
};

const USER_B: Me = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'b@example.com',
  nickname: 'B',
  createdAt: '2026-07-10T00:00:00.000Z'
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fakeStore(): UserPreferencesStore {
  return {
    persist: { hasHydrated: () => true }
  } as unknown as UserPreferencesStore;
}

function SessionProbe() {
  const session = useAuthSession();
  return <Text testID="session-user">{session.userId}</Text>;
}

function OutboxProbe({ onOutbox }: { onOutbox(outbox: SessionOutbox): void }) {
  const session = useAuthSession();
  React.useEffect(() => {
    onOutbox(session.sessionOutbox);
  }, [onOutbox, session.sessionOutbox]);
  return <Text testID="session-outbox">ready</Text>;
}

function ProtectedScopeMount({
  coordinator
}: {
  coordinator: ActiveUserScopeCoordinator;
}) {
  React.useEffect(() => {
    void coordinator.activate('A');
  }, [coordinator]);
  return <Text testID="protected-scope-child">mounted</Text>;
}

const getMeMock = getMe as jest.MockedFunction<typeof getMe>;
const loginMock = login as jest.MockedFunction<typeof login>;
const logoutMock = logout as jest.MockedFunction<typeof logout>;
const activateMock = activeUserScopeCoordinator.activate as jest.MockedFunction<
  typeof activeUserScopeCoordinator.activate
>;
const retireMock = activeUserScopeCoordinator.retire as jest.MockedFunction<
  typeof activeUserScopeCoordinator.retire
>;
const createStoreMock = createUserPreferencesStore as jest.MockedFunction<
  typeof createUserPreferencesStore
>;
const hydrateMock = hydrateUserPreferencesStore as jest.MockedFunction<
  typeof hydrateUserPreferencesStore
>;
const createOutboxMock = createAuthenticatedSessionOutbox as jest.MockedFunction<
  typeof createAuthenticatedSessionOutbox
>;

describe('AuthSessionBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appQueryClient.clear();
    mockRouterState.segments = ['(auth)'];
    mockRouterState.renderSlot = () => <Text testID="root-slot">slot</Text>;
    mockNativeSecureStore.setItemAsync.mockReset();
    mockNativeSecureStore.setItemAsync.mockResolvedValue(undefined);
    mockNativeSecureStore.getItemAsync.mockReset();
    mockNativeSecureStore.getItemAsync.mockResolvedValue(null);
    mockNativeSecureStore.deleteItemAsync.mockReset();
    mockNativeSecureStore.deleteItemAsync.mockResolvedValue(undefined);
    getMeMock.mockReset();
    loginMock.mockReset();
    logoutMock.mockReset();
    logoutMock.mockResolvedValue(undefined);
    activateMock.mockReset();
    retireMock.mockReset();
    createStoreMock.mockReset();
    hydrateMock.mockReset();
    createOutboxMock.mockReset();
    mockSessionOutbox.submit.mockReset();
    mockSessionOutbox.submit.mockResolvedValue(undefined);
    mockSessionOutbox.drainDue.mockReset();
    mockSessionOutbox.drainDue.mockResolvedValue(undefined);
    mockSessionOutbox.retryNow.mockReset();
    mockSessionOutbox.retryNow.mockResolvedValue(undefined);
    useAuthStore.setState({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      isRestoring: false,
      restoreError: null,
      pendingRestoreTokens: null,
      sessionRevision: 1,
      isTerminating: false
    });
    activateMock.mockResolvedValue(undefined);
    retireMock.mockResolvedValue(undefined);
    createStoreMock.mockImplementation(() => fakeStore());
    hydrateMock.mockResolvedValue(undefined);
    createOutboxMock.mockReturnValue(mockSessionOutbox);
  });

  it('keeps children closed until me, scope activation, and preference hydration resolve', async () => {
    const me = deferred<Me>();
    const activation = deferred<void>();
    const hydration = deferred<void>();
    getMeMock.mockReturnValue(me.promise);
    activateMock.mockReturnValue(activation.promise);
    hydrateMock.mockReturnValue(hydration.promise);

    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );

    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => me.resolve(USER_A));
    await waitFor(() => expect(activateMock).toHaveBeenCalledWith(USER_A.id));
    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => activation.resolve());
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(1));
    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => hydration.resolve());
    await waitFor(() => {
      expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
    });
  });

  it('starts the authenticated drain after hydration without blocking protected children', async () => {
    getMeMock.mockResolvedValue(USER_A);
    const drain = deferred<void>();
    mockSessionOutbox.drainDue.mockReturnValue(drain.promise);
    const queryClient = createTestQueryClient();
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient }
    );

    await waitFor(() => {
      expect(createOutboxMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_A.id,
          preferencesStore: expect.anything(),
          queryClient,
          onTerminalUnauthorized: expect.any(Function)
        })
      );
      expect(mockSessionOutbox.drainDue).toHaveBeenCalledWith({
        resumeAuthBlocked: true
      });
    });
    await waitFor(() => expect(view.getByTestId('session-user')).toBeTruthy());

    await act(async () => drain.resolve());
  });

  it('handles a background drain rejection without hiding children or leaking a rejection', async () => {
    getMeMock.mockResolvedValue(USER_A);
    mockSessionOutbox.drainDue.mockRejectedValue(new Error('storage unavailable'));
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );

    await waitFor(() => expect(view.getByTestId('session-user')).toBeTruthy());
    expect(view.queryByText('账户准备失败')).toBeNull();
  });

  it('keeps one session-scoped outbox instance across access-token rotation', async () => {
    getMeMock.mockResolvedValue(USER_A);
    const onOutbox = jest.fn();
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <OutboxProbe onOutbox={onOutbox} />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );

    await waitFor(() => expect(view.getByTestId('session-outbox')).toBeTruthy());
    expect(onOutbox).toHaveBeenCalledWith(mockSessionOutbox);
    expect(createOutboxMock).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState({ accessToken: 'rotated-access-a' }));

    expect(view.getByTestId('session-outbox')).toBeTruthy();
    expect(createOutboxMock).toHaveBeenCalledTimes(1);
    expect(new Set(onOutbox.mock.calls.map(([outbox]) => outbox))).toEqual(
      new Set([mockSessionOutbox])
    );
  });

  it('does not let a superseded account outbox terminate the next authenticated session', async () => {
    jest.useFakeTimers();
    try {
      getMeMock.mockResolvedValue(USER_A);
      const view = renderWithProviders(
        <AuthSessionBoundary>
          <SessionProbe />
        </AuthSessionBoundary>,
        { queryClient: createTestQueryClient() }
      );
      await waitFor(() => expect(view.getByTestId('session-user')).toBeTruthy());
      const outboxOptions = createOutboxMock.mock.calls[0]?.[0];
      expect(outboxOptions).toBeDefined();
      if (!outboxOptions) throw new Error('Expected outbox options.');

      getMeMock.mockReturnValueOnce(new Promise<Me>(() => undefined));
      act(() => {
        useAuthStore.setState({
          accessToken: 'access-b',
          refreshToken: 'refresh-b',
          sessionRevision: 2,
          isTerminating: false
        });
      });

      await act(async () => outboxOptions.onTerminalUnauthorized());

      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        sessionRevision: 2,
        isTerminating: false
      });
    } finally {
      await act(async () => jest.runAllTimersAsync());
      jest.useRealTimers();
    }
  });

  it('never renders the previous user while a new revision is unresolved', async () => {
    getMeMock.mockResolvedValueOnce(USER_A);
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );
    await waitFor(() => {
      expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
    });

    const meB = deferred<Me>();
    const activateB = deferred<void>();
    const hydrateB = deferred<void>();
    getMeMock.mockReturnValueOnce(meB.promise);
    activateMock.mockReturnValueOnce(activateB.promise);
    hydrateMock.mockReturnValueOnce(hydrateB.promise);

    await act(async () => {
      useAuthStore.setState({
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
        sessionRevision: 2
      });
    });
    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => meB.resolve(USER_B));
    await waitFor(() => expect(activateMock).toHaveBeenLastCalledWith(USER_B.id));
    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => activateB.resolve());
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(2));
    expect(view.queryByTestId('session-user')).toBeNull();

    await act(async () => hydrateB.resolve());
    await waitFor(() => {
      expect(view.getByTestId('session-user').props.children).toBe(USER_B.id);
    });
  });

  it('shows an inline retry when me fails', async () => {
    getMeMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(USER_A);
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );

    await waitFor(() => expect(view.getByText('重新加载')).toBeTruthy());
    expect(view.queryByTestId('session-user')).toBeNull();

    fireEvent.press(view.getByText('重新加载'));
    await waitFor(() => {
      expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
    });
  });

  it('retries preference hydration inline without exposing children', async () => {
    getMeMock.mockResolvedValue(USER_A);
    hydrateMock
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );

    await waitFor(() => expect(view.getByText('重新加载')).toBeTruthy());
    expect(view.queryByTestId('session-user')).toBeNull();

    fireEvent.press(view.getByText('重新加载'));
    await waitFor(() => {
      expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
    });
    expect(hydrateMock).toHaveBeenCalledTimes(2);
  });

  it('closes an established session synchronously while auth terminates', async () => {
    getMeMock.mockResolvedValue(USER_A);
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );
    await waitFor(() => expect(view.getByTestId('session-user')).toBeTruthy());

    act(() => useAuthStore.setState({ isTerminating: true }));

    expect(view.queryByTestId('session-user')).toBeNull();
  });

  it('keeps the prepared session mounted across access-token rotation', async () => {
    getMeMock.mockResolvedValue(USER_A);
    const view = renderWithProviders(
      <AuthSessionBoundary>
        <SessionProbe />
      </AuthSessionBoundary>,
      { queryClient: createTestQueryClient() }
    );
    await waitFor(() => expect(view.getByTestId('session-user')).toBeTruthy());
    expect(hydrateMock).toHaveBeenCalledTimes(1);

    act(() => useAuthStore.setState({ accessToken: 'rotated-access-a' }));

    expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
    expect(hydrateMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the root coordinator active across protected child unmount and remount', async () => {
    const { QueryClient } = jest.requireActual<typeof import('@tanstack/react-query')>(
      '@tanstack/react-query'
    );
    const coordinator = createActiveUserScopeCoordinator(new QueryClient());

    const firstMount = render(<ProtectedScopeMount coordinator={coordinator} />);
    await waitFor(() => expect(coordinator.getUserId()).toBe('A'));
    firstMount.unmount();

    expect(coordinator.getUserId()).toBe('A');

    const secondMount = render(<ProtectedScopeMount coordinator={coordinator} />);
    await waitFor(() => expect(coordinator.getUserId()).toBe('A'));
    secondMount.unmount();

    expect(coordinator.getUserId()).toBe('A');
    await coordinator.retire();
    expect(coordinator.getUserId()).toBeNull();
  });

  it('never revives A while logout retires it and B retries offline bootstrap', async () => {
    const originalRestore = useAuthStore.getState().restore;
    const retirement = deferred<void>();
    const meB = deferred<Me>();
    const hydrationB = deferred<void>();
    getMeMock
      .mockResolvedValueOnce(USER_A)
      .mockReturnValueOnce(meB.promise)
      .mockRejectedValueOnce(new Error('B refetch failed'))
      .mockResolvedValueOnce(USER_B);
    hydrateMock
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(hydrationB.promise);
    retireMock.mockReturnValueOnce(retirement.promise);
    loginMock.mockResolvedValue({
      accessToken: 'access-b',
      refreshToken: 'refresh-b'
    });
    mockRouterState.segments = ['(tabs)'];
    mockRouterState.renderSlot = () => <SessionProbe />;
    useAuthStore.setState({ restore: jest.fn(async () => undefined) });

    const view = render(<RootLayout />);
    try {
      await waitFor(() => {
        expect(view.getByTestId('session-user').props.children).toBe(USER_A.id);
      });

      let logoutPromise!: Promise<void>;
      act(() => {
        logoutPromise = useAuthStore.getState().logout();
      });
      await waitFor(() => expect(retireMock).toHaveBeenCalledTimes(1));

      expect(view.queryByTestId('session-user')).toBeNull();
      expect(view.queryByTestId('root-redirect')).toBeNull();
      expect(useAuthStore.getState()).toMatchObject({
        accessToken: 'access-a',
        refreshToken: 'refresh-a',
        isTerminating: true,
        sessionRevision: 1
      });

      await act(async () => {
        retirement.resolve();
        await logoutPromise;
      });

      expect(useAuthStore.getState()).toMatchObject({
        accessToken: null,
        refreshToken: null,
        isTerminating: false,
        sessionRevision: 2
      });
      expect(view.getByTestId('root-redirect').props.children).toBe('/(auth)/login');
      expect(view.queryByText(USER_A.id)).toBeNull();

      mockRouterState.segments = ['(auth)'];
      mockRouterState.renderSlot = () => <Text testID="auth-screen">auth</Text>;
      view.rerender(<RootLayout />);
      expect(view.getByTestId('auth-screen')).toBeTruthy();

      await act(async () => {
        await useAuthStore.getState().login({
          email: 'b@example.com',
          password: 'password123'
        });
      });
      mockRouterState.segments = ['(tabs)'];
      mockRouterState.renderSlot = () => <SessionProbe />;
      view.rerender(<RootLayout />);

      expect(view.queryByTestId('session-user')).toBeNull();
      expect(view.queryByText(USER_A.id)).toBeNull();

      await act(async () => meB.reject(new Error('B is offline')));
      await waitFor(() => expect(view.getByText('重新加载')).toBeTruthy());
      expect(view.queryByTestId('session-user')).toBeNull();
      expect(view.queryByText(USER_A.id)).toBeNull();

      fireEvent.press(view.getByText('重新加载'));
      await waitFor(() => expect(getMeMock).toHaveBeenCalledTimes(3));
      await waitFor(() => expect(view.getByText('重新加载')).toBeTruthy());
      expect(view.queryByTestId('session-user')).toBeNull();
      expect(view.queryByText(USER_A.id)).toBeNull();

      fireEvent.press(view.getByText('重新加载'));
      await waitFor(() => expect(activateMock).toHaveBeenLastCalledWith(USER_B.id));
      await waitFor(() => expect(hydrateMock).toHaveBeenCalledTimes(2));
      expect(view.queryByTestId('session-user')).toBeNull();
      expect(view.queryByText(USER_A.id)).toBeNull();

      await act(async () => hydrationB.resolve());
      await waitFor(() => {
        expect(view.getByTestId('session-user').props.children).toBe(USER_B.id);
      });
    } finally {
      view.unmount();
      useAuthStore.setState({ restore: originalRestore });
    }
  });

  it('renders auth-group routes outside the protected boundary when signed out', () => {
    const originalRestore = useAuthStore.getState().restore;
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      isRestoring: false,
      restoreError: null,
      isTerminating: false,
      restore: jest.fn(async () => undefined)
    });

    const view = render(<RootLayout />);
    try {
      expect(view.getByTestId('root-slot')).toBeTruthy();
      expect(view.queryByText('正在准备你的冥想空间…')).toBeNull();
    } finally {
      view.unmount();
      useAuthStore.setState({ restore: originalRestore });
    }
  });
});
