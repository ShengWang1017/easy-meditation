import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchBreathingMethods } from '../../src/api/methods';
import type { SessionClockSnapshot } from '../../src/domain/sessionClock';
import { createSessionClock } from '../../src/domain/sessionClock';
import { Screen } from '../../src/components/Screen';
import { colors, spacing } from '../../src/theme/tokens';

export default function SessionScreen() {
  const { methodId } = useLocalSearchParams<{ methodId: string }>();
  const methodsQuery = useQuery({
    queryKey: ['breathing-methods'],
    queryFn: fetchBreathingMethods
  });
  const method = methodsQuery.data?.find((item) => item.id === methodId);
  const clock = useMemo(() => {
    if (!method) {
      return null;
    }

    return createSessionClock(method, method.defaultDurationSeconds);
  }, [method?.defaultDurationSeconds, method?.id]);
  const [snapshot, setSnapshot] = useState<SessionClockSnapshot | null>(null);

  useEffect(() => {
    if (!clock) {
      setSnapshot(null);
      return;
    }

    const currentSnapshot = clock.snapshot();
    setSnapshot(currentSnapshot);

    if (currentSnapshot.status !== 'running') {
      return;
    }

    const timer = setInterval(() => {
      setSnapshot(clock.snapshot());
    }, 250);

    return () => clearInterval(timer);
  }, [clock, snapshot?.status]);

  if (methodsQuery.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentStrong} size="large" />
          <Text style={styles.helperText}>正在准备练习...</Text>
        </View>
      </Screen>
    );
  }

  if (methodsQuery.isError) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.title}>暂时无法加载练习</Text>
          <Text style={styles.helperText}>请检查网络后再试一次。</Text>
          <ActionButton label="返回练习页" onPress={() => router.replace('/(tabs)/practice')} />
        </View>
      </Screen>
    );
  }

  if (!method || !clock || !snapshot) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.title}>没有找到这项练习</Text>
          <Text style={styles.helperText}>请回到练习页重新选择一个方法。</Text>
          <ActionButton label="返回练习页" onPress={() => router.replace('/(tabs)/practice')} />
        </View>
      </Screen>
    );
  }

  const activeClock = clock;

  function handleStart() {
    activeClock.start();
    setSnapshot(activeClock.snapshot());
  }

  function handlePause() {
    activeClock.pause();
    setSnapshot(activeClock.snapshot());
  }

  function handleResume() {
    activeClock.resume();
    setSnapshot(activeClock.snapshot());
  }

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.methodTitle}>{method.title}</Text>
          <Text style={styles.methodSubtitle}>{method.subtitle}</Text>
        </View>

        <View style={styles.timerPanel}>
          <Text style={styles.phaseLabel}>{snapshot.phase.label}</Text>
          <Text style={styles.phaseCountdown}>{snapshot.phase.remainingInPhase} 秒</Text>
          <View style={styles.orb} />
          <Text style={styles.totalTimer}>{secondsToTimerLabel(snapshot.remainingSeconds)}</Text>
          <Text style={styles.progressText}>
            已练习 {secondsToTimerLabel(snapshot.elapsedSeconds)}
          </Text>
        </View>

        <View style={styles.actions}>
          {snapshot.status === 'idle' ? (
            <ActionButton label="开始练习" onPress={handleStart} />
          ) : null}
          {snapshot.status === 'running' ? <ActionButton label="暂停" onPress={handlePause} /> : null}
          {snapshot.status === 'paused' ? <ActionButton label="继续" onPress={handleResume} /> : null}
          {snapshot.status === 'completed' ? (
            <ActionButton label="完成" onPress={() => router.replace('/(tabs)/practice')} />
          ) : null}
          <ActionButton
            label={snapshot.status === 'completed' ? '回到练习页' : '结束并返回'}
            onPress={() => router.back()}
            tone="secondary"
          />
        </View>
      </View>
    </Screen>
  );
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary';
};

function ActionButton({ label, onPress, tone = 'primary' }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' ? styles.secondaryButton : styles.primaryButton,
        pressed ? styles.buttonPressed : null
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          tone === 'secondary' ? styles.secondaryButtonText : styles.primaryButtonText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    gap: spacing.xl
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  header: {
    gap: spacing.sm
  },
  methodTitle: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center'
  },
  methodSubtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  timerPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md
  },
  phaseLabel: {
    color: colors.ink,
    fontSize: 42,
    fontWeight: '700'
  },
  phaseCountdown: {
    color: colors.muted,
    fontSize: 20
  },
  orb: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: colors.lilac,
    borderWidth: 10,
    borderColor: 'rgba(255, 255, 255, 0.45)'
  },
  totalTimer: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: '700'
  },
  progressText: {
    color: colors.muted,
    fontSize: 15
  },
  actions: {
    gap: spacing.md
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center'
  },
  helperText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  button: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg
  },
  primaryButton: {
    backgroundColor: colors.accentStrong
  },
  secondaryButton: {
    backgroundColor: colors.surfaceStrong,
    borderWidth: 1,
    borderColor: colors.tabBorder
  },
  buttonPressed: {
    opacity: 0.85
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700'
  },
  primaryButtonText: {
    color: colors.surfaceStrong
  },
  secondaryButtonText: {
    color: colors.ink
  }
});
