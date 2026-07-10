import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

type BreathingOrbProps = {
  /** Target scale (roughly 0.7–1.05) derived from the current breathing phase. */
  scaleTarget: number;
  /** Whether the orb should visibly breathe (running) vs rest. */
  active: boolean;
  /** Method-specific tint for the orb core/glow. */
  glow: string;
};

const ORB = 220;

export function BreathingOrb({ scaleTarget, active, glow }: BreathingOrbProps) {
  const scale = useSharedValue(scaleTarget);

  useEffect(() => {
    // Re-target on every phase snapshot; the long, eased timing means the orb
    // continuously swells toward the moving target for a smooth breath.
    scale.value = withTiming(scaleTarget, {
      duration: active ? 900 : 500,
      easing: Easing.inOut(Easing.ease)
    });
  }, [scaleTarget, active, scale]);

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * 1.16 }],
    opacity: 0.5
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * 1.34 }],
    opacity: 0.28
  }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.circle, styles.glow, { backgroundColor: glow }, glowStyle]} />
      <Animated.View style={[styles.circle, styles.halo, { backgroundColor: glow }, haloStyle]} />
      <Animated.View style={[styles.circle, styles.core, { backgroundColor: glow }, coreStyle]}>
        <View style={styles.highlight} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: ORB * 1.4,
    height: ORB * 1.4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  circle: {
    position: 'absolute',
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2
  },
  glow: {},
  halo: {},
  core: {
    borderWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7a6bd0',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8
  },
  highlight: {
    position: 'absolute',
    top: ORB * 0.16,
    left: ORB * 0.2,
    width: ORB * 0.32,
    height: ORB * 0.32,
    borderRadius: ORB * 0.16,
    backgroundColor: 'rgba(255, 255, 255, 0.5)'
  }
});
