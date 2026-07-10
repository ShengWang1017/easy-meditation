import {
  Image,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
  type ImageStyle,
  type PressableProps,
  type StyleProp
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
  const buttonStyle: PressableProps['style'] =
    typeof style === 'function'
      ? (state) => [styles.button, isDisabled ? styles.disabled : null, style(state)]
      : [styles.button, isDisabled ? styles.disabled : null, style];

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
