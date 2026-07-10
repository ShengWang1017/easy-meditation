import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ImageSourcePropType } from 'react-native';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BreathingMethod } from '@easy-meditation/shared';
import { fetchBreathingMethods } from '../../src/api/methods';
import { Screen } from '../../src/components/Screen';
import { colors, methodTint, radii, shadowSoft, spacing, type } from '../../src/theme/tokens';

const PETALS: Record<string, ImageSourcePropType> = {
  box: require('../../assets/reference-style/petal-box.png'),
  'four-seven-eight': require('../../assets/reference-style/petal-sleep.png'),
  coherent: require('../../assets/reference-style/petal-focus.png')
};
const DANDELION = require('../../assets/reference-style/dandelion-card.png') as ImageSourcePropType;

function rhythmDigits(method: BreathingMethod): string {
  return method.phases.map((phase) => phase.durationSeconds).join('-');
}

function MethodCard({ method }: { method: BreathingMethod }) {
  const tint = methodTint(method.id);
  const petal = PETALS[method.id];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/session/[methodId]', params: { methodId: method.id } })
      }
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tint.bg, borderColor: tint.border },
        pressed ? styles.cardPressed : null
      ]}
    >
      {petal ? (
        <Image source={petal} style={styles.petal} resizeMode="contain" />
      ) : null}
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{method.title}</Text>
        <Text style={styles.cardRhythm}>{rhythmDigits(method)}</Text>
      </View>
      <View style={styles.cardFooter}>
        {tint.mood ? (
          <View style={styles.moodPill}>
            <Text style={styles.moodText}>{tint.mood}</Text>
          </View>
        ) : (
          <View />
        )}
        <Text style={styles.duration}>{Math.round(method.defaultDurationSeconds / 60)} 分钟</Text>
      </View>
    </Pressable>
  );
}

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
    <Screen scrollable>
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
          <MethodCard key={method.id} method={method} />
        ))}
      </View>

      <View style={styles.beforeCard}>
        <View style={styles.beforeCopy}>
          <Text style={styles.beforeTitle}>在您开始前</Text>
          <Text style={styles.beforeText}>了解每项呼吸训练的原理，几次呼吸就能回到平静。</Text>
        </View>
        <Image source={DANDELION} style={styles.beforeImage} resizeMode="contain" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  kicker: {
    ...type.label,
    color: colors.accentStrong
  },
  title: {
    ...type.hero,
    color: colors.ink
  },
  description: {
    ...type.body,
    color: colors.muted
  },
  grid: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  card: {
    width: '47.5%',
    minHeight: 172,
    justifyContent: 'space-between',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadowSoft
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }]
  },
  petal: {
    position: 'absolute',
    right: -18,
    bottom: -14,
    width: 128,
    height: 128,
    opacity: 0.55
  },
  cardTop: {
    gap: spacing.xs
  },
  cardTitle: {
    ...type.cardTitle,
    color: colors.ink
  },
  cardRhythm: {
    ...type.meta,
    color: colors.accentStrong,
    letterSpacing: 1
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  moodPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.6)'
  },
  moodText: {
    ...type.meta,
    color: colors.accent
  },
  duration: {
    ...type.label,
    color: colors.accentStrong
  },
  beforeCard: {
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    ...shadowSoft
  },
  beforeCopy: {
    flex: 1,
    gap: spacing.xs
  },
  beforeTitle: {
    ...type.section,
    color: colors.ink
  },
  beforeText: {
    ...type.meta,
    color: colors.muted,
    lineHeight: 20
  },
  beforeImage: {
    width: 72,
    height: 72,
    borderRadius: radii.md
  },
  warning: {
    marginTop: spacing.xl,
    gap: spacing.md,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: 'rgba(188, 126, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(188, 126, 72, 0.24)'
  },
  warningCopy: {
    gap: spacing.xs
  },
  warningTitle: {
    ...type.label,
    color: colors.ink
  },
  warningText: {
    ...type.meta,
    color: colors.muted
  },
  warningButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceStrong
  },
  warningButtonText: {
    ...type.label,
    color: colors.accentStrong
  },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  stateText: {
    ...type.body,
    color: colors.muted
  },
  retryButton: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentStrong
  },
  retryButtonText: {
    ...type.body,
    fontWeight: '700',
    color: colors.surfaceStrong
  },
  buttonPressed: {
    opacity: 0.86
  }
});
