import type { PropsWithChildren } from 'react';
import { Link } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { referenceImages } from '../theme/assets';
import { layout, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { PrototypeScreen } from './PrototypeScreen';

export type AuthScaffoldProps = PropsWithChildren<{
  eyebrow: string;
  title: string;
  subtitle: string;
}>;

export type AuthLinkProps = {
  href: '/(auth)/login' | '/(auth)/register';
  label: string;
  disabled?: boolean;
};

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

export function AuthLink({ href, label, disabled = false }: AuthLinkProps) {
  return (
    <Link asChild href={href}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="link"
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.link,
          disabled ? styles.linkDisabled : null,
          pressed && !disabled ? styles.linkPressed : null
        ]}
      >
        <AppText style={styles.linkLabel} tone="teal" variant="label">
          {label}
        </AppText>
      </Pressable>
    </Link>
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
  },
  link: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: 12
  },
  linkDisabled: {
    opacity: 0.45
  },
  linkPressed: {
    opacity: 0.7
  },
  linkLabel: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'center'
  }
});
