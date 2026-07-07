import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/tokens';

type ScreenProps = PropsWithChildren<{
  scrollable?: boolean;
}>;

export function Screen({ children, scrollable = false }: ScreenProps) {
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoider}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundMid
  },
  keyboardAvoider: {
    flex: 1
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.backgroundMid
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    backgroundColor: colors.backgroundMid
  }
});
