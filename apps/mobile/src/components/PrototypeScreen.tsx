import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import {
  colors,
  customGradientColors,
  customGradientLocations,
  gradientColors,
  gradientLocations,
  layout
} from '../theme/tokens';

export type PrototypeScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  nestedScrollEnabled?: boolean;
  keyboardAvoiding?: boolean;
  backgroundVariant?: 'practice' | 'records' | 'guide' | 'focus' | 'custom' | 'auth';
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

type BackgroundVariant = NonNullable<PrototypeScreenProps['backgroundVariant']>;

const backgroundGradients = {
  practice: {
    colors: [gradientColors[0], gradientColors[0], gradientColors[1], gradientColors[2]],
    locations: [gradientLocations[0], 0.2, gradientLocations[1], gradientLocations[2]]
  },
  auth: {
    colors: [gradientColors[0], gradientColors[0], gradientColors[1], gradientColors[2]],
    locations: [gradientLocations[0], 0.2, gradientLocations[1], gradientLocations[2]]
  },
  records: { colors: [...gradientColors], locations: [...gradientLocations] },
  guide: { colors: [...gradientColors], locations: [...gradientLocations] },
  focus: {
    colors: [...gradientColors],
    locations: [gradientLocations[0], 0.58, gradientLocations[2]]
  },
  custom: {
    colors: [...customGradientColors],
    locations: [...customGradientLocations]
  }
} satisfies Record<BackgroundVariant, { colors: string[]; locations: number[] }>;

const haloConfigs = {
  guide: { centerY: '16%', alpha: 0.56, radius: 320 },
  focus: { centerY: '34%', alpha: 0.68, radius: 304 }
} as const;

type HaloVariant = keyof typeof haloConfigs;

function PrototypeHalo({ variant }: { variant: HaloVariant }) {
  const { centerY, alpha, radius } = haloConfigs[variant];
  const gradientID = `prototype-${variant}-halo-gradient`;

  return (
    <Svg
      height="100%"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      testID="prototype-screen-halo"
      width="100%"
    >
      <Defs>
        <RadialGradient
          cx="50%"
          cy={centerY}
          gradientUnits="userSpaceOnUse"
          id={gradientID}
          r={radius}
        >
          <Stop offset={0} stopColor={colors.surfaceStrong} stopOpacity={alpha} />
          <Stop offset={144 / radius} stopColor={colors.surfaceStrong} stopOpacity={alpha} />
          <Stop offset={1} stopColor={colors.surfaceStrong} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50%" cy={centerY} fill={`url(#${gradientID})`} r={radius} />
    </Svg>
  );
}

export function PrototypeScreen({
  children,
  scrollable = false,
  nestedScrollEnabled = false,
  keyboardAvoiding = false,
  backgroundVariant = 'practice',
  contentStyle,
  testID
}: PrototypeScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = width > 380 ? layout.screenGutter : layout.compactScreenGutter;
  const gradient = backgroundGradients[backgroundVariant];
  const frameStyle = [
    styles.frame,
    scrollable ? styles.scrollFrame : styles.fixedFrame,
    { paddingHorizontal: gutter },
    contentStyle
  ];

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContentContainer]}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled={nestedScrollEnabled}
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}
    >
      <View style={frameStyle} testID={testID ? `${testID}-content` : undefined}>
        {children}
      </View>
    </ScrollView>
  ) : (
    <View style={frameStyle} testID={testID ? `${testID}-content` : undefined}>
      {children}
    </View>
  );

  const keyboardAwareContent = keyboardAvoiding ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );

  return (
    <View style={styles.root} testID={testID}>
      <LinearGradient
        colors={gradient.colors as [string, string, ...string[]]}
        locations={gradient.locations as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
      {backgroundVariant === 'guide' || backgroundVariant === 'focus' ? (
        <PrototypeHalo variant={backgroundVariant} />
      ) : null}
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: insets.top,
            paddingRight: insets.right,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left
          }
        ]}
        testID="prototype-screen-safe-area"
      >
        {keyboardAwareContent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  flex: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  scrollContentContainer: {
    flexGrow: 1
  },
  frame: {
    alignSelf: 'center',
    maxWidth: 420,
    width: '100%'
  },
  fixedFrame: {
    flex: 1
  },
  scrollFrame: {
    flexGrow: 1
  }
});
