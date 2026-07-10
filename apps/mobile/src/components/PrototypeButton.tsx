import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle
} from 'react-native';

import { colors, layout, radii, spacing } from '../theme/tokens';
import { useVisualQaRegistration } from '../qa/VisualQaReporter';
import { AppText } from './AppText';

export type PrototypeButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  variant?: 'primary' | 'quiet';
  loading?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  visualQaId?: string;
};

export function PrototypeButton({
  label,
  labelStyle,
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityState,
  style,
  visualQaId,
  nativeID,
  testID,
  ...pressableProps
}: PrototypeButtonProps) {
  const visualQaRegistration = useVisualQaRegistration(visualQaId);
  const isDisabled = disabled || loading;
  const buttonStyle: PressableProps['style'] = (state) => {
    const callerStyle = typeof style === 'function' ? style(state) : style;

    return [
      styles.button,
      variantStyles[variant],
      callerStyle,
      state.pressed && !isDisabled ? styles.pressed : null,
      isDisabled ? styles.disabled : null,
      minimumTargetStyle(callerStyle)
    ];
  };

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      nativeID={visualQaId ?? nativeID}
      onPress={isDisabled ? undefined : onPress}
      ref={visualQaId ? visualQaRegistration.ref : undefined}
      style={buttonStyle}
      testID={testID ?? visualQaId}
    >
      {loading ? (
        <ActivityIndicator
          accessible={false}
          color={variant === 'primary' ? colors.surfaceStrong : colors.teal}
          size="small"
        />
      ) : null}
      <AppText
        style={labelStyle}
        tone={variant === 'primary' ? 'inverse' : 'teal'}
        variant="label"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function minimumTargetStyle(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);

  return {
    minHeight:
      typeof flattened?.minHeight === 'number'
        ? Math.max(layout.touchTarget, flattened.minHeight)
        : layout.touchTarget,
    minWidth:
      typeof flattened?.minWidth === 'number'
        ? Math.max(layout.touchTarget, flattened.minWidth)
        : layout.touchTarget
  };
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
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
