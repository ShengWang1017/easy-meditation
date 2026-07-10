import { StyleSheet, Text, type TextProps } from 'react-native';

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
  ...textProps
}: AppTextProps) {
  const fontFamily =
    systemFont || variant === 'timer'
      ? fontFamilies.system
      : displayVariants.has(variant)
        ? fontFamilies.display
        : fontFamilies.body;

  return (
    <Text
      {...textProps}
      accessibilityRole={textProps.accessibilityRole ?? (variant === 'timer' ? 'timer' : undefined)}
      allowFontScaling
      maxFontSizeMultiplier={1.2}
      style={[
        variantStyles[variant],
        { color: toneColors[tone], fontFamily },
        style
      ]}
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
