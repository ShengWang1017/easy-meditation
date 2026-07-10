import { useRef, useState } from 'react';
import { Link, router } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { AuthScaffold } from '../../src/components/AuthScaffold';
import { AuthTextField } from '../../src/components/AuthTextField';
import { AppText } from '../../src/components/AppText';
import { PrototypeButton } from '../../src/components/PrototypeButton';
import {
  getAuthFormErrors,
  type AuthFormErrors
} from '../../src/domain/authFormErrors';
import { useAuthStore } from '../../src/store/authStore';
import { fontFamilies } from '../../src/theme/fonts';
import { colors, radii, spacing } from '../../src/theme/tokens';

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const passwordRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<AuthFormErrors>({ fields: {} });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setErrors({ fields: {} });
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace('/(tabs)/practice');
    } catch (error) {
      setPassword('');
      setErrors(getAuthFormErrors(error));
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="Easy Meditation"
      subtitle="继续你的今日练习，呼吸会带你回到安静里。"
      title="欢迎回来"
    >
      <View style={styles.fields}>
        <AuthTextField
          autoCapitalize="none"
          autoComplete="email"
          editable={!isSubmitting}
          error={errors.fields.email}
          keyboardType="email-address"
          label="邮箱"
          name="email"
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@example.com"
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="emailAddress"
          value={email}
        />
        <AuthTextField
          autoComplete="password"
          editable={!isSubmitting}
          error={errors.fields.password}
          label="密码"
          name="password"
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          placeholder="输入你的密码"
          ref={passwordRef}
          returnKeyType="done"
          secureTextEntry
          submitBehavior="blurAndSubmit"
          textContentType="password"
          value={password}
        />
      </View>

      <View style={styles.actions} testID="login-actions">
        {errors.form ? (
          <AppText
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="login-form-error"
            tone="danger"
            variant="meta"
          >
            {errors.form}
          </AppText>
        ) : null}
        <PrototypeButton
          label={isSubmitting ? '登录中...' : '登录'}
          loading={isSubmitting}
          onPress={() => void submit()}
          style={styles.primaryAction}
        />
        <Link href="/(auth)/register" style={styles.link}>
          创建新账号
        </Link>
      </View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.md
  },
  actions: {
    gap: spacing.sm
  },
  primaryAction: {
    borderRadius: radii.md,
    minHeight: 54
  },
  link: {
    alignSelf: 'stretch',
    color: colors.teal,
    fontFamily: fontFamilies.body,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    minHeight: 44,
    paddingVertical: 12,
    textAlign: 'center'
  }
});
