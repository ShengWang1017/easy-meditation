import type { PropsWithChildren } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { referenceImages } from '../theme/assets';
import { radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { PrototypeScreen } from './PrototypeScreen';

export type AuthScaffoldProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
}>;

export function AuthScaffold({
  eyebrow,
  title,
  subtitle,
  children
}: AuthScaffoldProps) {
  return (
    <PrototypeScreen
      backgroundVariant="auth"
      contentStyle={styles.screenContent}
      keyboardAvoiding
      scrollable
      testID="auth-screen"
    >
      <View style={styles.formShell}>
        <View style={styles.header}>
          <Image
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            resizeMode="contain"
            source={referenceImages.dandelion}
            style={styles.logo}
          />
          <AppText tone="teal" variant="label">
            {eyebrow}
          </AppText>
          <AppText accessibilityRole="header" variant="displayTitle">
            {title}
          </AppText>
          <AppText tone="muted">{subtitle}</AppText>
        </View>
        {children}
      </View>
    </PrototypeScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg
  },
  formShell: {
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center'
  },
  header: {
    gap: spacing.sm
  },
  logo: {
    borderRadius: radii.lg,
    height: 72,
    marginBottom: spacing.sm,
    width: 72
  }
});
