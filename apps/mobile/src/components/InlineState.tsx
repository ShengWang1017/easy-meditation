import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';
import { PrototypeButton } from './PrototypeButton';

export type InlineStateProps = {
  kind: 'loading' | 'empty' | 'warning' | 'error';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const defaultTitles: Record<InlineStateProps['kind'], string> = {
  loading: '加载中',
  empty: '暂无内容',
  warning: '请注意',
  error: '出现问题'
};

export function InlineState({
  kind,
  title,
  message,
  actionLabel,
  onAction
}: InlineStateProps) {
  const resolvedTitle = title ?? defaultTitles[kind];
  const role = kind === 'loading' ? 'progressbar' : kind === 'empty' ? 'summary' : 'alert';
  const showAction = kind === 'error' && Boolean(actionLabel && onAction);

  return (
    <View accessibilityViewIsModal={false} style={[styles.root, kindStyles[kind]]}>
      <View
        accessibilityLabel={`${resolvedTitle}. ${message}`}
        accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
        accessibilityRole={role}
        accessibilityState={kind === 'loading' ? { busy: true } : undefined}
        accessibilityValue={kind === 'loading' ? { text: message } : undefined}
        accessibilityViewIsModal={false}
        accessible
        style={styles.status}
      >
        {kind === 'loading' ? (
          <ActivityIndicator accessible={false} color={colors.teal} size="small" />
        ) : null}
        <View style={styles.copy}>
          <AppText tone={kind === 'error' ? 'danger' : 'ink'} variant="cardTitle">
            {resolvedTitle}
          </AppText>
          <AppText tone={kind === 'error' ? 'danger' : 'muted'}>{message}</AppText>
        </View>
      </View>
      {showAction ? (
        <PrototypeButton label={actionLabel as string} onPress={onAction} variant="quiet" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: radii.md,
    gap: spacing.sm,
    padding: spacing.md
  },
  status: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  copy: {
    flex: 1,
    gap: spacing.xs
  },
  loading: {
    backgroundColor: colors.surface
  },
  empty: {
    backgroundColor: colors.surface
  },
  warning: {
    backgroundColor: colors.mint
  },
  error: {
    backgroundColor: colors.surfaceStrong
  }
});

const kindStyles = {
  loading: styles.loading,
  empty: styles.empty,
  warning: styles.warning,
  error: styles.error
} as const;
