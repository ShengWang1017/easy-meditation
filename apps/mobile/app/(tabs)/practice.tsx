import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native';

import { fetchBreathingMethods } from '../../src/api/methods';
import { AppText } from '../../src/components/AppText';
import { BeforeStartCard } from '../../src/components/BeforeStartCard';
import { ModeCard, type ModeCardViewModel } from '../../src/components/ModeCard';
import { PrototypeButton } from '../../src/components/PrototypeButton';
import { PrototypeIconButton } from '../../src/components/PrototypeIconButton';
import { PrototypeScreen } from '../../src/components/PrototypeScreen';
import {
  buildMethodPresentationSlots,
  type BuiltInMethodId,
  type MethodPresentationSlot
} from '../../src/domain/methodPresentation';
import { publicQueryKeys } from '../../src/query/keys';
import { useVisualQaRegistration } from '../../src/qa/VisualQaReporter';
import { usePreferencesStore } from '../../src/store/PreferencesStoreProvider';
import { referenceImages } from '../../src/theme/assets';
import { colors, layout, typography } from '../../src/theme/tokens';

const SLOT_COLORS: Record<MethodPresentationSlot['id'], string> = {
  box: colors.lilac,
  'four-seven-eight': colors.periwinkle,
  coherent: colors.blue,
  custom: colors.mintBlue
};

function isBuiltInId(
  id: MethodPresentationSlot['id']
): id is BuiltInMethodId {
  return id !== 'custom';
}

function defaultDurationMinutes(slot: MethodPresentationSlot): number {
  return Math.max(1, Math.round((slot.method?.defaultDurationSeconds ?? 60) / 60));
}

export default function PracticeScreen() {
  const { width } = useWindowDimensions();
  const compact = width <= 380;
  const customRhythm = usePreferencesStore((state) => state.customRhythm);
  const durationOverrides = usePreferencesStore((state) => state.durationOverrides);
  const beforeStartDismissed = usePreferencesStore(
    (state) => state.beforeStartDismissed
  );
  const setDurationOverride = usePreferencesStore(
    (state) => state.setDurationOverride
  );
  const dismissBeforeStart = usePreferencesStore(
    (state) => state.dismissBeforeStart
  );
  const methodsQuery = useQuery({
    queryKey: publicQueryKeys.methods,
    queryFn: fetchBreathingMethods
  });
  const [activeDurationId, setActiveDurationId] =
    useState<BuiltInMethodId | null>(null);
  const [dismissPending, setDismissPending] = useState(false);
  const trainingHeaderQa = useVisualQaRegistration('training-header');
  const trainingIntroQa = useVisualQaRegistration('training-intro');
  const modeGridQa = useVisualQaRegistration('mode-grid');
  const activeDurationAvailable =
    activeDurationId !== null &&
    methodsQuery.data?.some((method) => method.id === activeDurationId) === true;
  const visibleActiveDurationId = activeDurationAvailable
    ? activeDurationId
    : null;

  useEffect(() => {
    if (
      activeDurationId !== null &&
      methodsQuery.data &&
      !methodsQuery.data.some((method) => method.id === activeDurationId)
    ) {
      setActiveDurationId(null);
    }
  }, [activeDurationId, methodsQuery.data]);

  if (methodsQuery.isLoading && !methodsQuery.data) {
    return (
      <PrototypeScreen
        backgroundVariant="practice"
        contentStyle={styles.centerState}
        testID="practice-loading"
      >
        <ActivityIndicator color={colors.teal} size="large" />
        <AppText tone="muted">正在加载呼吸训练…</AppText>
      </PrototypeScreen>
    );
  }

  if (methodsQuery.isError && !methodsQuery.data) {
    return (
      <PrototypeScreen
        backgroundVariant="practice"
        contentStyle={styles.centerState}
        testID="practice-error"
      >
        <AppText
          accessibilityRole="header"
          style={styles.errorTitle}
          variant="displaySection"
        >
          呼吸训练暂时不可用
        </AppText>
        <AppText style={styles.errorMessage} tone="muted">
          请检查网络连接后重试。
        </AppText>
        <PrototypeButton
          label="重试"
          onPress={() => void methodsQuery.refetch()}
          style={styles.retryButton}
        />
      </PrototypeScreen>
    );
  }

  const slots = buildMethodPresentationSlots(methodsQuery.data ?? [], customRhythm);
  const hasMissingBuiltIn = slots.some(
    (slot) => slot.kind === 'built_in' && slot.availability === 'unavailable'
  );
  const warningMessage = methodsQuery.isError
    ? '无法刷新呼吸训练，当前显示上次加载的内容。'
    : hasMissingBuiltIn
      ? '部分呼吸训练暂时不可用，请重试。'
      : null;
  const viewModels: ModeCardViewModel[] = slots.map((slot) => {
    const durationMinutes = isBuiltInId(slot.id)
      ? durationOverrides[slot.id] ?? defaultDurationMinutes(slot)
      : customRhythm.durationMinutes;

    return {
      ...slot,
      backgroundColor: SLOT_COLORS[slot.id],
      durationMinutes,
      durationPopoverOpen: slot.id === visibleActiveDurationId
    };
  });

  function closeDuration() {
    setActiveDurationId(null);
  }

  function openGuide() {
    if (visibleActiveDurationId) {
      closeDuration();
      return;
    }
    router.push('/guide');
  }

  function openCustomEditor() {
    if (visibleActiveDurationId) {
      closeDuration();
      return;
    }
    router.push('/custom-rhythm');
  }

  function startBuiltIn(viewModel: ModeCardViewModel) {
    if (visibleActiveDurationId) {
      closeDuration();
      return;
    }
    const methodId = viewModel.id;
    if (
      viewModel.kind !== 'built_in' ||
      !isBuiltInId(methodId) ||
      viewModel.availability !== 'available'
    ) {
      return;
    }

    router.push({
      pathname: '/session/[methodId]',
      params: { methodId }
    });
  }

  function toggleDuration(viewModel: ModeCardViewModel) {
    const methodId = viewModel.id;
    if (
      viewModel.kind !== 'built_in' ||
      !isBuiltInId(methodId) ||
      viewModel.availability !== 'available'
    ) {
      return;
    }
    setActiveDurationId((current) =>
      current === methodId ? null : methodId
    );
  }

  async function changeDuration(
    viewModel: ModeCardViewModel,
    minutes: number
  ) {
    const methodId = viewModel.id;
    if (viewModel.kind !== 'built_in' || !isBuiltInId(methodId)) {
      return;
    }
    await setDurationOverride(methodId, minutes);
  }

  async function dismissBeforeCard() {
    if (visibleActiveDurationId) {
      closeDuration();
      return;
    }
    setDismissPending(true);
    await Promise.resolve();
    try {
      await dismissBeforeStart();
    } finally {
      setDismissPending(false);
    }
  }

  function retryMethods() {
    if (visibleActiveDurationId) {
      closeDuration();
      return;
    }
    void methodsQuery.refetch();
  }

  return (
    <PrototypeScreen
      backgroundVariant="practice"
      contentStyle={[styles.content, compact ? styles.contentCompact : null]}
      scrollable
      testID="practice-screen"
    >
      {visibleActiveDurationId ? (
        <Pressable
          accessibilityLabel="关闭训练时长设置"
          accessibilityRole="button"
          onPress={closeDuration}
          style={styles.durationBackdrop}
          testID="practice-duration-backdrop"
        />
      ) : null}

      <View
        collapsable={false}
        nativeID="training-header"
        ref={trainingHeaderQa.ref}
        style={styles.header}
        testID="practice-header"
      >
        <PrototypeIconButton
          accessibilityLabel="返回呼吸训练首页"
          imageStyle={styles.headerIcon}
          onPress={visibleActiveDurationId ? closeDuration : () => router.back()}
          source={referenceImages.back}
          style={styles.headerButton}
        />
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.headerTitle}
          variant="displayTitle"
          visualQaId="training-title"
        >
          呼吸训练
        </AppText>
        <PrototypeIconButton
          accessibilityLabel="了解呼吸训练和冥想"
          imageStyle={styles.infoIcon}
          onPress={openGuide}
          source={referenceImages.info}
          style={styles.headerButton}
        />
      </View>

      <View
        collapsable={false}
        nativeID="training-intro"
        ref={trainingIntroQa.ref}
        style={[styles.intro, compact ? styles.introCompact : null]}
      >
        <AppText
          style={[
            styles.introText,
            compact ? styles.introTextCompact : null
          ]}
          variant="displayTitle"
          visualQaId="training-intro-copy"
        >
          选择要进行的呼吸训练。
        </AppText>
      </View>

      {warningMessage ? (
        <View style={styles.warning} testID="practice-warning">
          <AppText style={styles.warningText} tone="muted" variant="meta">
            {warningMessage}
          </AppText>
          <PrototypeButton
            label="重试"
            onPress={retryMethods}
            style={styles.warningButton}
            variant="quiet"
          />
        </View>
      ) : null}

      <View
        collapsable={false}
        style={[
          styles.grid,
          { gap: compact ? layout.compactGridGap : layout.gridGap },
          visibleActiveDurationId ? styles.gridWithPopover : null
        ]}
        nativeID="mode-grid"
        ref={modeGridQa.ref}
        testID="practice-mode-grid"
      >
        {[viewModels.slice(0, 2), viewModels.slice(2, 4)].map((row, rowIndex) => (
          <View
            key={`practice-row-${rowIndex}`}
            style={[
              styles.gridRow,
              { gap: compact ? layout.compactGridGap : layout.gridGap }
            ]}
          >
            {row.map((viewModel) => (
              <ModeCard
                key={viewModel.id}
                onDurationChange={(minutes) => changeDuration(viewModel, minutes)}
                onOpenCustomEditor={openCustomEditor}
                onOpenDuration={() => toggleDuration(viewModel)}
                onPress={() => startBuiltIn(viewModel)}
                onRequestCloseDuration={closeDuration}
                viewModel={viewModel}
              />
            ))}
          </View>
        ))}
      </View>

      {!beforeStartDismissed || dismissPending ? (
        <View style={styles.beforeWrap}>
          <BeforeStartCard
            onDismiss={dismissBeforeCard}
            onOpenGuide={openGuide}
          />
        </View>
      ) : null}
    </PrototypeScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
    paddingTop: 8,
    position: 'relative'
  },
  contentCompact: {
    paddingTop: 8
  },
  centerState: {
    alignItems: 'center',
    gap: 16,
    justifyContent: 'center'
  },
  errorTitle: {
    color: colors.ink,
    textAlign: 'center'
  },
  errorMessage: {
    textAlign: 'center'
  },
  retryButton: {
    marginTop: 4
  },
  durationBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50
  },
  headerButton: {
    height: 50,
    minHeight: 50,
    minWidth: 50,
    width: 50
  },
  headerIcon: {
    height: 34,
    width: 34
  },
  infoIcon: {
    height: 37,
    width: 37
  },
  headerTitle: {
    ...typography.header,
    color: colors.ink,
    flex: 1,
    textAlign: 'center'
  },
  intro: {
    marginBottom: 22,
    marginTop: 46
  },
  introCompact: {
    marginTop: 42
  },
  introText: {
    ...typography.intro,
    color: colors.ink
  },
  introTextCompact: {
    fontSize: 24,
    lineHeight: 30.72
  },
  warning: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    minHeight: 44,
    paddingLeft: 14
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  warningButton: {
    minHeight: 44,
    paddingHorizontal: 12
  },
  grid: {
    position: 'relative'
  },
  gridWithPopover: {
    zIndex: 4
  },
  gridRow: {
    flexDirection: 'row'
  },
  beforeWrap: {
    marginTop: 24
  }
});
