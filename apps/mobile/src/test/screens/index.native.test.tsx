import React from 'react';
import { jest } from '@jest/globals';
import { render } from '@testing-library/react-native';

const mockAuthState: { accessToken: string | null } = {
  accessToken: null
};
const mockRedirect = jest.fn((_href: string) => null);

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => mockRedirect(href)
}));
jest.mock('../../store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) =>
    selector(mockAuthState)
}));

import IndexRoute from '../../../app/index';

describe('root index route', () => {
  beforeEach(() => {
    mockAuthState.accessToken = null;
    mockRedirect.mockClear();
  });

  it('redirects an unauthenticated root launch to login', () => {
    render(<IndexRoute />);

    expect(mockRedirect).toHaveBeenCalledWith('/(auth)/login');
  });

  it('redirects an authenticated root launch to practice', () => {
    mockAuthState.accessToken = 'access-token';

    render(<IndexRoute />);

    expect(mockRedirect).toHaveBeenCalledWith('/(tabs)/practice');
  });
});
