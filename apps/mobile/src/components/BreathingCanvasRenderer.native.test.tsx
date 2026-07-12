import { jest } from '@jest/globals';
import { Skia } from '@shopify/react-native-skia';
import { configure, render } from '@testing-library/react-native';
import { makeMutable } from 'react-native-reanimated';
import { getBreathMotion } from '../domain/breathMotion';
import {
  BREATH_LAYER_ORDER,
  BREATH_RENDER_SPEC,
  BreathGradient,
  BreathLayer,
  BreathParticle,
  BreathingCanvasRenderer,
  createOrganicBlobPath
} from './BreathingCanvasRenderer';

type RenderedNode = {
  type: unknown;
  props: Record<string, any>;
  findAll(predicate: (node: RenderedNode) => boolean): RenderedNode[];
};

configure({ defaultIncludeHiddenElements: true });

describe('BreathingCanvasRenderer contract', () => {
  it('keeps the exact Web layer order and drawing constants', () => {
    expect(BREATH_LAYER_ORDER).toEqual([
      'glow',
      'halo',
      'veil',
      'core',
      'highlight',
      'texture',
      'center-core',
      'center-ring'
    ]);
    expect(BREATH_RENDER_SPEC).toEqual({
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
        timeScale: 0.28,
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
        timeScale: 0.4,
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
        timeScale: 0.22,
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
        pulseTimeScale: 0.4,
        pulseAmplitude: 0.02,
        radiusBase: 0.115,
        radiusBloom: 0.02,
        alphaBase: 0.32,
        alphaBloom: 0.16,
        color: 'rgba(118, 84, 218, 0.42)',
        ringAlpha: 0.16,
        ringRadius: 1.72
      }
    });
  });

  it('builds a closed quadratic Skia path from organic points', () => {
    const path = createOrganicBlobPath({
      cx: 0,
      cy: 0,
      radius: 100,
      points: 8,
      amp: 0.06,
      time: 0.5,
      seed: 1.2
    });

    expect(path.isEmpty()).toBe(false);
    expect(path.toSVGString()).toContain('Q');
    expect(path.toSVGString()).toMatch(/Z$/);
  });

  it('owns drawing but no business timing', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/components/BreathingCanvasRenderer.tsx`,
      'utf8'
    );
    expect(source).not.toMatch(
      /SessionClockSnapshot|phaseKey|phaseElapsedMs|phaseProgress|status/
    );
    expect(source).toContain('usePathValue');
    expect(source).not.toMatch(
      /useDerivedValue\(\(\) =>\s*createOrganicBlobPath/
    );
  });

  it('accepts only shared motion and ambient time', () => {
    const motion = makeMutable(getBreathMotion('inhale', 0.5, 2_000));
    const ambientTimeMs = makeMutable(2_000);
    const view = render(
      <BreathingCanvasRenderer
        motion={motion}
        ambientTimeMs={ambientTimeMs}
      />
    );
    expect(view.getByTestId('breathing-canvas')).toBeTruthy();
  });

  it('reuses the four native Skia paths across renderer updates', () => {
    const makePath = jest.spyOn(Skia.Path, 'Make');
    try {
      const motion = makeMutable(getBreathMotion('inhale', 0.25, 0));
      const ambientTimeMs = makeMutable(0);
      const canvas = render(
        <BreathingCanvasRenderer
          motion={motion}
          ambientTimeMs={ambientTimeMs}
        />
      );
      const initialPathAllocations = makePath.mock.calls.length;

      motion.value = getBreathMotion('inhale', 0.5, 16);
      ambientTimeMs.value = 16;
      canvas.rerender(
        <BreathingCanvasRenderer
          motion={motion}
          ambientTimeMs={ambientTimeMs}
        />
      );

      expect(initialPathAllocations).toBeGreaterThanOrEqual(4);
      expect(makePath).toHaveBeenCalledTimes(initialPathAllocations);
    } finally {
      makePath.mockRestore();
    }
  });

  it('binds layer order, gradients, and particles through typed JSX wrappers', () => {
    const canvas = render(
      <BreathingCanvasRenderer
        motion={makeMutable(getBreathMotion('inhale', 0.25, 0))}
        ambientTimeMs={makeMutable(0)}
      />
    );
    const layers = canvas.UNSAFE_root.findAllByType(BreathLayer) as RenderedNode[];
    expect(layers.map((layer) => layer.props.name)).toEqual(BREATH_LAYER_ORDER);

    const gradients = canvas.UNSAFE_root.findAllByType(BreathGradient) as RenderedNode[];
    const getGradient = (name: 'glow' | 'veil' | 'core') => {
      const matches = gradients.filter((gradient) => gradient.props.name === name);
      expect(matches).toHaveLength(1);
      return matches[0]!;
    };
    expect(getGradient('glow').props).toMatchObject({
      kind: 'two-point',
      colors: [...BREATH_RENDER_SPEC.glow.colors],
      positions: [...BREATH_RENDER_SPEC.glow.positions]
    });
    expect(getGradient('veil').props).toMatchObject({
      kind: 'linear',
      colors: [...BREATH_RENDER_SPEC.veil.colors],
      positions: [...BREATH_RENDER_SPEC.veil.positions]
    });
    expect(getGradient('core').props).toMatchObject({
      kind: 'two-point',
      colors: [...BREATH_RENDER_SPEC.core.colors],
      positions: [...BREATH_RENDER_SPEC.core.positions]
    });
    for (const gradient of gradients) {
      const expectedHostType =
        gradient.props.kind === 'linear'
          ? 'skLinearGradient'
          : gradient.props.kind === 'radial'
            ? 'skRadialGradient'
            : 'skTwoPointConicalGradient';
      expect(
        gradient.findAll((node) => node.type === expectedHostType)
      ).toHaveLength(1);
    }

    const particles = canvas.UNSAFE_root.findAllByType(BreathParticle) as RenderedNode[];
    expect(particles).toHaveLength(42);
    expect(particles.map((particle) => particle.props.index)).toEqual(
      Array.from({ length: 42 }, (_, index) => index)
    );

    const particleGradients = gradients.filter(
      (gradient) => gradient.props.name === 'particle'
    );
    expect(particleGradients).toHaveLength(42);
    for (const gradient of particleGradients) {
      expect(gradient.props.kind).toBe('radial');
      expect(gradient.props.positions).toEqual([0, 1]);
      expect(gradient.props.colors[1]).toBe('rgba(255, 255, 255, 0)');
    }
    expect(particleGradients[0]?.props.colors).toEqual([
      'rgba(255, 255, 255, 0.027)',
      'rgba(255, 255, 255, 0)'
    ]);

    const skiaHostsWithTestIDs = canvas.UNSAFE_root.findAll(
      (node: RenderedNode) =>
        typeof node.type === 'string' &&
        node.type.startsWith('sk') &&
        typeof node.props.testID === 'string'
    );
    expect(skiaHostsWithTestIDs).toHaveLength(0);
  });

  it('caches the compatibility CanvasKit initialization at module scope', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const source = readFileSync(
      `${process.cwd()}/src/test/skiaJestEnv.cjs`,
      'utf8'
    );

    expect(source).toContain(
      'Mirrors @shopify/react-native-skia/jestEnv.mjs'
    );
    expect(source).toMatch(
      /const canvasKitPromise = CanvasKitInit\(\{\}\);/
    );
    expect(source).toContain(
      'this.global.CanvasKit = await canvasKitPromise;'
    );
  });

  it('renders a decorative CanvasKit-backed native canvas', () => {
    const canvas = render(
      <BreathingCanvasRenderer
        motion={makeMutable(getBreathMotion('inhale', 0.25, 0))}
        ambientTimeMs={makeMutable(0)}
      />
    );

    const renderedCanvas = canvas.getByTestId('breathing-canvas', {
      includeHiddenElements: true
    });
    expect(renderedCanvas).toBeTruthy();
    expect(renderedCanvas).toHaveProp(
      'importantForAccessibility',
      'no-hide-descendants'
    );
  });
});
