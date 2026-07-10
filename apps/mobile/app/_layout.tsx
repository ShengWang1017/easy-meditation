import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Redirect,
  Slot,
  Stack,
  useGlobalSearchParams,
  usePathname,
  useSegments
} from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthSessionBoundary } from '../src/auth/AuthSessionBoundary';
import { InlineState } from '../src/components/InlineState';
import { appQueryClient } from '../src/query/client';
import { useAuthStore } from '../src/store/authStore';
import '../src/theme/assets';
import { PrototypeFontBoundary } from '../src/theme/PrototypeFontBoundary';
import { colors, spacing } from '../src/theme/tokens';

function ProtectedStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="session/[methodId]"
        options={{
          headerShown: false,
          gestureEnabled: false,
          headerBackButtonMenuEnabled: false
        }}
      />
    </Stack>
  );
}

function NormalRootNavigator() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const restoreError = useAuthStore((state) => state.restoreError);
  const isTerminating = useAuthStore((state) => state.isTerminating);
  const restore = useAuthStore((state) => state.restore);
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    void restore();
  }, [restore]);

  if (isRestoring || isTerminating) {
    return (
      <View style={styles.loadingScreen}>
        <InlineState
          kind="loading"
          message={isTerminating ? '正在安全退出当前账户…' : '正在恢复登录状态…'}
        />
      </View>
    );
  }

  if (restoreError) {
    return (
      <View style={styles.loadingScreen}>
        <InlineState
          actionLabel="重新加载"
          kind="error"
          message="暂时无法恢复登录状态，请检查网络或稍后重试。"
          onAction={() => void restore()}
          title="登录恢复失败"
        />
      </View>
    );
  }

  if (!accessToken) {
    if (!inAuthGroup) {
      return <Redirect href="/(auth)/login" />;
    }

    return <Slot />;
  }

  if (inAuthGroup) {
    return <Redirect href="/(tabs)/practice" />;
  }

  return (
    <AuthSessionBoundary>
      <ProtectedStack />
    </AuthSessionBoundary>
  );
}

function RootNavigator() {
  if (!__DEV__ || process.env.EXPO_PUBLIC_VISUAL_QA !== '1') {
    return <NormalRootNavigator />;
  }

  return <VisualQaRootNavigator />;
}

function VisualQaRootNavigator() {
  const { VisualQaFixtureBoundary } = require(
    '../src/qa/VisualQaFixtureBoundary'
  ) as typeof import('../src/qa/VisualQaFixtureBoundary');
  const params = useGlobalSearchParams<{ visualQaState?: string | string[] }>();
  const pathname = usePathname();

  return (
    <VisualQaFixtureBoundary
      dev
      fallback={<NormalRootNavigator />}
      pathname={pathname}
      requested
      state={params.visualQaState}
    >
      {(fixture) =>
        fixture.authScope === 'unauthenticated' ? <Slot /> : <ProtectedStack />
      }
    </VisualQaFixtureBoundary>
  );
}

export default function RootLayout() {
  return (
    <PrototypeFontBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <QueryClientProvider client={appQueryClient}>
            <StatusBar style="dark" />
            <RootNavigator />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PrototypeFontBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: colors.backgroundMid,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  }
});
