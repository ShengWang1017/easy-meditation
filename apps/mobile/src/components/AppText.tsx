import { useCallback } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useVisualQaRegistration } from '../qa/VisualQaReporter';
import { fontFamilies } from '../theme/fonts';
import { colors, type } from '../theme/tokens';

export type AppTextVariant =
  | 'displayHero'
  | 'displayTitle'
  | 'displaySection'
  | 'cardTitle'
  | 'body'
  | 'label'
  | 'meta'
  | 'timer';

export type AppTextProps = TextProps & {
  variant?: AppTextVariant;
  tone?: 'ink' | 'muted' | 'teal' | 'danger' | 'inverse';
  systemFont?: boolean;
  visualQaId?: string;
};

const displayVariants = new Set<AppTextVariant>([
  'displayHero',
  'displayTitle',
  'displaySection',
  'cardTitle'
]);

const toneColors = {
  ink: colors.ink,
  muted: colors.muted,
  teal: colors.teal,
  danger: colors.danger,
  inverse: colors.surfaceStrong
} as const;

export function AppText({
  variant = 'body',
  tone = 'ink',
  systemFont = false,
  style,
  visualQaId,
  nativeID,
  onTextLayout,
  testID,
  ...textProps
}: AppTextProps) {
  const fontFamily =
    systemFont || variant === 'timer'
      ? fontFamilies.system
      : displayVariants.has(variant)
        ? fontFamilies.display
        : fontFamilies.body;

  const textStyle = [
    variantStyles[variant],
    { color: toneColors[tone], fontFamily },
    style
  ];
  const visualQaRegistration = useVisualQaRegistration(
    visualQaId,
    visualQaId ? { textStyle } : undefined
  );
  const handleTextLayout = useCallback<NonNullable<TextProps['onTextLayout']>>(
    (event) => {
      onTextLayout?.(event);
      visualQaRegistration.onTextLayout?.(event);
    },
    [onTextLayout, visualQaRegistration.onTextLayout]
  );

  return (
    <Text
      {...textProps}
      accessibilityRole={textProps.accessibilityRole ?? (variant === 'timer' ? 'timer' : undefined)}
      allowFontScaling
      maxFontSizeMultiplier={1.2}
      nativeID={visualQaId ?? nativeID}
      onTextLayout={
        onTextLayout || visualQaRegistration.onTextLayout
          ? handleTextLayout
          : undefined
      }
      ref={visualQaId ? visualQaRegistration.ref : undefined}
      style={textStyle}
      testID={testID ?? visualQaId}
    />
  );
}

const variantStyles = StyleSheet.create({
  displayHero: type.hero,
  displayTitle: type.title,
  displaySection: type.section,
  cardTitle: type.cardTitle,
  body: type.body,
  label: type.label,
  meta: type.meta,
  timer: type.hero
});
