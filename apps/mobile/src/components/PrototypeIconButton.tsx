import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type ImageStyle,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from 'react-native';

import { layout } from '../theme/tokens';

export type PrototypeIconButtonProps = Omit<PressableProps, 'children'> & {
  source: ImageSourcePropType;
  accessibilityLabel: string;
  imageStyle?: StyleProp<ImageStyle>;
};

export function PrototypeIconButton({
  source,
  accessibilityLabel,
  imageStyle,
  disabled = false,
  hitSlop,
  onPress,
  accessibilityState,
  style,
  ...pressableProps
}: PrototypeIconButtonProps) {
  const isDisabled = disabled === true;
  const buttonStyle: PressableProps['style'] = (state) => {
    const callerStyle = typeof style === 'function' ? style(state) : style;

    return [
      styles.button,
      callerStyle,
      isDisabled ? styles.disabled : null,
      minimumTargetStyle(callerStyle)
    ];
  };

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      hitSlop={hitSlop ?? 8}
      onPress={isDisabled ? undefined : onPress}
      style={buttonStyle}
    >
      <Image
        accessible={false}
        resizeMode="contain"
        source={source}
        style={[styles.image, imageStyle]}
      />
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
    height: layout.touchTarget,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    width: layout.touchTarget
  },
  image: {
    height: 24,
    width: 24
  },
  disabled: {
    opacity: 0.42
  }
});
