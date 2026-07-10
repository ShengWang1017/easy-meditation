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

export default function RegisterScreen() {
  const register = useAuthStore((state) => state.register);
  const nicknameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
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
      const trimmedNickname = nickname.trim();
      await register({
        email,
        nickname: trimmedNickname || undefined,
        password
      });
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
      eyebrow="开始新的呼吸节奏"
      subtitle="账号建好后，练习记录和设置就能跟着你一起走。"
      title="创建账号"
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
          onSubmitEditing={() => nicknameRef.current?.focus()}
          placeholder="you@example.com"
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="emailAddress"
          value={email}
        />
        <AuthTextField
          autoCapitalize="words"
          autoComplete="name"
          editable={!isSubmitting}
          error={errors.fields.nickname}
          label="昵称，可不填"
          name="nickname"
          onChangeText={setNickname}
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="怎么称呼你"
          ref={nicknameRef}
          returnKeyType="next"
          submitBehavior="submit"
          textContentType="nickname"
          value={nickname}
        />
        <AuthTextField
          autoComplete="new-password"
          editable={!isSubmitting}
          error={errors.fields.password}
          label="密码"
          name="password"
          onChangeText={setPassword}
          onSubmitEditing={() => void submit()}
          placeholder="至少 8 位"
          ref={passwordRef}
          returnKeyType="done"
          secureTextEntry
          submitBehavior="blurAndSubmit"
          textContentType="newPassword"
          value={password}
        />
      </View>

      <View style={styles.actions} testID="register-actions">
        {errors.form ? (
          <AppText
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="register-form-error"
            tone="danger"
            variant="meta"
          >
            {errors.form}
          </AppText>
        ) : null}
        <PrototypeButton
          label={isSubmitting ? '提交中...' : '注册并开始'}
          loading={isSubmitting}
          onPress={() => void submit()}
          style={styles.primaryAction}
        />
        <Link href="/(auth)/login" style={styles.link}>
          已有账号，去登录
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
