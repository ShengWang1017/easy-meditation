import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps
} from 'react-native';

import { colors, layout, radii, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type PrototypeButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'quiet';
  loading?: boolean;
};

export function PrototypeButton({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityState,
  style,
  ...pressableProps
}: PrototypeButtonProps) {
  const isDisabled = disabled || loading;
  const buttonStyle: PressableProps['style'] =
    typeof style === 'function'
      ? (state) => [
          styles.button,
          variantStyles[variant],
          state.pressed && !isDisabled ? styles.pressed : null,
          isDisabled ? styles.disabled : null,
          style(state)
        ]
      : (state) => [
          styles.button,
          variantStyles[variant],
          state.pressed && !isDisabled ? styles.pressed : null,
          isDisabled ? styles.disabled : null,
          style
        ];

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      style={buttonStyle}
    >
      {loading ? (
        <ActivityIndicator
          accessible={false}
          color={variant === 'primary' ? colors.surfaceStrong : colors.teal}
          size="small"
        />
      ) : null}
      <AppText tone={variant === 'primary' ? 'inverse' : 'teal'} variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.lg
  },
  primary: {
    backgroundColor: colors.accentStrong
  },
  quiet: {
    backgroundColor: 'transparent'
  },
  pressed: {
    opacity: 0.76
  },
  disabled: {
    opacity: 0.5
  }
});

const variantStyles = {
  primary: styles.primary,
  quiet: styles.quiet
} as const;
