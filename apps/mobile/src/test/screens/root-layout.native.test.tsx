import React from 'react';
import { jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';

const mockRegisteredScreens: Array<{ name: string; options?: Record<string, unknown> }> = [];
let mockSearchParams: { visualQaState?: string | string[] } = {};
let mockPathname = '/practice';
const originalDev = __DEV__;
const mockRestore = jest.fn(async () => undefined);
const mockAuthState: {
  accessToken: string | null;
  isRestoring: boolean;
  restoreError: string | null;
  isTerminating: boolean;
  restore: typeof mockRestore;
} = {
  accessToken: 'access-token',
  isRestoring: false,
  restoreError: null,
  isTerminating: false,
  restore: mockRestore
};

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>(
    'react-native'
  );
  const Stack = Object.assign(
    ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(MockView, { testID: 'root-stack' }, children),
    {
      Screen: (props: {
        name: string;
        options?: Record<string, unknown>;
      }) => {
        mockRegisteredScreens.push(props);
        return null;
      },
      Protected: ({
        children,
        guard
      }: {
        children?: React.ReactNode;
        guard: boolean;
      }) =>
        guard
          ? ReactModule.createElement(ReactModule.Fragment, null, children)
          : null
    }
  );

  return {
    Slot: () => ReactModule.createElement(MockView, { testID: 'root-slot' }),
    Stack,
    useGlobalSearchParams: () => mockSearchParams,
    usePathname: () => mockPathname
  };
});
jest.mock('../../auth/AuthSessionBoundary', () => ({
  AuthSessionBoundary: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState)
}));
jest.mock('../../theme/PrototypeFontBoundary', () => ({
  PrototypeFontBoundary: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('../../qa/VisualQaFixtureBoundary', () => {
  const globalWithCounter = globalThis as typeof globalThis & {
    __mockQaBoundaryModuleLoads?: number;
  };
  globalWithCounter.__mockQaBoundaryModuleLoads =
    (globalWithCounter.__mockQaBoundaryModuleLoads ?? 0) + 1;
  return {
    __esModule: true,
    VisualQaFixtureBoundary: ({
    children,
    dev,
    fallback,
    pathname,
    requested,
    state
  }: {
    children(fixture: {
      id: string;
      authScope: 'authenticated' | 'unauthenticated';
    }): React.ReactNode;
    dev: boolean;
    fallback: React.ReactNode;
    pathname: string;
    requested: boolean;
    state?: unknown;
  }) => {
    const stateId = typeof state === 'string' ? state : '';
    const valid = [
      'practice',
      'guide',
      'custom',
      'session-ready',
      'session-inhale',
      'session-hold',
      'session-exhale',
      'session-paused',
      'session-completed',
      'records-empty',
      'records-populated',
      'login',
      'register'
    ].includes(stateId);
    const expectedPathname =
      state === 'practice'
        ? '/practice'
        : state === 'login'
          ? '/login'
          : state === 'register'
            ? '/register'
            : state === 'records-empty' || state === 'records-populated'
              ? '/records'
              : state === 'guide'
                ? '/guide'
                : state === 'custom'
                  ? '/custom-rhythm'
                  : typeof state === 'string' && state.startsWith('session-')
                    ? '/session/box'
                    : null;
    if (!dev || !requested || !valid || pathname !== expectedPathname) {
      return fallback;
    }
    return children({
      id: stateId,
      authScope:
        state === 'login' || state === 'register'
          ? 'unauthenticated'
          : 'authenticated'
    });
    }
  };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import RootLayout from '../../../app/_layout';

function qaBoundaryModuleLoads(): number {
  return (
    global as typeof globalThis & { __mockQaBoundaryModuleLoads?: number }
  ).__mockQaBoundaryModuleLoads ?? 0;
}

describe('root session route options', () => {
  beforeEach(() => {
    (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
    mockRegisteredScreens.length = 0;
    mockAuthState.accessToken = 'access-token';
    mockRestore.mockClear();
    mockSearchParams = {};
    mockPathname = '/practice';
    delete process.env.EXPO_PUBLIC_VISUAL_QA;
  });

  afterAll(() => {
    (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = originalDev;
    delete (
      global as typeof globalThis & { __mockQaBoundaryModuleLoads?: number }
    ).__mockQaBoundaryModuleLoads;
  });

  it('registers the focus route without a native header or swipe removal', () => {
    const view = render(<RootLayout />);

    expect(view.getByTestId('root-stack')).toBeTruthy();

    const route = mockRegisteredScreens.find(
      (screen) => screen.name === 'session/[methodId]'
    );
    expect(route?.options).toMatchObject({
      headerShown: false,
      gestureEnabled: false,
      headerBackButtonMenuEnabled: false
    });
    expect(qaBoundaryModuleLoads()).toBe(0);
  });

  it('keeps an unauthenticated cold start inside the root stack', () => {
    mockAuthState.accessToken = null;

    const view = render(<RootLayout />);

    expect(view.getByTestId('root-stack')).toBeTruthy();
    expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
      '(auth)/login',
      '(auth)/register'
    ]);
  });

  it('removes protected routes when the authenticated session ends', () => {
    const view = render(<RootLayout />);

    expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
      '(tabs)',
      'guide',
      'custom-rhythm',
      'session/[methodId]'
    ]);

    mockRegisteredScreens.length = 0;
    mockAuthState.accessToken = null;
    view.rerender(<RootLayout />);

    expect(view.getByTestId('root-stack')).toBeTruthy();
    expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
      '(auth)/login',
      '(auth)/register'
    ]);
  });

  it('does not load the QA module in production even when the env and query request it', () => {
    (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'practice' };

    render(<RootLayout />);

    expect(qaBoundaryModuleLoads()).toBe(0);
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });

  it('enters an authenticated QA stack before normal auth restore', async () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'practice' };

    const view = render(<RootLayout />);

    await waitFor(() => expect(view.getByTestId('root-stack')).toBeTruthy());
    expect(qaBoundaryModuleLoads()).toBe(1);
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('renders normal auth slots for unauthenticated QA states without restore', async () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'login' };
    mockPathname = '/login';

    const view = render(<RootLayout />);

    await waitFor(() => expect(view.getByTestId('root-slot')).toBeTruthy());
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it.each([
    [{ visualQaState: 'practice' }, undefined],
    [{}, '1'],
    [{ visualQaState: 'unknown' }, '1']
  ])('does not activate QA from only env/query or an unknown state', (params, env) => {
    mockSearchParams = params;
    if (env) process.env.EXPO_PUBLIC_VISUAL_QA = env;

    render(<RootLayout />);

    expect(mockRestore).toHaveBeenCalledTimes(1);
  });

  it('does not activate QA for duplicate visualQaState params', () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: ['practice', 'guide'] };

    render(<RootLayout />);

    expect(mockRestore).toHaveBeenCalledTimes(1);
  });

  it('does not activate QA when the state does not match the current route', () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'practice' };
    mockPathname = '/records';

    render(<RootLayout />);

    expect(mockRestore).toHaveBeenCalledTimes(1);
  });
});
