import type { BreathingPhase, SessionSnapshot } from '@easy-meditation/shared';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Skia,
  TwoPointConicalGradient,
  useClock,
  usePathValue,
  vec
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { useEffect, useRef } from 'react';
import type { ComponentProps, PropsWithChildren } from 'react';
import { useWindowDimensions } from 'react-native';
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
  BREATH_TEXTURE,
  buildOrganicBlobPoints,
  getBreathMotion,
  getBreathTransitionMs,
  mixBreathMotion,
  resolveBreathVisualKind
} from '../domain/breathMotion';
import type {
  BreathMotion,
  BreathTextureParticle,
  BreathVisualKind,
  OrganicBlobOptions
} from '../domain/breathMotion';

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

export const BREATH_LAYER_ORDER = [
  'glow',
  'halo',
  'veil',
  'core',
  'highlight',
  'texture',
  'center-core',
  'center-ring'
] as const;

export type BreathLayerName = (typeof BREATH_LAYER_ORDER)[number];

export function BreathLayer({ children }: PropsWithChildren<{ name: BreathLayerName }>) {
  return <>{children}</>;
}

type BreathLinearGradientProps = Pick<
  ComponentProps<typeof LinearGradient>,
  'colors' | 'end' | 'positions' | 'start'
> & {
  kind: 'linear';
  name: 'veil';
};

type BreathRadialGradientProps = Pick<
  ComponentProps<typeof RadialGradient>,
  'c' | 'colors' | 'positions' | 'r'
> & {
  kind: 'radial';
  name: 'particle';
  particleIndex: number;
};

type BreathTwoPointGradientProps = Pick<
  ComponentProps<typeof TwoPointConicalGradient>,
  'colors' | 'end' | 'endR' | 'positions' | 'start' | 'startR'
> & {
  kind: 'two-point';
  name: 'core' | 'glow';
};

export type BreathGradientProps =
  | BreathLinearGradientProps
  | BreathRadialGradientProps
  | BreathTwoPointGradientProps;

export function BreathGradient(props: BreathGradientProps) {
  if (props.kind === 'linear') {
    return (
      <LinearGradient
        colors={props.colors}
        end={props.end}
        positions={props.positions}
        start={props.start}
      />
    );
  }
  if (props.kind === 'radial') {
    return (
      <RadialGradient
        c={props.c}
        colors={props.colors}
        positions={props.positions}
        r={props.r}
      />
    );
  }
  return (
    <TwoPointConicalGradient
      colors={props.colors}
      end={props.end}
      endR={props.endR}
      positions={props.positions}
      start={props.start}
      startR={props.startR}
    />
  );
}

export const BREATH_RENDER_SPEC = {
  canvasSize: 640,
  baseRadiusFraction: 0.32,
  readyDurationMs: 4_600,
  glow: {
    alphaBase: 0.18,
    alphaBloom: 0.14,
    blur: 22,
    innerRadius: 0.12,
    outerRadius: 1.58,
    circleRadius: 1.62,
    colors: [
      'rgba(159, 110, 238, 0.32)',
      'rgba(183, 151, 245, 0.2)',
      'rgba(173, 228, 230, 0)'
    ],
    positions: [0, 0.5, 1]
  },
  halo: {
    alphaBase: 0.28,
    alphaBloom: 0.18,
    color: 'rgba(190, 164, 255, 0.26)',
    radius: 1.18,
    points: 34,
    amp: 0.045,
    timeScale: 0.26,
    seed: 0.4,
    scaleX: 1.02,
    scaleY: 0.98
  },
  veil: {
    rotationBase: -0.24,
    rotationWave: 0.08,
    rotationTimeScale: 0.42,
    scaleXBase: 1.32,
    scaleXOrbit: 0.25,
    scaleYBase: 0.54,
    scaleYOrbit: 0.06,
    alphaBase: 0.18,
    alphaOrbit: 0.32,
    radius: 0.92,
    points: 30,
    amp: 0.09,
    timeScale: 0.34,
    seed: 2.1,
    scaleX: 1.16,
    scaleY: 0.92,
    colors: [
      'rgba(203, 181, 255, 0.1)',
      'rgba(162, 108, 238, 0.34)',
      'rgba(184, 133, 246, 0.3)'
    ],
    positions: [0, 0.46, 1]
  },
  core: {
    alphaBase: 0.64,
    alphaBloom: 0.2,
    innerCenterX: -0.24,
    innerCenterY: -0.32,
    innerRadius: 0.06,
    outerRadius: 1.18,
    radius: 1,
    points: 42,
    ampBase: 0.06,
    ampOrbit: 0.03,
    timeScale: 0.46,
    seed: 1.2,
    scaleX: 1.01,
    scaleY: 1.02,
    colors: [
      'rgba(236, 222, 255, 0.66)',
      'rgba(190, 143, 246, 0.78)',
      'rgba(158, 110, 239, 0.76)',
      'rgba(135, 101, 219, 0.5)'
    ],
    positions: [0, 0.18, 0.62, 1]
  },
  highlight: {
    alpha: 0.18,
    color: 'rgba(255, 255, 255, 0.9)',
    centerX: -0.28,
    centerY: -0.25,
    radius: 0.34,
    points: 24,
    amp: 0.16,
    timeScale: 0.36,
    seed: 6.2,
    scaleX: 1.2,
    scaleY: 0.74
  },
  texture: {
    count: 42,
    blendMode: 'screen',
    driftAngle: 0.16,
    distanceBase: 0.42,
    distanceScale: 0.5,
    yAngleScale: 1.13,
    yScale: 0.88,
    sizeBase: 0.7,
    sizeBloom: 0.55,
    alphaScale: 1.8
  },
  center: {
    pulseTimeScale: 2.2,
    pulseAmplitude: 0.04,
    radiusBase: 0.115,
    radiusBloom: 0.02,
    alphaBase: 0.32,
    alphaBloom: 0.16,
    color: 'rgba(118, 84, 218, 0.42)',
    ringAlpha: 0.16,
    ringRadius: 1.72
  }
} as const;

export function createOrganicBlobPath(options: OrganicBlobOptions): SkPath {
  'worklet';
  const path = Skia.Path.Make();
  appendOrganicBlobPath(path, options);
  return path;
}

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

function appendOrganicBlobPath(path: SkPath, options: OrganicBlobOptions): void {
  'worklet';
  const points = buildOrganicBlobPoints(options);
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (!next) return;
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    if (index === 0) {
      path.moveTo(midX, midY);
    } else {
      path.quadTo(point.x, point.y, midX, midY);
    }
  });
  path.close();
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
  const { width } = useWindowDimensions();
  const canvasSize = width <= 380 ? Math.min(width * 0.86, 340) : Math.min(width * 0.78, 342);
  const coordinateScale = canvasSize / BREATH_RENDER_SPEC.canvasSize;
  const clock = useClock();
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
  const fixtureVisualTimeMs = useSharedValue<number | null>(
    props.fixtureVisualTimeMs ?? null
  );
  const transitionAmount = useSharedValue(1);
  const previousMotion = useSharedValue<BreathMotion>(
    initialFrameRef.current.motion
  );
  const previousInput = useRef(initialInputRef.current);

  const visualTime = useDerivedValue(
    () => fixtureVisualTimeMs.value ?? clock.value
  );
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

  useEffect(() => {
    const oldInput = previousInput.current;
    const directive = resolveBreathTransitionDirective(oldInput, nextInput);
    if (directive === 'snap') {
      cancelAnimation(transitionAmount);
      previousMotion.value = resolveBreathingVisualFrame(
        nextInput,
        props.fixtureVisualTimeMs ?? clock.value
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
    clock,
    motion,
    previousMotion,
    props.fixtureVisualTimeMs,
    props.phaseDurationMs,
    props.phaseProgress,
    props.reducedMotion,
    props.status,
    transitionAmount,
    visualKind
  ]);

  useEffect(() => {
    visualKindValue.value = visualKind;
    phaseDurationMs.value = props.phaseDurationMs;
    phaseProgress.value = clamp01(props.phaseProgress);
    reducedMotion.value = props.reducedMotion;
    renderStatus.value = props.status;
    fixtureVisualTimeMs.value = props.fixtureVisualTimeMs ?? null;
  }, [
    fixtureVisualTimeMs,
    phaseDurationMs,
    phaseProgress,
    props.fixtureVisualTimeMs,
    props.phaseDurationMs,
    props.phaseProgress,
    props.reducedMotion,
    props.status,
    reducedMotion,
    renderStatus,
    visualKind,
    visualKindValue
  ]);

  const radius = useDerivedValue(
    () => BREATH_RENDER_SPEC.canvasSize * BREATH_RENDER_SPEC.baseRadiusFraction * motion.value.scale
  );
  const timeSeconds = useDerivedValue(() => targetFrame.value.visualTimeMs / 1_000);

  const haloPath = usePathValue((path) => {
    'worklet';
    appendOrganicBlobPath(path, {
      cx: 0,
      cy: 0,
      radius: radius.value * BREATH_RENDER_SPEC.halo.radius,
      points: BREATH_RENDER_SPEC.halo.points,
      amp: BREATH_RENDER_SPEC.halo.amp,
      time: timeSeconds.value * BREATH_RENDER_SPEC.halo.timeScale,
      seed: BREATH_RENDER_SPEC.halo.seed,
      scaleX: BREATH_RENDER_SPEC.halo.scaleX,
      scaleY: BREATH_RENDER_SPEC.halo.scaleY
    });
  });
  const veilPath = usePathValue((path) => {
    'worklet';
    appendOrganicBlobPath(path, {
      cx: 0,
      cy: 0,
      radius: radius.value * BREATH_RENDER_SPEC.veil.radius,
      points: BREATH_RENDER_SPEC.veil.points,
      amp: BREATH_RENDER_SPEC.veil.amp,
      time: timeSeconds.value * BREATH_RENDER_SPEC.veil.timeScale,
      seed: BREATH_RENDER_SPEC.veil.seed,
      scaleX: BREATH_RENDER_SPEC.veil.scaleX,
      scaleY: BREATH_RENDER_SPEC.veil.scaleY
    });
  });
  const corePath = usePathValue((path) => {
    'worklet';
    appendOrganicBlobPath(path, {
      cx: 0,
      cy: 0,
      radius: radius.value * BREATH_RENDER_SPEC.core.radius,
      points: BREATH_RENDER_SPEC.core.points,
      amp:
        BREATH_RENDER_SPEC.core.ampBase +
        motion.value.orbit * BREATH_RENDER_SPEC.core.ampOrbit,
      time: timeSeconds.value * BREATH_RENDER_SPEC.core.timeScale,
      seed: BREATH_RENDER_SPEC.core.seed,
      scaleX: BREATH_RENDER_SPEC.core.scaleX,
      scaleY: BREATH_RENDER_SPEC.core.scaleY
    });
  });
  const highlightPath = usePathValue((path) => {
    'worklet';
    appendOrganicBlobPath(path, {
      cx: -radius.value * Math.abs(BREATH_RENDER_SPEC.highlight.centerX),
      cy: -radius.value * Math.abs(BREATH_RENDER_SPEC.highlight.centerY),
      radius: radius.value * BREATH_RENDER_SPEC.highlight.radius,
      points: BREATH_RENDER_SPEC.highlight.points,
      amp: BREATH_RENDER_SPEC.highlight.amp,
      time: timeSeconds.value * BREATH_RENDER_SPEC.highlight.timeScale,
      seed: BREATH_RENDER_SPEC.highlight.seed,
      scaleX: BREATH_RENDER_SPEC.highlight.scaleX,
      scaleY: BREATH_RENDER_SPEC.highlight.scaleY
    });
  });

  const rootTransform = useDerivedValue(() => [
    { translateX: BREATH_RENDER_SPEC.canvasSize / 2 },
    { translateY: BREATH_RENDER_SPEC.canvasSize / 2 + motion.value.lift / coordinateScale },
    { rotate: motion.value.rotate }
  ]);
  const glowOpacity = useDerivedValue(
    () => BREATH_RENDER_SPEC.glow.alphaBase + motion.value.bloom * BREATH_RENDER_SPEC.glow.alphaBloom
  );
  const glowInnerRadius = useDerivedValue(
    () => radius.value * BREATH_RENDER_SPEC.glow.innerRadius
  );
  const glowOuterRadius = useDerivedValue(
    () => radius.value * BREATH_RENDER_SPEC.glow.outerRadius
  );
  const glowCircleRadius = useDerivedValue(
    () => radius.value * BREATH_RENDER_SPEC.glow.circleRadius
  );
  const haloOpacity = useDerivedValue(
    () => BREATH_RENDER_SPEC.halo.alphaBase + motion.value.bloom * BREATH_RENDER_SPEC.halo.alphaBloom
  );
  const veilOpacity = useDerivedValue(
    () => BREATH_RENDER_SPEC.veil.alphaBase + motion.value.orbit * BREATH_RENDER_SPEC.veil.alphaOrbit
  );
  const veilTransform = useDerivedValue(() => [
    {
      rotate:
        BREATH_RENDER_SPEC.veil.rotationBase +
        Math.sin(timeSeconds.value * BREATH_RENDER_SPEC.veil.rotationTimeScale) *
          BREATH_RENDER_SPEC.veil.rotationWave
    },
    {
      scaleX:
        BREATH_RENDER_SPEC.veil.scaleXBase +
        motion.value.orbit * BREATH_RENDER_SPEC.veil.scaleXOrbit
    },
    {
      scaleY:
        BREATH_RENDER_SPEC.veil.scaleYBase +
        motion.value.orbit * BREATH_RENDER_SPEC.veil.scaleYOrbit
    }
  ]);
  const veilGradientStart = useDerivedValue(() => ({ x: -radius.value, y: 0 }));
  const veilGradientEnd = useDerivedValue(() => ({ x: radius.value, y: 0 }));
  const coreOpacity = useDerivedValue(
    () => BREATH_RENDER_SPEC.core.alphaBase + motion.value.bloom * BREATH_RENDER_SPEC.core.alphaBloom
  );
  const coreGradientStart = useDerivedValue(() => ({
    x: radius.value * BREATH_RENDER_SPEC.core.innerCenterX,
    y: radius.value * BREATH_RENDER_SPEC.core.innerCenterY
  }));
  const coreGradientStartRadius = useDerivedValue(
    () => radius.value * BREATH_RENDER_SPEC.core.innerRadius
  );
  const coreGradientEndRadius = useDerivedValue(
    () => radius.value * BREATH_RENDER_SPEC.core.outerRadius
  );
  const centerRadius = useDerivedValue(() => {
    const pulse =
      1 +
      Math.sin(timeSeconds.value * BREATH_RENDER_SPEC.center.pulseTimeScale) *
        BREATH_RENDER_SPEC.center.pulseAmplitude;
    return (
      radius.value *
      (BREATH_RENDER_SPEC.center.radiusBase +
        motion.value.bloom * BREATH_RENDER_SPEC.center.radiusBloom) *
      pulse
    );
  });
  const centerOpacity = useDerivedValue(
    () =>
      BREATH_RENDER_SPEC.center.alphaBase +
      motion.value.bloom * BREATH_RENDER_SPEC.center.alphaBloom
  );
  const centerRingRadius = useDerivedValue(
    () => centerRadius.value * BREATH_RENDER_SPEC.center.ringRadius
  );

  return (
    <Canvas
      testID="breathing-canvas"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: canvasSize, height: canvasSize, opacity: 0.96 }}
    >
      <Group transform={[{ scale: coordinateScale }]}>
        <Group transform={rootTransform}>
          <BreathLayer name="glow">
            <Circle cx={0} cy={0} r={glowCircleRadius} opacity={glowOpacity}>
              <BreathGradient
                kind="two-point"
                name="glow"
                start={vec(0, 0)}
                startR={glowInnerRadius}
                end={vec(0, 0)}
                endR={glowOuterRadius}
                colors={[...BREATH_RENDER_SPEC.glow.colors]}
                positions={[...BREATH_RENDER_SPEC.glow.positions]}
              />
              <BlurMask
                blur={BREATH_RENDER_SPEC.glow.blur}
                style="normal"
                respectCTM={false}
              />
            </Circle>
          </BreathLayer>

          <BreathLayer name="halo">
            <Path
              path={haloPath}
              color={BREATH_RENDER_SPEC.halo.color}
              opacity={haloOpacity}
            />
          </BreathLayer>

          <BreathLayer name="veil">
            <Group transform={veilTransform} opacity={veilOpacity}>
              <Path path={veilPath}>
                <BreathGradient
                  kind="linear"
                  name="veil"
                  start={veilGradientStart}
                  end={veilGradientEnd}
                  colors={[...BREATH_RENDER_SPEC.veil.colors]}
                  positions={[...BREATH_RENDER_SPEC.veil.positions]}
                />
              </Path>
            </Group>
          </BreathLayer>

          <BreathLayer name="core">
            <Path path={corePath} opacity={coreOpacity}>
              <BreathGradient
                kind="two-point"
                name="core"
                start={coreGradientStart}
                startR={coreGradientStartRadius}
                end={vec(0, 0)}
                endR={coreGradientEndRadius}
                colors={[...BREATH_RENDER_SPEC.core.colors]}
                positions={[...BREATH_RENDER_SPEC.core.positions]}
              />
            </Path>
          </BreathLayer>

          <BreathLayer name="highlight">
            <Path
              path={highlightPath}
              color={BREATH_RENDER_SPEC.highlight.color}
              opacity={BREATH_RENDER_SPEC.highlight.alpha}
            />
          </BreathLayer>

          <BreathLayer name="texture">
            <Group blendMode={BREATH_RENDER_SPEC.texture.blendMode}>
              {BREATH_TEXTURE.map((particle, index) => (
                <BreathParticle
                  key={index}
                  index={index}
                  particle={particle}
                  radius={radius}
                  motion={motion}
                  timeSeconds={timeSeconds}
                />
              ))}
            </Group>
          </BreathLayer>

          <BreathLayer name="center-core">
            <Circle
              cx={0}
              cy={0}
              r={centerRadius}
              color={BREATH_RENDER_SPEC.center.color}
              opacity={centerOpacity}
            />
          </BreathLayer>
          <BreathLayer name="center-ring">
            <Circle
              cx={0}
              cy={0}
              r={centerRingRadius}
              color={BREATH_RENDER_SPEC.center.color}
              opacity={BREATH_RENDER_SPEC.center.ringAlpha}
            />
          </BreathLayer>
        </Group>
      </Group>
    </Canvas>
  );
}

export type BreathParticleProps = {
  index: number;
  particle: BreathTextureParticle;
  radius: SharedValue<number>;
  motion: SharedValue<BreathMotion>;
  timeSeconds: SharedValue<number>;
};

export function BreathParticle({
  index,
  particle,
  radius,
  motion,
  timeSeconds
}: BreathParticleProps) {
  const center = useDerivedValue(() => {
    const driftAngle =
      particle.angle +
      Math.sin(timeSeconds.value * particle.drift + particle.angle) *
        BREATH_RENDER_SPEC.texture.driftAngle;
    const distance =
      radius.value *
      particle.distance *
      (BREATH_RENDER_SPEC.texture.distanceBase +
        motion.value.scale * BREATH_RENDER_SPEC.texture.distanceScale);
    return {
      x: Math.cos(driftAngle) * distance,
      y:
        Math.sin(driftAngle * BREATH_RENDER_SPEC.texture.yAngleScale) *
        distance *
        BREATH_RENDER_SPEC.texture.yScale
    };
  });
  const size = useDerivedValue(
    () =>
      particle.size *
      (BREATH_RENDER_SPEC.texture.sizeBase +
        motion.value.bloom * BREATH_RENDER_SPEC.texture.sizeBloom)
  );
  const centerColor = `rgba(255, 255, 255, ${particle.alpha * BREATH_RENDER_SPEC.texture.alphaScale})`;

  return (
    <Circle c={center} r={size}>
      <BreathGradient
        kind="radial"
        name="particle"
        particleIndex={index}
        c={center}
        r={size}
        colors={[centerColor, 'rgba(255, 255, 255, 0)']}
        positions={[0, 1]}
      />
    </Circle>
  );
}
