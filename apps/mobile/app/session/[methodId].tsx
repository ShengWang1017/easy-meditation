import { useCallback, useMemo } from 'react';
import type { BreathingMethod } from '@easy-meditation/shared';
import { secondsToTimerLabel } from '@easy-meditation/shared';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { fetchBreathingMethods } from '../../src/api/methods';
import { useSessionAudio } from '../../src/audio/useSessionAudio';
import { useAuthSession } from '../../src/auth/AuthSessionBoundary';
import { AppText } from '../../src/components/AppText';
import { BreathingCanvas } from '../../src/components/BreathingCanvas';
import { InlineState } from '../../src/components/InlineState';
import { PrototypeButton } from '../../src/components/PrototypeButton';
import { PrototypeIconButton } from '../../src/components/PrototypeIconButton';
import { PrototypeScreen } from '../../src/components/PrototypeScreen';
import { SessionExitDialog } from '../../src/components/SessionExitDialog';
import { toCustomBreathingMethod } from '../../src/domain/customRhythm';
import {
  getMethodDisplayTitle,
  type BuiltInMethodId
} from '../../src/domain/methodPresentation';
import type { LocalSessionLedgerEntry } from '../../src/domain/sessionLedger';
import type { ResolvedSessionMethod } from '../../src/domain/sessionRecord';
import { useFocusSession } from '../../src/hooks/useFocusSession';
import { useSessionExitGuard } from '../../src/hooks/useSessionExitGuard';
import { publicQueryKeys } from '../../src/query/keys';
import { usePreferencesStore } from '../../src/store/PreferencesStoreProvider';
import { referenceImages, referenceSoundIcons } from '../../src/theme/assets';
import { colors, layout, radii, spacing } from '../../src/theme/tokens';

const BUILT_IN_IDS = new Set<BuiltInMethodId>([
  'box',
  'four-seven-eight',
  'coherent'
]);

type SessionMethodBundle = {
  resolved: ResolvedSessionMethod;
  clockMethod: BreathingMethod;
  rhythmLabel: string;
};

export default function SessionScreen() {
  const params = useLocalSearchParams<{
    methodId?: string | string[];
  }>();
  const routeMethodId = Array.isArray(params.methodId)
    ? params.methodId[0]
    : params.methodId;
  const customRhythm = usePreferencesStore((state) => state.customRhythm);
  const durationOverrides = usePreferencesStore(
    (state) => state.durationOverrides
  );
  const methodsQuery = useQuery({
    queryKey: publicQueryKeys.methods,
    queryFn: fetchBreathingMethods,
    enabled: routeMethodId !== 'custom'
  });
  const bundle = useMemo<SessionMethodBundle | null>(() => {
    if (routeMethodId === 'custom') {
      const clockMethod = toCustomBreathingMethod(customRhythm);
      return {
        clockMethod,
        resolved: {
          id: 'custom',
          title: '自定义',
          phases: clockMethod.phases,
          plannedDurationSeconds: customRhythm.durationMinutes * 60,
          origin: 'custom'
        },
        rhythmLabel: `${customRhythm.inhaleSeconds}-${customRhythm.holdSeconds}-${customRhythm.exhaleSeconds}`
      };
    }

    if (!routeMethodId || !BUILT_IN_IDS.has(routeMethodId as BuiltInMethodId)) {
      return null;
    }
    const id = routeMethodId as BuiltInMethodId;
    const clockMethod = methodsQuery.data?.find((method) => method.id === id);
    if (!clockMethod) return null;
    const durationMinutes =
      durationOverrides[id] ?? clockMethod.defaultDurationSeconds / 60;
    return {
      clockMethod,
      resolved: {
        id,
        title: getMethodDisplayTitle(id) ?? clockMethod.title,
        phases: clockMethod.phases,
        plannedDurationSeconds: durationMinutes * 60,
        origin: 'built_in'
      },
      rhythmLabel: clockMethod.phases
        .map((phase) => phase.durationSeconds)
        .join('-')
    };
  }, [customRhythm, durationOverrides, methodsQuery.data, routeMethodId]);

  if (
    routeMethodId !== 'custom' &&
    methodsQuery.isPending &&
    !methodsQuery.data
  ) {
    return (
      <FocusState>
        <InlineState kind="loading" message="正在准备练习…" />
      </FocusState>
    );
  }

  if (!bundle) {
    const loadFailure = routeMethodId !== 'custom' && methodsQuery.isError;
    return (
      <FocusState>
        <InlineState
          actionLabel="返回练习页"
          kind="error"
          message={
            loadFailure
              ? '请检查网络后再试一次。'
              : '请回到练习页重新选择一种方法。'
          }
          onAction={() => router.replace('/(tabs)/practice')}
          title={loadFailure ? '暂时无法加载练习' : '没有找到这项练习'}
        />
      </FocusState>
    );
  }

  return (
    <FocusSessionView
      bundle={bundle}
      key={routeMethodId}
    />
  );
}

function FocusState({ children }: { children: React.ReactNode }) {
  return (
    <PrototypeScreen
      backgroundVariant="focus"
      contentStyle={styles.centerState}
      testID="focus-screen"
    >
      {children}
    </PrototypeScreen>
  );
}

function FocusSessionView({ bundle }: { bundle: SessionMethodBundle }) {
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();
  const { preferencesStore, sessionOutbox } = useAuthSession();
  const soundEnabled = usePreferencesStore((state) => state.soundEnabled);
  const setSoundEnabled = usePreferencesStore((state) => state.setSoundEnabled);
  const putLedgerEntry = useCallback(
    (entry: LocalSessionLedgerEntry) =>
      preferencesStore.getState().putLedgerEntry(entry),
    [preferencesStore]
  );
  const audio = useSessionAudio({
    preferenceEnabled: soundEnabled,
    setPreferenceEnabled: setSoundEnabled
  });
  const controller = useFocusSession({
    method: bundle.resolved,
    clockMethod: bundle.clockMethod,
    putLedgerEntry,
    outbox: sessionOutbox,
    audio
  });
  const exitGuard = useSessionExitGuard({
    snapshot: controller.snapshot,
    controlsUnlocked: controller.controlsUnlocked,
    isPersisting: controller.isPersisting,
    persistenceError: controller.persistenceError,
    persistIntentionalEnd: controller.persistIntentionalEnd,
    retryPersistence: controller.retryPersistence,
    navigation
  });
  const { snapshot } = controller;
  const isReady = snapshot.status === 'idle';
  const isCompleted = snapshot.status === 'completed';
  const phase = bundle.resolved.phases[snapshot.phase.phaseIndex];
  const phaseDurationMs = (phase?.durationSeconds ?? 1) * 1_000;
  const durationMinutes = bundle.resolved.plannedDurationSeconds / 60;
  const SoundIcon = audio.enabled
    ? referenceSoundIcons.on
    : referenceSoundIcons.off;

  return (
    <PrototypeScreen
      backgroundVariant="focus"
      contentStyle={styles.screenContent}
      testID="focus-screen"
    >
      <View
        accessibilityLabel={bundle.resolved.title}
        style={styles.session}
        testID="focus-session"
      >
        {isReady ? (
          <PrototypeIconButton
            accessibilityLabel="返回"
            onPress={() => navigation.goBack()}
            source={referenceImages.back}
            style={styles.backButton}
          />
        ) : null}

        <Pressable
          accessibilityLabel={audio.enabled ? '关闭声音' : '打开声音'}
          accessibilityRole="button"
          accessibilityState={{ checked: audio.enabled }}
          hitSlop={8}
          onPress={() => void audio.toggle().catch(() => undefined)}
          style={[styles.soundButton, audio.enabled ? null : styles.soundMuted]}
        >
          <SoundIcon height={30} width={30} />
        </Pressable>

        <View style={styles.phaseReadout}>
          <AppText
            accessibilityLiveRegion={isReady ? undefined : 'polite'}
            style={styles.phaseLabel}
            variant="displayHero"
          >
            {isReady ? '准备' : isCompleted ? '完成' : snapshot.phase.label}
          </AppText>
          {isReady ? (
            <AppText style={styles.rhythmLabel}>{bundle.rhythmLabel}</AppText>
          ) : isCompleted ? null : (
            <AppText systemFont style={styles.phaseCount}>
              {snapshot.phase.remainingInPhase}
            </AppText>
          )}
        </View>

        <View style={styles.stage}>
          <BreathingCanvas
            phaseDurationMs={phaseDurationMs}
            phaseIndex={snapshot.phase.phaseIndex}
            phaseKind={snapshot.phase.kind}
            phaseProgress={snapshot.phase.phaseProgress}
            phases={bundle.resolved.phases}
            reducedMotion={reducedMotion}
            status={snapshot.status}
          />
        </View>

        <View style={styles.timerBlock}>
          <AppText systemFont style={styles.timerValue} variant="timer">
            {isReady
              ? `${durationMinutes} 分钟`
              : isCompleted
                ? '完成'
                : secondsToTimerLabel(snapshot.remainingSeconds)}
          </AppText>
          <AppText numberOfLines={1} style={styles.timerTitle} tone="muted">
            {bundle.resolved.title}
          </AppText>
        </View>

        {audio.note ? (
          <AppText accessibilityLiveRegion="polite" style={styles.note} tone="muted">
            {audio.note}
          </AppText>
        ) : null}
        {controller.persistenceError ? (
          <View style={styles.persistenceError}>
            <AppText accessibilityLiveRegion="assertive" tone="danger">
              {controller.persistenceError}
            </AppText>
            <PrototypeButton
              label="重试保存"
              loading={controller.isPersisting}
              onPress={() => void controller.retryPersistence().catch(() => undefined)}
              variant="quiet"
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          {isReady ? (
            <PrototypeButton
              label="开始"
              onPress={controller.start}
              style={styles.startButton}
              variant="quiet"
            />
          ) : (
            <>
              <PrototypeButton
                disabled={isCompleted && !controller.controlsUnlocked}
                label={
                  isCompleted
                    ? '再来一次'
                    : snapshot.status === 'running'
                      ? '暂停'
                      : '继续'
                }
                loading={isCompleted && controller.isPersisting}
                onPress={
                  isCompleted
                    ? () => void controller.replay()
                    : snapshot.status === 'running'
                      ? controller.pause
                      : controller.resume
                }
                style={styles.primaryAction}
                variant="quiet"
              />
              <PrototypeButton
                disabled={isCompleted && !controller.controlsUnlocked}
                label="结束训练"
                onPress={() => void exitGuard.requestExplicitEnd().catch(() => undefined)}
                style={styles.endAction}
                variant="quiet"
              />
            </>
          )}
        </View>
      </View>

      <SessionExitDialog
        error={controller.persistenceError}
        isPersisting={controller.isPersisting}
        onContinue={exitGuard.continueSession}
        onEnd={() => void exitGuard.endAndLeave().catch(() => undefined)}
        onRetry={() => void exitGuard.retryAndLeave().catch(() => undefined)}
        visible={exitGuard.dialogVisible}
      />
    </PrototypeScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    overflow: 'hidden',
    paddingHorizontal: 0
  },
  session: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: layout.compactScreenGutter,
    paddingTop: 62,
    position: 'relative'
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl
  },
  backButton: {
    left: 18,
    position: 'absolute',
    top: 18
  },
  soundButton: {
    alignItems: 'center',
    height: layout.touchTarget,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
    minWidth: layout.touchTarget,
    position: 'absolute',
    right: 18,
    top: 54,
    width: layout.touchTarget,
    zIndex: 2
  },
  soundMuted: {
    opacity: 0.58
  },
  phaseReadout: {
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: 46,
    minHeight: 82
  },
  phaseLabel: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '500',
    lineHeight: 38,
    textAlign: 'center'
  },
  rhythmLabel: {
    color: 'rgba(34, 39, 47, 0.58)',
    fontSize: 18,
    lineHeight: 22
  },
  phaseCount: {
    color: 'rgba(34, 39, 47, 0.72)',
    fontSize: 25,
    lineHeight: 28,
    fontVariant: ['tabular-nums']
  },
  stage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 326,
    paddingBottom: 8,
    width: '100%'
  },
  timerBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 20
  },
  timerValue: {
    color: colors.ink,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 36
  },
  timerTitle: {
    fontSize: 15,
    maxWidth: '100%'
  },
  note: {
    fontSize: 12,
    marginBottom: spacing.xs,
    textAlign: 'center'
  },
  persistenceError: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  actions: {
    alignItems: 'stretch',
    gap: spacing.sm,
    maxWidth: 300,
    width: '100%'
  },
  startButton: {
    alignSelf: 'center',
    backgroundColor: 'rgba(222, 222, 237, 0.72)',
    borderRadius: 29,
    minHeight: 58,
    width: 260
  },
  primaryAction: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    borderColor: 'rgba(255, 255, 255, 0.58)',
    borderRadius: 20,
    borderWidth: 1,
    minHeight: layout.touchTarget,
    paddingHorizontal: 22
  },
  endAction: {
    backgroundColor: 'rgba(222, 222, 237, 0.76)',
    borderColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: 36,
    borderWidth: 1,
    minHeight: 58
  }
});
