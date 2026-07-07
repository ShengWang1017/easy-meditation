import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Slot, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../src/store/authStore';
import { colors } from '../src/theme/tokens';

const queryClient = new QueryClient();

function RootNavigator() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const restore = useAuthStore((state) => state.restore);
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    void restore();
  }, [restore]);

  if (isRestoring) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.accentStrong} size="large" />
      </View>
    );
  }

  if (!accessToken && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  if (accessToken && inAuthGroup) {
    return <Redirect href="/(tabs)/practice" />;
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
    justifyContent: 'center'
  }
});
