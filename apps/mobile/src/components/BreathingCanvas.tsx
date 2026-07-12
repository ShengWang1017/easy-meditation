import type { BreathingPhase, SessionSnapshot } from '@easy-meditation/shared';
import { useClock } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type {
  SessionStatus,
  SessionVisualTiming
} from '../domain/sessionClock';
import {
  getBreathMotion,
  resolveBreathVisualKind,
  type BreathMotion,
  type BreathVisualKind
} from '../domain/breathMotion';
import {
  createBreathVisualAnchor,
  projectBreathVisualAnchor,
  type BreathVisualInput
} from '../domain/breathVisualTimeline';
import {
  BREATH_RENDER_SPEC,
  BreathingCanvasRenderer
} from './BreathingCanvasRenderer';
import { useBreathVisualTimeline } from './useBreathVisualTimeline';

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
  visualTiming: SessionVisualTiming;
  status: SessionStatus;
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
  visualTimeMs: number,
  visualCapturedAtMs = 0
): BreathingCanvasFrame {
  const kind = resolveKind(props);
  const phaseDurationMs =
    props.status === 'idle'
      ? BREATH_RENDER_SPEC.readyDurationMs
      : props.visualTiming.phaseDurationMs;
  const input: BreathVisualInput = {
    ...props.visualTiming,
    phaseDurationMs,
    kind,
    status: props.status,
    reducedMotion: props.reducedMotion
  };
  const anchor = createBreathVisualAnchor(input, visualCapturedAtMs);
  if (!anchor) {
    const motion = getBreathMotion('ready', 0, 0, props.reducedMotion);
    return { kind: 'ready', progress: 0, visualTimeMs: 0, motion };
  }
  const projection = projectBreathVisualAnchor(anchor, visualTimeMs);
  return {
    kind,
    progress: projection.phaseProgress,
    visualTimeMs: projection.ambientTimeMs,
    motion: getBreathMotion(
      kind,
      projection.phaseProgress,
      projection.ambientTimeMs,
      props.reducedMotion
    )
  };
}

function resolveKind(props: BreathingCanvasProps): BreathVisualKind {
  if (props.status === 'completed') return 'complete';
  if (props.status === 'idle') return 'ready';
  return resolveBreathVisualKind(props.phases, props.phaseIndex, props.phaseKind);
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
  return <BreathingCanvasAdapter {...props} visualTime={visualTime} />;
}

function FixtureBreathingCanvas(
  props: BreathingCanvasProps & { fixtureVisualTimeMs: number }
) {
  const visualTime = useSharedValue(props.fixtureVisualTimeMs);

  useEffect(() => {
    visualTime.value = props.fixtureVisualTimeMs;
  }, [props.fixtureVisualTimeMs, visualTime]);

  return <BreathingCanvasAdapter {...props} visualTime={visualTime} />;
}

function BreathingCanvasAdapter({
  visualTime,
  ...props
}: BreathingCanvasProps & { visualTime: SharedValue<number> }) {
  const kind = resolveKind(props);
  const phaseDurationMs =
    props.status === 'idle'
      ? BREATH_RENDER_SPEC.readyDurationMs
      : props.visualTiming.phaseDurationMs;
  const timeline = useBreathVisualTimeline(
    {
      ...props.visualTiming,
      phaseDurationMs,
      kind,
      status: props.status,
      reducedMotion: props.reducedMotion
    },
    visualTime,
    props.fixtureVisualTimeMs !== undefined
  );

  return (
    <BreathingCanvasRenderer
      motion={timeline.motion}
      ambientTimeMs={timeline.ambientTimeMs}
    />
  );
}
