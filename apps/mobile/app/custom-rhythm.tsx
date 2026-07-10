import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { PrototypeButton } from '../src/components/PrototypeButton';
import { PrototypeIconButton } from '../src/components/PrototypeIconButton';
import { PrototypeScreen } from '../src/components/PrototypeScreen';
import { ScrollWheelPicker } from '../src/components/ScrollWheelPicker';
import type { CustomDurationMinutes } from '../src/domain/customRhythm';
import { useVisualQaRegistration } from '../src/qa/VisualQaReporter';
import { usePreferencesStore } from '../src/store/PreferencesStoreProvider';
import { referenceImages } from '../src/theme/assets';
import { colors, shadows } from '../src/theme/tokens';

const PHASE_SECONDS = Array.from({ length: 12 }, (_, index) => index + 1);
const CYCLE_SECONDS = Array.from({ length: 34 }, (_, index) => index + 3);
const DURATION_MINUTES = [2, 3, 5, 10] as const;
type CustomPhase = 'inhaleSeconds' | 'holdSeconds' | 'exhaleSeconds';

export default function CustomRhythmScreen() {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const customRhythm = usePreferencesStore((state) => state.customRhythm);
  const customRhythmSaveError = usePreferencesStore(
    (state) => state.customRhythmSaveError
  );
  const setCustomPhase = usePreferencesStore((state) => state.setCustomPhase);
  const setCustomCycleSeconds = usePreferencesStore(
    (state) => state.setCustomCycleSeconds
  );
  const setCustomDuration = usePreferencesStore(
    (state) => state.setCustomDuration
  );
  const waitForCustomRhythmSave = usePreferencesStore(
    (state) => state.waitForCustomRhythmSave
  );
  const retryCustomRhythmSave = usePreferencesStore(
    (state) => state.retryCustomRhythmSave
  );
  const [pendingNavigation, setPendingNavigation] = useState<
    'back' | 'start' | null
  >(null);
  const [retryPending, setRetryPending] = useState(false);
  const headerQa = useVisualQaRegistration('custom-settings-header');
  const panelQa = useVisualQaRegistration('custom-panel');
  const cycleRowQa = useVisualQaRegistration('custom-cycle-row');
  const wheelGridQa = useVisualQaRegistration('custom-wheel-grid');
  const targetRowQa = useVisualQaRegistration('custom-target-row');
  const cycleSeconds =
    customRhythm.inhaleSeconds +
    customRhythm.holdSeconds +
    customRhythm.exhaleSeconds;

  async function navigateAfterSave(
    destination: 'back' | 'start',
    navigate: () => void
  ) {
    if (pendingNavigation) return;
    setPendingNavigation(destination);
    try {
      await waitForCustomRhythmSave();
      setPendingNavigation(null);
      navigate();
    } catch {
      // The store exposes a retryable error and restores the durable rhythm.
      setPendingNavigation(null);
    }
  }

  function goBack() {
    void navigateAfterSave('back', () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/practice');
      }
    });
  }

  function startCustomSession() {
    void navigateAfterSave('start', () => {
      router.push({
        pathname: '/session/[methodId]',
        params: { methodId: 'custom' }
      });
    });
  }

  async function retrySave() {
    if (retryPending) return;
    setRetryPending(true);
    try {
      await retryCustomRhythmSave();
    } catch {
      // Keep the retry affordance visible for another attempt.
    } finally {
      setRetryPending(false);
    }
  }

  function changePhase(phase: CustomPhase, value: number): Promise<void> {
    return setCustomPhase(phase, value);
  }

  function changeDuration(value: number): Promise<void> {
    return isCustomDuration(value)
      ? setCustomDuration(value)
      : Promise.resolve();
  }

  return (
    <PrototypeScreen
      backgroundVariant="custom"
      contentStyle={[
        styles.content,
        compact ? styles.contentCompact : null
      ]}
      nestedScrollEnabled
      scrollable
      testID="custom-screen"
    >
      <View
        collapsable={false}
        nativeID="custom-settings-header"
        ref={headerQa.ref}
        style={[styles.header, compact ? styles.headerCompact : null]}
        testID="custom-header"
      >
        <PrototypeIconButton
          accessibilityLabel="返回呼吸训练首页"
          disabled={pendingNavigation !== null}
          imageStyle={styles.backImage}
          onPress={goBack}
          source={referenceImages.back}
          style={styles.backTarget}
        />
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.title, compact ? styles.titleCompact : null]}
          testID="custom-title"
          variant="displayTitle"
          visualQaId="custom-title"
        >
          设置呼吸方式
        </AppText>
      </View>

      <View
        collapsable={false}
        nativeID="custom-panel"
        ref={panelQa.ref}
        style={[styles.panel, compact ? styles.panelCompact : null]}
        testID="custom-picker-panel"
      >
        <View
          collapsable={false}
          nativeID="custom-cycle-row"
          ref={cycleRowQa.ref}
          style={styles.cycleRow}
          testID="custom-cycle-row"
        >
          <AppText
            numberOfLines={1}
            style={[styles.cycleLabel, compact ? styles.cycleLabelCompact : null]}
            variant="displaySection"
            visualQaId="custom-cycle-label"
          >
            每个周期的时间
          </AppText>
          <View
            style={[
              styles.cycleWheel,
              compact ? styles.cycleWheelCompact : null
            ]}
          >
            <ScrollWheelPicker
              accessibilityLabel="设置每个周期的时间"
              onValueChange={setCustomCycleSeconds}
              testID="custom-cycle-wheel"
              unit="秒"
              value={cycleSeconds}
              values={CYCLE_SECONDS}
              variant="inline"
            />
          </View>
        </View>

        <View
          accessibilityLabel="每个周期的时间"
          collapsable={false}
          nativeID="custom-wheel-grid"
          ref={wheelGridQa.ref}
          style={[
            styles.wheelGrid,
            compact ? styles.wheelGridCompact : null
          ]}
          testID="custom-wheel-grid"
        >
          <PhaseWheel
            compact={compact}
            label="吸气"
            onValueChange={(value) => changePhase('inhaleSeconds', value)}
            testID="custom-inhale-wheel"
            value={customRhythm.inhaleSeconds}
          />
          <PhaseWheel
            compact={compact}
            label="保持"
            onValueChange={(value) => changePhase('holdSeconds', value)}
            testID="custom-hold-wheel"
            value={customRhythm.holdSeconds}
          />
          <PhaseWheel
            compact={compact}
            label="呼气"
            onValueChange={(value) => changePhase('exhaleSeconds', value)}
            testID="custom-exhale-wheel"
            value={customRhythm.exhaleSeconds}
          />
        </View>

        <View style={styles.divider} />

        <View
          collapsable={false}
          nativeID="custom-target-row"
          ref={targetRowQa.ref}
          style={styles.targetRow}
          testID="custom-target-row"
        >
          <AppText
            numberOfLines={1}
            style={[styles.targetLabel, compact ? styles.targetLabelCompact : null]}
            visualQaId="custom-target-label"
          >
            呼吸目标时间
          </AppText>
          <View
            style={[
              styles.durationWheel,
              compact ? styles.durationWheelCompact : null
            ]}
          >
            <ScrollWheelPicker
              accessibilityLabel="设置呼吸目标时间"
              onValueChange={changeDuration}
              testID="custom-duration-wheel"
              unit="分钟"
              value={customRhythm.durationMinutes}
              values={DURATION_MINUTES}
              variant="inline"
            />
          </View>
        </View>
      </View>

      {customRhythmSaveError ? (
        <View style={styles.saveError} testID="custom-save-error">
          <View
            accessibilityLabel={customRhythmSaveError}
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            accessible
          >
            <AppText accessible={false} style={styles.saveErrorText}>
              {customRhythmSaveError}
            </AppText>
          </View>
          <PrototypeButton
            label="重试保存"
            loading={retryPending}
            onPress={() => void retrySave()}
            style={styles.retry}
            variant="quiet"
          />
        </View>
      ) : null}

      <PrototypeButton
        disabled={pendingNavigation !== null}
        label="开始呼吸"
        loading={pendingNavigation === 'start'}
        onPress={startCustomSession}
        style={styles.start}
        testID="custom-start"
        visualQaId="custom-start"
      />
    </PrototypeScreen>
  );
}

type PhaseWheelProps = {
  compact: boolean;
  label: '吸气' | '保持' | '呼气';
  onValueChange(value: number): Promise<void>;
  testID: string;
  value: number;
};

function PhaseWheel({
  compact,
  label,
  onValueChange,
  testID,
  value
}: PhaseWheelProps) {
  return (
    <View style={styles.wheelColumn}>
      <AppText
        style={[styles.wheelLabel, compact ? styles.wheelLabelCompact : null]}
      >
        {label}
      </AppText>
      <ScrollWheelPicker
        accessibilityLabel={`设置${label}秒数`}
        onValueChange={onValueChange}
        testID={testID}
        value={value}
        values={PHASE_SECONDS}
        variant="phase"
      />
    </View>
  );
}

function isCustomDuration(value: number): value is CustomDurationMinutes {
  return (DURATION_MINUTES as readonly number[]).includes(value);
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32,
    paddingHorizontal: 24,
    paddingTop: 32
  },
  contentCompact: {
    paddingHorizontal: 20
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 22,
    minHeight: 56
  },
  headerCompact: {
    gap: 18
  },
  backTarget: {
    height: 46,
    width: 46
  },
  backImage: {
    height: 34,
    width: 34
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 36.72
  },
  titleCompact: {
    fontSize: 30,
    lineHeight: 32.4
  },
  panel: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 30,
    marginTop: 92,
    minHeight: 386,
    paddingBottom: 25,
    paddingHorizontal: 28,
    paddingTop: 32,
    ...shadows.customPicker
  },
  panelCompact: {
    borderRadius: 28,
    marginTop: 82,
    minHeight: 360,
    paddingBottom: 22,
    paddingHorizontal: 23,
    paddingTop: 28
  },
  cycleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 42
  },
  cycleLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28.32
  },
  cycleLabelCompact: {
    fontSize: 23,
    lineHeight: 27.14
  },
  cycleWheel: {
    height: 44,
    marginVertical: -5,
    width: 64
  },
  cycleWheelCompact: {
    width: 60
  },
  wheelGrid: {
    flexDirection: 'row',
    gap: 22,
    marginBottom: 48,
    marginHorizontal: 18,
    marginTop: 66
  },
  wheelGridCompact: {
    gap: 14,
    marginBottom: 38,
    marginHorizontal: 10,
    marginTop: 56
  },
  wheelColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    minWidth: 0
  },
  wheelLabel: {
    color: '#777d88',
    fontSize: 23,
    fontWeight: '500',
    lineHeight: 23
  },
  wheelLabelCompact: {
    fontSize: 21,
    lineHeight: 21
  },
  divider: {
    backgroundColor: 'rgba(17, 22, 34, 0.08)',
    height: 1,
    marginTop: 'auto',
    width: '100%'
  },
  targetRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 70,
    paddingTop: 21
  },
  targetLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26.4
  },
  targetLabelCompact: {
    fontSize: 21,
    lineHeight: 23.1
  },
  durationWheel: {
    height: 44,
    marginBottom: -9,
    marginTop: -5,
    width: 94
  },
  durationWheelCompact: {
    width: 86
  },
  start: {
    borderRadius: 18,
    marginTop: 16,
    minHeight: 54,
    width: '100%'
  },
  saveError: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 12,
    minHeight: 44,
    paddingLeft: 16,
    paddingRight: 6
  },
  saveErrorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18
  },
  retry: {
    minHeight: 44,
    paddingHorizontal: 10
  }
});
