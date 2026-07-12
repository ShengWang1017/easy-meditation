import type { BreathingPhase, SessionSnapshot } from '@easy-meditation/shared';
import { useClock } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { SessionClockSnapshot } from '../domain/sessionClock';
import {
  getBreathMotion,
  getBreathTransitionMs,
  mixBreathMotion,
  resolveBreathVisualKind
} from '../domain/breathMotion';
import type {
  BreathMotion,
  BreathVisualKind
} from '../domain/breathMotion';
import {
  BREATH_RENDER_SPEC,
  BreathingCanvasRenderer
} from './BreathingCanvasRenderer';

export {
  BREATH_LAYER_ORDER,
  BREATH_RENDER_SPEC,
  BreathGradient,
  BreathLayer,
  BreathParticle,
  BreathingCanvasRenderer,
  createOrganicBlobPath
} from './BreathingCanvasRenderer';
export type {
  BreathGradientProps,
  BreathLayerName,
  BreathParticleProps,
  BreathingCanvasRendererProps
} from './BreathingCanvasRenderer';

export type BreathingCanvasProps = {
  phases: BreathingPhase[];
  phaseIndex: number;
  phaseKind: SessionSnapshot['kind'];
  phaseProgress: number;
  phaseDurationMs: number;
  status: SessionClockSnapshot['status'];
  reducedMotion: boolean;
  fixtureVisualTimeMs?: number;
};

export type BreathingCanvasFrame = {
  kind: BreathVisualKind;
  progress: number;
  visualTimeMs: number;
  motion: BreathMotion;
};

export function resolveBreathingCanvasFrame(
  props: BreathingCanvasProps,
  visualTimeMs: number
): BreathingCanvasFrame {
  const kind = resolveKind(props);
  return resolveBreathingVisualFrame(
    {
      kind,
      phaseDurationMs: props.phaseDurationMs,
      phaseProgress: props.phaseProgress,
      reducedMotion: props.reducedMotion,
      status: props.status
    },
    visualTimeMs
  );
}

type BreathingVisualFrameInput = {
  kind: BreathVisualKind;
  phaseDurationMs: number;
  phaseProgress: number;
  reducedMotion: boolean;
  status: SessionClockSnapshot['status'];
};

function resolveBreathingVisualFrame(
  input: BreathingVisualFrameInput,
  visualTimeMs: number
): BreathingCanvasFrame {
  'worklet';
  const isReady = input.status === 'idle';
  const isCompletedStatus = input.status === 'completed';
  let progress = clamp01(input.phaseProgress);

  if (isReady) {
    progress = loopProgress(visualTimeMs, BREATH_RENDER_SPEC.readyDurationMs);
  } else if (isCompletedStatus) {
    progress = loopProgress(visualTimeMs, Math.max(1_000, input.phaseDurationMs));
  }

  const motionVisualTimeMs =
    input.status === 'paused'
      ? clamp01(input.phaseProgress) * Math.max(1_000, input.phaseDurationMs)
      : visualTimeMs;

  return {
    kind: input.kind,
    progress,
    visualTimeMs: motionVisualTimeMs,
    motion: getBreathMotion(
      input.kind,
      progress,
      motionVisualTimeMs,
      input.reducedMotion
    )
  };
}

function loopProgress(visualTimeMs: number, durationMs: number): number {
  'worklet';
  const progress = (visualTimeMs % durationMs) / durationMs;
  return progress < 0 ? progress + 1 : progress;
}

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  'worklet';
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

function resolveKind(props: BreathingCanvasProps): BreathVisualKind {
  if (props.status === 'completed') return 'complete';
  if (props.status === 'idle') return 'ready';
  return resolveBreathVisualKind(props.phases, props.phaseIndex, props.phaseKind);
}

export type BreathTransitionSnapshot = Pick<
  BreathingVisualFrameInput,
  'kind' | 'reducedMotion' | 'status'
>;

export type BreathTransitionDirective = 'animate' | 'none' | 'snap';

export function resolveBreathTransitionDirective(
  previous: BreathTransitionSnapshot,
  next: BreathTransitionSnapshot
): BreathTransitionDirective {
  if (next.status === 'paused') {
    return previous.status !== 'paused' ||
      previous.kind !== next.kind ||
      previous.reducedMotion !== next.reducedMotion
      ? 'snap'
      : 'none';
  }
  return previous.kind !== next.kind ||
    previous.reducedMotion !== next.reducedMotion
    ? 'animate'
    : 'none';
}

export function BreathingCanvas(props: BreathingCanvasProps) {
  return props.fixtureVisualTimeMs === undefined ? (
    <LiveBreathingCanvas {...props} />
  ) : (
    <FixtureBreathingCanvas
      {...props}
      fixtureVisualTimeMs={props.fixtureVisualTimeMs}
    />
  );
}

function LiveBreathingCanvas(props: BreathingCanvasProps) {
  const visualTime = useClock();
  return <LegacyBreathingCanvasAdapter {...props} visualTime={visualTime} />;
}

function FixtureBreathingCanvas(
  props: BreathingCanvasProps & { fixtureVisualTimeMs: number }
) {
  const visualTime = useSharedValue(props.fixtureVisualTimeMs);

  useEffect(() => {
    visualTime.value = props.fixtureVisualTimeMs;
  }, [props.fixtureVisualTimeMs, visualTime]);

  return <LegacyBreathingCanvasAdapter {...props} visualTime={visualTime} />;
}

function LegacyBreathingCanvasAdapter({
  visualTime,
  ...props
}: BreathingCanvasProps & { visualTime: SharedValue<number> }) {
  const visualKind = resolveKind(props);
  const nextInput: BreathingVisualFrameInput = {
    kind: visualKind,
    phaseDurationMs: props.phaseDurationMs,
    phaseProgress: props.phaseProgress,
    reducedMotion: props.reducedMotion,
    status: props.status
  };
  const initialInputRef = useRef<BreathingVisualFrameInput | null>(null);
  if (initialInputRef.current === null) {
    initialInputRef.current = nextInput;
  }
  const initialFrameRef = useRef<BreathingCanvasFrame | null>(null);
  if (initialFrameRef.current === null) {
    initialFrameRef.current = resolveBreathingVisualFrame(
      initialInputRef.current,
      props.fixtureVisualTimeMs ?? 0
    );
  }

  const visualKindValue = useSharedValue(initialInputRef.current.kind);
  const phaseProgress = useSharedValue(initialInputRef.current.phaseProgress);
  const phaseDurationMs = useSharedValue(initialInputRef.current.phaseDurationMs);
  const renderStatus = useSharedValue(initialInputRef.current.status);
  const reducedMotion = useSharedValue(initialInputRef.current.reducedMotion);
  const transitionAmount = useSharedValue(1);
  const previousMotion = useSharedValue<BreathMotion>(
    initialFrameRef.current.motion
  );
  const previousInput = useRef(initialInputRef.current);

  const targetFrame = useDerivedValue(() =>
    resolveBreathingVisualFrame(
      {
        kind: visualKindValue.value,
        phaseDurationMs: phaseDurationMs.value,
        phaseProgress: phaseProgress.value,
        reducedMotion: reducedMotion.value,
        status: renderStatus.value
      },
      visualTime.value
    )
  );
  const motion = useDerivedValue(() =>
    mixBreathMotion(
      previousMotion.value,
      targetFrame.value.motion,
      easeOutCubic(transitionAmount.value)
    )
  );
  const ambientTimeMs = useDerivedValue(() => targetFrame.value.visualTimeMs);

  useEffect(() => {
    const oldInput = previousInput.current;
    const directive = resolveBreathTransitionDirective(oldInput, nextInput);
    if (directive === 'snap') {
      cancelAnimation(transitionAmount);
      previousMotion.value = resolveBreathingVisualFrame(
        nextInput,
        props.fixtureVisualTimeMs ?? visualTime.value
      ).motion;
      transitionAmount.value = 1;
    } else if (directive === 'animate') {
      const currentMotion = motion.value;
      cancelAnimation(transitionAmount);
      previousMotion.value = currentMotion;
      transitionAmount.value = 0;
      transitionAmount.value = withTiming(1, {
        duration: getBreathTransitionMs(props.reducedMotion),
        easing: Easing.linear
      });
    }
    previousInput.current = nextInput;
  }, [
    motion,
    previousMotion,
    props.fixtureVisualTimeMs,
    props.phaseDurationMs,
    props.phaseProgress,
    props.reducedMotion,
    props.status,
    transitionAmount,
    visualTime,
    visualKind
  ]);

  useEffect(() => {
    visualKindValue.value = visualKind;
    phaseDurationMs.value = props.phaseDurationMs;
    phaseProgress.value = clamp01(props.phaseProgress);
    reducedMotion.value = props.reducedMotion;
    renderStatus.value = props.status;
  }, [
    phaseDurationMs,
    phaseProgress,
    props.phaseDurationMs,
    props.phaseProgress,
    props.reducedMotion,
    props.status,
    reducedMotion,
    renderStatus,
    visualKind,
    visualKindValue
  ]);

  return (
    <BreathingCanvasRenderer
      motion={motion}
      ambientTimeMs={ambientTimeMs}
    />
  );
}
