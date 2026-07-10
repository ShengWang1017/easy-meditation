import React from 'react';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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
jest.mock('../api/auth', () => ({ getMe: jest.fn() }));
jest.mock('../query/client', () => ({
  appQueryClient: new (jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  ).QueryClient)(),
  activeUserScopeCoordinator: {
    getUserId: jest.fn(),
    activate: jest.fn(),
    retire: jest.fn()
  }
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: 'root-redirect' }, href),
    Slot: () => React.createElement(Text, { testID: 'root-slot' }, 'slot'),
    useSegments: () => ['(auth)']
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

import type { Me } from '@easy-meditation/shared';
import { getMe } from '../api/auth';
import { activeUserScopeCoordinator } from '../query/client';
import {
  createUserPreferencesStore,
  hydrateUserPreferencesStore,
  type UserPreferencesStore
} from '../store/preferencesStore';
import { useAuthStore } from '../store/authStore';
import { createTestQueryClient, renderWithProviders } from '../test/renderWithProviders';
import { AuthSessionBoundary, useAuthSession } from './AuthSessionBoundary';
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

const getMeMock = getMe as jest.MockedFunction<typeof getMe>;
const activateMock = activeUserScopeCoordinator.activate as jest.MockedFunction<
  typeof activeUserScopeCoordinator.activate
>;
const createStoreMock = createUserPreferencesStore as jest.MockedFunction<
  typeof createUserPreferencesStore
>;
const hydrateMock = hydrateUserPreferencesStore as jest.MockedFunction<
  typeof hydrateUserPreferencesStore
>;

describe('AuthSessionBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      isRestoring: false,
      restoreError: null,
      sessionRevision: 1,
      isTerminating: false
    });
    activateMock.mockResolvedValue(undefined);
    createStoreMock.mockImplementation(() => fakeStore());
    hydrateMock.mockResolvedValue(undefined);
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
