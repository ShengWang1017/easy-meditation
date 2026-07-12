import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue
} from 'react-native-reanimated';
import {
  getBreathMotion,
  mixBreathMotion,
  type BreathMotion
} from '../domain/breathMotion';
import {
  BREATH_CORRECTION_MS,
  createBreathVisualAnchor,
  freezeBreathVisualClock,
  getBreathCorrectionAmount,
  projectBreathVisualAnchor,
  reanchorBreathVisualClock,
  reconcileBreathVisualAnchor,
  type BreathVisualInput,
  type BreathVisualProjection
} from '../domain/breathVisualTimeline';

export type BreathVisualTimelineValues = {
  projection: DerivedValue<BreathVisualProjection>;
  motion: DerivedValue<BreathMotion>;
  ambientTimeMs: DerivedValue<number>;
};

export function useBreathVisualTimeline(
  input: BreathVisualInput,
  visualTime: SharedValue<number>,
  isFixture: boolean
): BreathVisualTimelineValues {
  const rawInitialTimeMs = visualTime.value;
  const initialTimeMs = Number.isFinite(rawInitialTimeMs)
    ? rawInitialTimeMs
    : 0;
  const initialAnchor =
    createBreathVisualAnchor(input, initialTimeMs) ??
    createBreathVisualAnchor(
      {
        ...input,
        phaseKey: 'invalid-fallback',
        kind: 'ready',
        phaseElapsedMs: 0,
        phaseDurationMs: 1_000,
        ambientElapsedMs: 0,
        status: 'idle'
      },
      initialTimeMs
    )!;
  const anchor = useSharedValue(initialAnchor);
  const initialProjection = projectBreathVisualAnchor(
    initialAnchor,
    initialTimeMs
  );
  const correctionFrom = useSharedValue(
    getBreathMotion(
      initialProjection.kind,
      initialProjection.phaseProgress,
      initialProjection.ambientTimeMs,
      initialAnchor.reducedMotion
    )
  );
  const correctionStartedAtMs = useSharedValue(
    initialTimeMs - BREATH_CORRECTION_MS
  );
  const correctionFrozen = useSharedValue(false);
  const lastFiniteFrameTimeMs = useSharedValue(initialTimeMs);
  const latestInput = useRef(input);
  const appIsActive = useRef(true);
  latestInput.current = input;

  const projection = useDerivedValue(() => {
    const rawFrameTimeMs = visualTime.value;
    const frameTimeMs =
      Number.isFinite(rawFrameTimeMs) &&
      rawFrameTimeMs >= lastFiniteFrameTimeMs.value
        ? rawFrameTimeMs
        : lastFiniteFrameTimeMs.value;
    return projectBreathVisualAnchor(anchor.value, frameTimeMs);
  });
  const targetMotion = useDerivedValue(() =>
    getBreathMotion(
      projection.value.kind,
      projection.value.phaseProgress,
      projection.value.ambientTimeMs,
      anchor.value.reducedMotion
    )
  );
  const motion = useDerivedValue(() => {
    const rawFrameTimeMs = visualTime.value;
    const frameTimeMs =
      Number.isFinite(rawFrameTimeMs) &&
      rawFrameTimeMs >= lastFiniteFrameTimeMs.value
        ? rawFrameTimeMs
        : lastFiniteFrameTimeMs.value;
    if (correctionFrozen.value) return correctionFrom.value;
    return mixBreathMotion(
      correctionFrom.value,
      targetMotion.value,
      getBreathCorrectionAmount(frameTimeMs, correctionStartedAtMs.value)
    );
  });
  const ambientTimeMs = useDerivedValue(
    () => projection.value.ambientTimeMs
  );

  useAnimatedReaction(
    () => visualTime.value,
    (nowMs) => {
      if (!Number.isFinite(nowMs)) return;
      const previousFrameTimeMs = lastFiniteFrameTimeMs.value;
      if (!isFixture && nowMs < previousFrameTimeMs) {
        const correctionElapsedMs = Math.max(
          0,
          Math.min(
            BREATH_CORRECTION_MS,
            previousFrameTimeMs - correctionStartedAtMs.value
          )
        );
        anchor.value = reanchorBreathVisualClock(
          anchor.value,
          previousFrameTimeMs,
          nowMs
        );
        correctionStartedAtMs.value = nowMs - correctionElapsedMs;
      }
      lastFiniteFrameTimeMs.value = nowMs;
    },
    [isFixture]
  );

  useEffect(() => {
    if (isFixture) return;
    const subscription = AppState.addEventListener('change', (state) => {
      const nowMs = visualTime.value;
      if (!Number.isFinite(nowMs)) return;
      if (state !== 'active') {
        appIsActive.current = false;
        const visibleMotion = motion.value;
        anchor.value = freezeBreathVisualClock(anchor.value, nowMs);
        correctionFrom.value = visibleMotion;
        correctionFrozen.value = true;
        correctionStartedAtMs.value = nowMs - BREATH_CORRECTION_MS;
        return;
      }

      appIsActive.current = true;
      const reconciliation = reconcileBreathVisualAnchor(
        anchor.value,
        latestInput.current,
        nowMs
      );
      if (
        reconciliation.directive === 'correct' ||
        reconciliation.directive === 'freeze'
      ) {
        const visibleMotion = motion.value;
        correctionFrom.value = visibleMotion;
        anchor.value = reconciliation.anchor;
        correctionFrozen.value = reconciliation.directive === 'freeze';
        correctionStartedAtMs.value =
          reconciliation.directive === 'freeze'
            ? nowMs - BREATH_CORRECTION_MS
            : nowMs;
      }
    });
    return () => subscription.remove();
  }, [
    anchor,
    correctionFrom,
    correctionFrozen,
    correctionStartedAtMs,
    isFixture,
    motion,
    visualTime
  ]);

  useEffect(() => {
    const nowMs = visualTime.value;
    if (!Number.isFinite(nowMs)) return;
    if (isFixture) {
      const fixed = createBreathVisualAnchor(input, nowMs);
      if (!fixed) return;
      anchor.value = fixed;
      const fixedProjection = projectBreathVisualAnchor(fixed, nowMs);
      correctionFrom.value = getBreathMotion(
        fixedProjection.kind,
        fixedProjection.phaseProgress,
        fixedProjection.ambientTimeMs,
        fixed.reducedMotion
      );
      correctionFrozen.value = false;
      correctionStartedAtMs.value = nowMs - BREATH_CORRECTION_MS;
      latestInput.current = input;
      return;
    }

    if (!appIsActive.current) {
      latestInput.current = input;
      return;
    }

    const reconciliation = reconcileBreathVisualAnchor(
      anchor.value,
      input,
      nowMs
    );
    if (reconciliation.directive === 'reject') {
      if (__DEV__) {
        console.warn('Invalid breath visual anchor; retaining last frame.');
      }
      return;
    }
    if (reconciliation.directive === 'retain') {
      latestInput.current = input;
      return;
    }

    const visibleMotion = motion.value;
    anchor.value = reconciliation.anchor;
    correctionFrom.value = visibleMotion;
    correctionFrozen.value = reconciliation.directive === 'freeze';
    correctionStartedAtMs.value =
      reconciliation.directive === 'freeze'
        ? nowMs - BREATH_CORRECTION_MS
        : nowMs;
    latestInput.current = input;
  }, [
    anchor,
    correctionFrom,
    correctionFrozen,
    correctionStartedAtMs,
    input.ambientElapsedMs,
    input.kind,
    input.phaseDurationMs,
    input.phaseElapsedMs,
    input.phaseKey,
    input.reducedMotion,
    input.status,
    isFixture,
    motion,
    visualTime
  ]);

  return { projection, motion, ambientTimeMs };
}
