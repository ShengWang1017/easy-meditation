import { useState } from 'react';
import { Link, router } from 'expo-router';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { Screen } from '../../src/components/Screen';
import { useAuthStore } from '../../src/store/authStore';
import { colors, radii, shadowSoft, spacing } from '../../src/theme/tokens';

const DANDELION = require('../../assets/reference-style/dandelion-card.png');

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (isSubmitting) {
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace('/(tabs)/practice');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请再试一次。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen scrollable>
      <View style={styles.form}>
        <View style={styles.header}>
          <Image source={DANDELION} style={styles.logo} resizeMode="contain" />
          <Text style={styles.eyebrow}>Easy Meditation</Text>
          <Text style={styles.title}>欢迎回来</Text>
          <Text style={styles.subtitle}>继续你的今日练习，呼吸会带你回到安静里。</Text>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>邮箱</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={email}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>密码</Text>
          <TextInput
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="输入你的密码"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            value={password}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={submit} style={[styles.button, isSubmitting && styles.buttonDisabled]}>
          <Text style={styles.buttonLabel}>{isSubmitting ? '登录中...' : '登录'}</Text>
        </Pressable>

        <Link href="/(auth)/register" style={styles.link}>
          创建新账号
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg
  },
  header: {
    gap: spacing.sm
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    marginBottom: spacing.sm
  },
  eyebrow: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '600'
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  },
  fieldGroup: {
    gap: spacing.sm
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '600'
  },
  input: {
    minHeight: 56,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: spacing.md,
    color: colors.ink,
    ...shadowSoft
  },
  error: {
    color: colors.danger,
    fontSize: 14
  },
  button: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700'
  },
  link: {
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center'
  }
});
