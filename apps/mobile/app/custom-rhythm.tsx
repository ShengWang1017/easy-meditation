import { useRef } from 'react';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '../src/components/AppText';
import { PrototypeButton } from '../src/components/PrototypeButton';
import { PrototypeIconButton } from '../src/components/PrototypeIconButton';
import { PrototypeScreen } from '../src/components/PrototypeScreen';
import { ScrollWheelPicker } from '../src/components/ScrollWheelPicker';
import {
  redistributeCycleSeconds,
  type CustomDurationMinutes,
  type CustomRhythm
} from '../src/domain/customRhythm';
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
  const setCustomPhase = usePreferencesStore((state) => state.setCustomPhase);
  const setCustomCycleSeconds = usePreferencesStore(
    (state) => state.setCustomCycleSeconds
  );
  const setCustomDuration = usePreferencesStore(
    (state) => state.setCustomDuration
  );
  const persistedRhythm = useRef<CustomRhythm>({ ...customRhythm });
  const commitTail = useRef<Promise<void>>(Promise.resolve());
  const cycleSeconds =
    customRhythm.inhaleSeconds +
    customRhythm.holdSeconds +
    customRhythm.exhaleSeconds;

  function goBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/practice');
    }
  }

  function startCustomSession() {
    router.push({
      pathname: '/session/[methodId]',
      params: { methodId: 'custom' }
    });
  }

  function enqueueRhythmChange(
    mutate: () => Promise<void>,
    apply: (current: CustomRhythm) => CustomRhythm,
    rollback: (previous: CustomRhythm) => Promise<void>
  ): Promise<void> {
    const commit = commitTail.current.then(async () => {
      const previous = persistedRhythm.current;
      try {
        await mutate();
        persistedRhythm.current = apply(previous);
      } catch {
        try {
          await rollback(previous);
        } catch {
          // Store actions update synchronously, so the last persisted value is
          // restored in memory even when the compensating write also fails.
        }
      }
    });
    commitTail.current = commit.catch(() => undefined);
    return commit;
  }

  function changePhase(phase: CustomPhase, value: number): Promise<void> {
    return enqueueRhythmChange(
      () => setCustomPhase(phase, value),
      (current) => ({ ...current, [phase]: value }),
      async (previous) => {
        await setCustomPhase(phase, previous[phase]);
      }
    );
  }

  function changeCycleSeconds(value: number): Promise<void> {
    return enqueueRhythmChange(
      () => setCustomCycleSeconds(value),
      (current) => ({
        ...current,
        ...redistributeCycleSeconds(current, value)
      }),
      async (previous) => {
        await Promise.allSettled([
          setCustomPhase('inhaleSeconds', previous.inhaleSeconds),
          setCustomPhase('holdSeconds', previous.holdSeconds),
          setCustomPhase('exhaleSeconds', previous.exhaleSeconds)
        ]);
      }
    );
  }

  function changeDuration(value: number): Promise<void> {
    if (!isCustomDuration(value)) return Promise.resolve();
    return enqueueRhythmChange(
      () => setCustomDuration(value),
      (current) => ({ ...current, durationMinutes: value }),
      async (previous) => {
        await setCustomDuration(previous.durationMinutes);
      }
    );
  }

  return (
    <PrototypeScreen
      backgroundVariant="custom"
      contentStyle={[
        styles.content,
        compact ? styles.contentCompact : null
      ]}
      scrollable
      testID="custom-screen"
    >
      <View
        style={[styles.header, compact ? styles.headerCompact : null]}
        testID="custom-header"
      >
        <PrototypeIconButton
          accessibilityLabel="返回呼吸训练首页"
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
        >
          设置呼吸方式
        </AppText>
      </View>

      <View
        style={[styles.panel, compact ? styles.panelCompact : null]}
        testID="custom-picker-panel"
      >
        <View style={styles.cycleRow} testID="custom-cycle-row">
          <AppText
            numberOfLines={1}
            style={[styles.cycleLabel, compact ? styles.cycleLabelCompact : null]}
            variant="displaySection"
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
              onValueChange={changeCycleSeconds}
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

        <View style={styles.targetRow} testID="custom-target-row">
          <AppText
            numberOfLines={1}
            style={[styles.targetLabel, compact ? styles.targetLabelCompact : null]}
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

      <PrototypeButton
        label="开始呼吸"
        onPress={startCustomSession}
        style={styles.start}
        testID="custom-start"
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
    height: 34,
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
    height: 34,
    marginBottom: -4,
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
  }
});
