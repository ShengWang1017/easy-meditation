import React from 'react';
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

const mockRegisteredScreens: Array<{ name: string; options?: Record<string, unknown> }> = [];
let mockSearchParams: { visualQaState?: string | string[] } = {};
let mockPathname = '/practice';
const mockRestore = jest.fn(async () => undefined);
const mockAuthState = {
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
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(MockView, { testID: 'root-stack' }, children);
  Stack.Screen = (props: { name: string; options?: Record<string, unknown> }) => {
    mockRegisteredScreens.push(props);
    return null;
  };

  return {
    Redirect: () => null,
    Slot: () => ReactModule.createElement(MockView, { testID: 'root-slot' }),
    Stack,
    useGlobalSearchParams: () => mockSearchParams,
    usePathname: () => mockPathname,
    useSegments: () => ['(tabs)', 'practice']
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
jest.mock('../../qa/VisualQaFixtureBoundary', () => ({
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
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import RootLayout from '../../../app/_layout';

describe('root session route options', () => {
  beforeEach(() => {
    mockRegisteredScreens.length = 0;
    mockRestore.mockClear();
    mockSearchParams = {};
    mockPathname = '/practice';
    delete process.env.EXPO_PUBLIC_VISUAL_QA;
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
  });

  it('enters an authenticated QA stack before normal auth restore', () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'practice' };

    const view = render(<RootLayout />);

    expect(view.getByTestId('root-stack')).toBeTruthy();
    expect(mockRestore).not.toHaveBeenCalled();
  });

  it('renders normal auth slots for unauthenticated QA states without restore', () => {
    process.env.EXPO_PUBLIC_VISUAL_QA = '1';
    mockSearchParams = { visualQaState: 'login' };
    mockPathname = '/login';

    const view = render(<RootLayout />);

    expect(view.getByTestId('root-slot')).toBeTruthy();
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
