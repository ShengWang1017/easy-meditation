import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchBreathingMethods } from '../../src/api/methods';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

export default function PracticeScreen() {
  const methodsQuery = useQuery({
    queryKey: ['breathing-methods'],
    queryFn: fetchBreathingMethods
  });
  const methods = methodsQuery.data ?? [];

  if (methodsQuery.isLoading && methods.length === 0) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={colors.accentStrong} size="large" />
          <Text style={styles.stateText}>正在加载练习方法...</Text>
        </View>
      </Screen>
    );
  }

  if (methodsQuery.isError && methods.length === 0) {
    return (
      <Screen>
        <View style={styles.state}>
          <Text style={styles.title}>练习方法暂时不可用</Text>
          <Text style={styles.description}>请检查网络连接后，重新加载列表。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void methodsQuery.refetch()}
            style={({ pressed }) => [styles.retryButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.retryButtonText}>重新加载</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (methods.length === 0) {
    return (
      <Screen>
        <View style={styles.state}>
          <Text style={styles.title}>还没有可用的练习方法</Text>
          <Text style={styles.description}>稍后再来看看，或确认后端服务已经启动。</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.kicker}>今日练习</Text>
        <Text style={styles.title}>选择一种呼吸节奏</Text>
        <Text style={styles.description}>
          先进入一个安静、明确的练习流程。开始后会进入本地专注计时，不会在这一步提交记录。
        </Text>
      </View>

      {methodsQuery.isError ? (
        <View style={styles.warning}>
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>列表更新失败</Text>
            <Text style={styles.warningText}>已显示上次加载的练习方法，可稍后重试。</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => void methodsQuery.refetch()}
            style={({ pressed }) => [styles.warningButton, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.warningButtonText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.grid}>
        {methods.map((method) => (
          <Pressable
            key={method.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: '/session/[methodId]',
                params: { methodId: method.id }
              })
            }
            style={({ pressed }) => [styles.card, pressed ? styles.buttonPressed : null]}
          >
            <Text style={styles.cardTitle}>{method.title}</Text>
            <Text style={styles.cardSubtitle}>{method.subtitle}</Text>
            <Text style={styles.duration}>
              默认 {Math.round(method.defaultDurationSeconds / 60)} 分钟
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md
  },
  kicker: {
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '600'
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '700'
  },
  description: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  },
  grid: {
    marginTop: spacing.xl,
    gap: spacing.md
  },
  warning: {
    marginTop: spacing.xl,
    gap: spacing.md,
    borderRadius: 20,
    padding: spacing.lg,
    backgroundColor: 'rgba(188, 126, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(188, 126, 72, 0.24)'
  },
  warningCopy: {
    gap: spacing.xs
  },
  warningTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700'
  },
  warningText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  warningButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceStrong
  },
  warningButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700'
  },
  card: {
    minHeight: 140,
    justifyContent: 'space-between',
    borderRadius: 24,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)'
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700'
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  duration: {
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: '700'
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  stateText: {
    color: colors.muted,
    fontSize: 15
  },
  retryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentStrong
  },
  retryButtonText: {
    color: colors.surfaceStrong,
    fontSize: 16,
    fontWeight: '700'
  },
  buttonPressed: {
    opacity: 0.86
  }
});
