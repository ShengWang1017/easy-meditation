import type React from 'react';
import {
  QueryClient,
  QueryClientProvider
} from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  SafeAreaProvider,
  type Metrics
} from 'react-native-safe-area-context';

const TEST_SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 }
};

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
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  return { ...result, queryClient };
}
