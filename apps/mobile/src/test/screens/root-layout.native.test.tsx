import React from 'react';
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

const mockRegisteredScreens: Array<{ name: string; options?: Record<string, unknown> }> = [];
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
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import RootLayout from '../../../app/_layout';

describe('root session route options', () => {
  beforeEach(() => {
    mockRegisteredScreens.length = 0;
    mockRestore.mockClear();
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
});
