import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { fetchBreathingMethods } from '../../src/api/methods';
import {
  buildCompletedPracticeSessionInput,
  createPracticeSession
} from '../../src/api/sessions';
import { BreathingOrb } from '../../src/components/BreathingOrb';
import { Screen } from '../../src/components/Screen';
import type { SessionClockSnapshot } from '../../src/domain/sessionClock';
import { createSessionClock } from '../../src/domain/sessionClock';
import { colors, methodTint, radii, spacing } from '../../src/theme/tokens';

function orbScaleFor(snapshot: SessionClockSnapshot): number {
  if (snapshot.status !== 'running') {
    return 0.82;
  }

  const progress = Math.max(0, Math.min(1, snapshot.phase.phaseProgress));
  switch (snapshot.phase.kind) {
    case 'inhale':
      return 0.72 + 0.3 * progress;
    case 'exhale':
      return 1.02 - 0.3 * progress;
    case 'hold':
      return 1.02;
    default:
      return 0.85;
  }
}

export default function SessionScreen() {
  const { methodId } = useLocalSearchParams<{ methodId: string }>();
  const queryClient = useQueryClient();
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
  const activeSnapshot = snapshot ?? (clock ? clock.snapshot() : null);
  const startedAtRef = useRef<string | null>(null);
  const clientSessionIdRef = useRef(Crypto.randomUUID());
  const submittedRef = useRef(false);
  const submitSessionMutation = useMutation({
    mutationFn: createPracticeSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['stats-summary'] });
    }
  });

  useEffect(() => {
    startedAtRef.current = null;
    clientSessionIdRef.current = Crypto.randomUUID();
    submittedRef.current = false;
  }, [method?.id]);

  useEffect(() => {
    if (!clock) {
      setSnapshot(null);
      return;
    }

    setSnapshot(clock.snapshot());
  }, [clock]);

  useEffect(() => {
    if (!clock || activeSnapshot?.status !== 'running') {
      return;
    }

    const timer = setInterval(() => {
      setSnapshot(clock.snapshot());
    }, 250);

    return () => clearInterval(timer);
  }, [activeSnapshot?.status, clock]);

  useEffect(() => {
    if (!method || !activeSnapshot || activeSnapshot.status !== 'completed' || submittedRef.current) {
      return;
    }

    submittedRef.current = true;

    const endedAt = new Date().toISOString();
    const startedAt =
      startedAtRef.current ??
      new Date(Date.now() - activeSnapshot.elapsedSeconds * 1_000).toISOString();

    void submitSessionMutation.mutateAsync(
      buildCompletedPracticeSessionInput({
        clientSessionId: clientSessionIdRef.current,
        method,
        actualDurationSeconds: activeSnapshot.elapsedSeconds,
        startedAt,
        endedAt
      })
    );
  }, [activeSnapshot, method, submitSessionMutation]);

  if (methodsQuery.isLoading && !method) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentStrong} size="large" />
          <Text style={styles.helperText}>正在准备练习...</Text>
        </View>
      </Screen>
    );
  }

  if (!method || !clock) {
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

    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.title}>没有找到这项练习</Text>
          <Text style={styles.helperText}>请回到练习页重新选择一种方法。</Text>
          <ActionButton label="返回练习页" onPress={() => router.replace('/(tabs)/practice')} />
        </View>
      </Screen>
    );
  }

  if (!activeSnapshot) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accentStrong} size="large" />
          <Text style={styles.helperText}>正在准备练习...</Text>
        </View>
      </Screen>
    );
  }

  const activeClock = clock;

  function handleStart() {
    startedAtRef.current = new Date().toISOString();
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.methodTitle}>{method.title}</Text>
          <Text style={styles.methodSubtitle}>{method.subtitle}</Text>
        </View>

        <View style={styles.timerPanel}>
          <Text style={styles.phaseLabel}>{activeSnapshot.phase.label}</Text>
          <Text style={styles.phaseCountdown}>{activeSnapshot.phase.remainingInPhase} 秒</Text>
          <BreathingOrb
            scaleTarget={orbScaleFor(activeSnapshot)}
            active={activeSnapshot.status === 'running'}
            glow={methodTint(method.id).glow}
          />
          <Text style={styles.totalTimer}>
            {secondsToTimerLabel(activeSnapshot.remainingSeconds)}
          </Text>
          <Text style={styles.progressText}>
            已练习 {secondsToTimerLabel(activeSnapshot.elapsedSeconds)}
          </Text>
          {activeSnapshot.status === 'completed' ? (
            <Text
              style={[
                styles.submitStatus,
                submitSessionMutation.isError ? styles.submitStatusError : null
              ]}
            >
              {submitSessionMutation.isPending
                ? '正在同步练习记录...'
                : submitSessionMutation.isSuccess
                  ? '练习记录已保存'
                  : submitSessionMutation.isError
                    ? '练习已完成，记录提交失败'
                    : '练习已完成'}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {activeSnapshot.status === 'idle' ? (
            <ActionButton label="开始练习" onPress={handleStart} />
          ) : null}
          {activeSnapshot.status === 'running' ? (
            <ActionButton label="暂停" onPress={handlePause} />
          ) : null}
          {activeSnapshot.status === 'paused' ? (
            <ActionButton label="继续" onPress={handleResume} />
          ) : null}
          {activeSnapshot.status === 'completed' ? (
            <ActionButton label="完成" onPress={() => router.replace('/(tabs)/practice')} />
          ) : null}
          <ActionButton
            label={activeSnapshot.status === 'completed' ? '回到练习页' : '结束并返回'}
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
  backButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)'
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
  submitStatus: {
    color: colors.accentStrong,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center'
  },
  submitStatusError: {
    color: '#b75b52'
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
