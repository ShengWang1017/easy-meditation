import { forwardRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps
} from 'react-native';

import type { AuthFieldName } from '../domain/authFormErrors';
import { fontFamilies } from '../theme/fonts';
import { colors, radii, shadows, spacing } from '../theme/tokens';
import { AppText } from './AppText';

export type AuthTextFieldProps = Omit<
  TextInputProps,
  'accessibilityLabel' | 'accessibilityLabelledBy' | 'style'
> & {
  name: AuthFieldName;
  label: string;
  error?: string;
};

export const AuthTextField = forwardRef<TextInput, AuthTextFieldProps>(
  function AuthTextField(
    {
      name,
      label,
      error,
      accessibilityHint,
      placeholderTextColor = colors.muted,
      ...inputProps
    },
    ref
  ) {
    const labelID = `auth-${name}-label`;
    const errorID = `auth-${name}-error`;

    return (
      <View style={styles.fieldGroup}>
        <AppText nativeID={labelID} variant="label">
          {label}
        </AppText>
        <TextInput
          {...inputProps}
          accessibilityHint={error ?? accessibilityHint}
          accessibilityLabel={label}
          accessibilityLabelledBy={labelID}
          allowFontScaling
          maxFontSizeMultiplier={1.2}
          placeholderTextColor={placeholderTextColor}
          ref={ref}
          selectionColor={colors.teal}
          style={[styles.input, error ? styles.inputError : null]}
        />
        {error ? (
          <AppText
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            nativeID={errorID}
            tone="danger"
            variant="meta"
          >
            {error}
          </AppText>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fieldGroup: {
    gap: spacing.xs
  },
  input: {
    ...shadows.methodCard,
    backgroundColor: colors.surface,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fontFamilies.system,
    fontSize: 16,
    height: 56,
    lineHeight: 22,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: 0
  },
  inputError: {
    borderColor: colors.danger
  }
});
