import type React from 'react';
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export type RenderWithProvidersOptions = { queryClient?: QueryClient };

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 0,
        retry: false
      },
      mutations: {
        gcTime: 0,
        retry: false
      }
    }
  });
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderWithProvidersOptions
): ReturnType<typeof render> & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const result = render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  return { ...result, queryClient };
}
