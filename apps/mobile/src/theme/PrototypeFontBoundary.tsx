import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { prototypeFontSources } from './fonts';
import { colors } from './tokens';

export function PrototypeFontBoundary({ children }: PropsWithChildren) {
  const [fontsLoaded, fontError] = useFonts(prototypeFontSources);

  if (fontError) {
    return (
      <View style={styles.blockingScreen}>
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.errorTitle}
        >
          字体加载失败
        </Text>
        <Text style={styles.errorBody}>
          应用无法加载所需字体。请重新启动应用后再试。
        </Text>
      </View>
    );
  }

  if (!fontsLoaded) {
    return (
      <View
        accessibilityLabel="正在加载应用字体"
        accessibilityRole="progressbar"
        style={styles.blockingScreen}
      >
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create({
  blockingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.backgroundMid
  },
  errorTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center'
  },
  errorBody: {
    maxWidth: 320,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center'
  }
});
