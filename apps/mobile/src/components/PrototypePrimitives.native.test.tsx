import React from 'react';
import { jest } from '@jest/globals';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, RadialGradient, Stop } from 'react-native-svg';

import { referenceImages } from '../theme/assets';
import { fontFamilies } from '../theme/fonts';
import {
  colors,
  customGradientColors,
  customGradientLocations,
  gradientColors,
  layout,
  type
} from '../theme/tokens';
import { AppText } from './AppText';
import { InlineState } from './InlineState';
import { PrototypeButton } from './PrototypeButton';
import { PrototypeHeader } from './PrototypeHeader';
import { PrototypeIconButton } from './PrototypeIconButton';
import { PrototypeScreen } from './PrototypeScreen';

let mockWindowWidth = 390;
const mockSafeAreaInsets = { top: 11, right: 3, bottom: 13, left: 5 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 844,
    scale: 3,
    fontScale: 1
  })
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context'
  ),
  useSafeAreaInsets: () => mockSafeAreaInsets
}));

describe('AppText', () => {
  it('uses the Task 2 display, body, and system font families', () => {
    const view = render(
      <View>
        <AppText testID="display-hero" variant="displayHero">Hero</AppText>
        <AppText testID="display-title" variant="displayTitle">Title</AppText>
        <AppText testID="display-section" variant="displaySection">Section</AppText>
        <AppText testID="card-title" variant="cardTitle">Card</AppText>
        <AppText testID="body" variant="body">Body</AppText>
        <AppText testID="label" variant="label">Label</AppText>
        <AppText testID="meta" variant="meta">Meta</AppText>
        <AppText testID="timer" variant="timer">04:00</AppText>
        <AppText testID="system" systemFont>System</AppText>
      </View>
    );

    for (const testID of ['display-hero', 'display-title', 'display-section', 'card-title']) {
      expect(StyleSheet.flatten(view.getByTestId(testID).props.style).fontFamily).toBe(
        fontFamilies.display
      );
    }

    for (const testID of ['body', 'label', 'meta']) {
      expect(StyleSheet.flatten(view.getByTestId(testID).props.style).fontFamily).toBe(
        fontFamilies.body
      );
    }

    expect(StyleSheet.flatten(view.getByTestId('timer').props.style)).toMatchObject({
      ...type.hero,
      fontFamily: fontFamilies.system
    });
    expect(StyleSheet.flatten(view.getByTestId('system').props.style).fontFamily).toBe(
      fontFamilies.system
    );
  });

  it('caps dynamic type without disabling scaling and passes Text props through', () => {
    const view = render(
      <AppText
        accessibilityLabel="介绍"
        allowFontScaling={false}
        maxFontSizeMultiplier={4}
        numberOfLines={1}
        testID="copy"
        tone="teal"
        variant="body"
      >
        保持觉察
      </AppText>
    );
    const copy = view.getByTestId('copy');

    expect(copy.props.accessibilityLabel).toBe('介绍');
    expect(copy.props.numberOfLines).toBe(1);
    expect(copy.props.allowFontScaling).toBe(true);
    expect(copy.props.maxFontSizeMultiplier).toBe(1.2);
    expect(StyleSheet.flatten(copy.props.style)).toMatchObject({
      ...type.body,
      color: colors.teal,
      fontFamily: fontFamilies.body
    });
  });

  it('registers a visual QA text ID without discarding caller text-layout handling', () => {
    const onTextLayout = jest.fn();
    const view = render(
      <AppText
        onTextLayout={onTextLayout}
        testID="caller-copy"
        visualQaId="qa-copy"
      >
        可测量文案
      </AppText>
    );
    const copy = view.getByTestId('caller-copy');

    expect(copy.props.nativeID).toBe('qa-copy');
    expect(copy.props.testID).toBe('caller-copy');
    fireEvent(copy, 'textLayout', {
      nativeEvent: { lines: [{ text: '可测量文案' }] }
    });
    expect(onTextLayout).toHaveBeenCalledTimes(1);
  });
});

describe('PrototypeScreen', () => {
  const backgroundCases = [
    {
      variant: 'practice' as const,
      colors: [gradientColors[0], gradientColors[0], gradientColors[1], gradientColors[2]],
      locations: [0, 0.2, 0.56, 1]
    },
    {
      variant: 'auth' as const,
      colors: [gradientColors[0], gradientColors[0], gradientColors[1], gradientColors[2]],
      locations: [0, 0.2, 0.56, 1]
    },
    { variant: 'records' as const, colors: [...gradientColors], locations: [0, 0.56, 1] },
    { variant: 'guide' as const, colors: [...gradientColors], locations: [0, 0.56, 1] },
    { variant: 'focus' as const, colors: [...gradientColors], locations: [0, 0.58, 1] },
    {
      variant: 'custom' as const,
      colors: [...customGradientColors],
      locations: [...customGradientLocations]
    }
  ];

  it.each(backgroundCases)('renders the exact $variant gradient', ({ variant, colors, locations }) => {
    const view = render(<PrototypeScreen backgroundVariant={variant}>Content</PrototypeScreen>);
    const gradient = view.UNSAFE_getByType(LinearGradient);

    expect(gradient.props.colors).toEqual(colors);
    expect(gradient.props.locations).toEqual(locations);
    expect(gradient.props.style).toEqual(StyleSheet.absoluteFill);
  });

  it('renders a fixed, safe-area-aware, centered frame with the wide gutter', () => {
    mockWindowWidth = 381;
    const view = render(
      <PrototypeScreen contentStyle={{ paddingBottom: 7 }} testID="fixed-screen">
        <AppText>Fixed</AppText>
      </PrototypeScreen>
    );

    expect(view.getByTestId('fixed-screen')).toBeTruthy();
    expect(view.UNSAFE_queryByType(ScrollView)).toBeNull();
    expect(view.UNSAFE_queryByType(KeyboardAvoidingView)).toBeNull();
    expect(StyleSheet.flatten(view.getByTestId('prototype-screen-safe-area').props.style)).toMatchObject({
      paddingTop: mockSafeAreaInsets.top,
      paddingRight: mockSafeAreaInsets.right,
      paddingBottom: mockSafeAreaInsets.bottom,
      paddingLeft: mockSafeAreaInsets.left
    });
    expect(StyleSheet.flatten(view.getByTestId('fixed-screen-content').props.style)).toMatchObject({
      alignSelf: 'center',
      maxWidth: 420,
      paddingBottom: 7,
      paddingHorizontal: layout.screenGutter,
      width: '100%'
    });
  });

  it('registers the screen root as a visual QA node without replacing its caller test ID', () => {
    const view = render(
      <PrototypeScreen testID="caller-screen" visualQaId="qa-screen">
        <AppText>Fixture</AppText>
      </PrototypeScreen>
    );

    expect(view.getByTestId('caller-screen').props.nativeID).toBe('qa-screen');
  });

  it('can register the existing content frame independently from the screen root', () => {
    const view = render(
      <PrototypeScreen
        scrollable
        testID="caller-screen"
        visualQaContentId="qa-content"
      >
        <AppText>Fixture</AppText>
      </PrototypeScreen>
    );

    expect(view.getByTestId('caller-screen').props.nativeID).toBeUndefined();
    expect(view.getByTestId('caller-screen-content').props.nativeID).toBe(
      'qa-content'
    );
  });

  it('uses the compact gutter at 380 points and can scroll with keyboard avoidance', () => {
    mockWindowWidth = 380;
    const view = render(
      <PrototypeScreen
        keyboardAvoiding
        nestedScrollEnabled
        scrollable
        testID="scroll-screen"
      >
        <AppText>Scrollable</AppText>
      </PrototypeScreen>
    );

    expect(view.UNSAFE_getByType(ScrollView).props.contentContainerStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexGrow: 1 })])
    );
    expect(view.UNSAFE_getByType(ScrollView).props.nestedScrollEnabled).toBe(true);
    expect(view.UNSAFE_getByType(KeyboardAvoidingView)).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('scroll-screen-content').props.style)).toMatchObject({
      maxWidth: 420,
      paddingHorizontal: layout.compactScreenGutter,
      width: '100%'
    });
  });

  it.each([
    { variant: 'guide' as const, centerY: '16%', alpha: 0.56, radius: 320 },
    { variant: 'focus' as const, centerY: '34%', alpha: 0.68, radius: 304 }
  ])(
    'draws the exact $variant SVG radial halo behind the content',
    ({ variant, centerY, alpha, radius }) => {
      const view = render(
        <PrototypeScreen backgroundVariant={variant} testID={`${variant}-screen`}>
          <AppText>Foreground</AppText>
        </PrototypeScreen>
      );
      const svg = view.UNSAFE_getByType(Svg);
      const radial = view.UNSAFE_getByType(RadialGradient);
      const circle = view.UNSAFE_getByType(Circle);
      const stops = view.UNSAFE_getAllByType(Stop);
      const root = view.getByTestId(`${variant}-screen`);
      const childContainsTestID = (child: unknown, testID: string) => {
        if (typeof child !== 'object' || child === null) {
          return false;
        }

        const node = child as {
          props: { testID?: string };
          findAllByProps: (props: { testID: string }) => unknown[];
        };
        return node.props.testID === testID || node.findAllByProps({ testID }).length > 0;
      };
      const haloIndex = root.children.findIndex((child: unknown) =>
        childContainsTestID(child, 'prototype-screen-halo')
      );
      const safeAreaIndex = root.children.findIndex((child: unknown) =>
        childContainsTestID(child, 'prototype-screen-safe-area')
      );

      expect(svg.props.pointerEvents).toBe('none');
      expect(radial.props).toMatchObject({
        cx: '50%',
        cy: centerY,
        gradientUnits: 'userSpaceOnUse',
        r: radius
      });
      expect(circle.props).toMatchObject({ cx: '50%', cy: centerY, r: radius });
      expect(stops.map((stop) => stop.props.offset)).toEqual([0, 144 / radius, 1]);
      expect(stops.map((stop) => stop.props.stopColor)).toEqual(['#ffffff', '#ffffff', '#ffffff']);
      expect(stops.map((stop) => stop.props.stopOpacity)).toEqual([alpha, alpha, 0]);
      expect(haloIndex).toBeGreaterThanOrEqual(0);
      expect(safeAreaIndex).toBeGreaterThanOrEqual(0);
      expect(haloIndex).toBeLessThan(safeAreaIndex);
    }
  );

  it('does not render a halo on the custom background', () => {
    const view = render(
      <PrototypeScreen backgroundVariant="custom">
        <AppText>Custom</AppText>
      </PrototypeScreen>
    );

    expect(view.UNSAFE_queryByType(Svg)).toBeNull();
    expect(view.UNSAFE_queryByType(RadialGradient)).toBeNull();
  });
});

describe('PrototypeIconButton', () => {
  it('uses button semantics, the supplied image, a 44-point target, and the default hit slop', () => {
    const onPress = jest.fn();
    const view = render(
      <PrototypeIconButton
        accessibilityLabel="查看信息"
        onPress={onPress}
        source={referenceImages.info}
      />
    );
    const button = view.getByRole('button', { name: '查看信息' });

    expect(button.props.hitSlop).toBe(8);
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      minHeight: layout.touchTarget,
      minWidth: layout.touchTarget,
      height: layout.touchTarget,
      width: layout.touchTarget
    });
    expect(view.UNSAFE_getByType(Image).props.source).toBe(referenceImages.info);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes and enforces its disabled state', () => {
    const onPress = jest.fn();
    const view = render(
      <PrototypeIconButton
        accessibilityLabel="不可用"
        disabled
        onPress={onPress}
        source={referenceImages.gear}
      />
    );
    const button = view.getByRole('button', { name: '不可用', disabled: true });

    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('preserves the minimum target against static and callback styles while allowing larger sizes', () => {
    const view = render(
      <View>
        <PrototypeIconButton
          accessibilityLabel="静态缩小"
          source={referenceImages.info}
          style={{ height: 10, minHeight: 10, minWidth: 10, width: 10 }}
          testID="icon-static-small"
        />
        <PrototypeIconButton
          accessibilityLabel="回调缩小"
          source={referenceImages.info}
          style={() => ({ height: 12, minHeight: 12, minWidth: 12, width: 12 })}
          testID="icon-callback-small"
        />
        <PrototypeIconButton
          accessibilityLabel="放大"
          source={referenceImages.info}
          style={{ height: 64, minHeight: 64, minWidth: 68, width: 68 }}
          testID="icon-large"
        />
      </View>
    );

    expect(StyleSheet.flatten(view.getByTestId('icon-static-small').props.style)).toMatchObject({
      minHeight: layout.touchTarget,
      minWidth: layout.touchTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('icon-callback-small').props.style)).toMatchObject({
      minHeight: layout.touchTarget,
      minWidth: layout.touchTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('icon-large').props.style)).toMatchObject({
      height: 64,
      minHeight: 64,
      minWidth: 68,
      width: 68
    });
  });
});

describe('PrototypeButton', () => {
  it('registers the pressable itself as a visual QA node', () => {
    const view = render(
      <PrototypeButton
        label="开始"
        testID="caller-button"
        visualQaId="qa-button"
      />
    );

    expect(view.getByTestId('caller-button').props.nativeID).toBe('qa-button');
  });

  it('renders only the primary and quiet visual contracts with a 44-point minimum target', () => {
    const view = render(
      <View>
        <PrototypeButton label="开始练习" testID="primary" />
        <PrototypeButton label="稍后" testID="quiet" variant="quiet" />
      </View>
    );

    expect(StyleSheet.flatten(view.getByTestId('primary').props.style)).toMatchObject({
      backgroundColor: colors.accentStrong,
      minHeight: layout.touchTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('quiet').props.style)).toMatchObject({
      backgroundColor: 'transparent',
      minHeight: layout.touchTarget
    });
    expect(view.getByRole('button', { name: '开始练习' })).toBeTruthy();
    expect(view.getByRole('button', { name: '稍后' })).toBeTruthy();
  });

  it('keeps its label while loading and becomes busy, disabled, and inert', () => {
    const onPress = jest.fn();
    const view = render(<PrototypeButton label="保存" loading onPress={onPress} />);
    const button = view.getByRole('button', { name: '保存', disabled: true, busy: true });

    expect(view.getByText('保存')).toBeTruthy();
    expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();

    view.rerender(<PrototypeButton disabled label="保存" onPress={onPress} />);
    const disabledButton = view.getByRole('button', { name: '保存', disabled: true, busy: false });
    fireEvent.press(disabledButton);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('preserves the minimum target against static and callback styles while allowing larger sizes', () => {
    const view = render(
      <View>
        <PrototypeButton
          label="静态缩小"
          style={{ minHeight: 10, minWidth: 10 }}
          testID="button-static-small"
        />
        <PrototypeButton
          label="回调缩小"
          style={() => ({ minHeight: 12, minWidth: 12 })}
          testID="button-callback-small"
        />
        <PrototypeButton
          label="放大"
          style={{ minHeight: 64, minWidth: 68 }}
          testID="button-large"
        />
      </View>
    );

    expect(StyleSheet.flatten(view.getByTestId('button-static-small').props.style)).toMatchObject({
      minHeight: layout.touchTarget,
      minWidth: layout.touchTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('button-callback-small').props.style)).toMatchObject({
      minHeight: layout.touchTarget,
      minWidth: layout.touchTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('button-large').props.style)).toMatchObject({
      minHeight: 64,
      minWidth: 68
    });
  });
});

describe('InlineState', () => {
  it('renders loading, empty, warning, and error as accessible inline states', () => {
    const loading = render(<InlineState kind="loading" message="正在同步" title="同步中" />);
    const loadingState = loading.getByRole('progressbar', { name: '同步中. 正在同步' });
    expect(loadingState.props.accessibilityState).toMatchObject({ busy: true });
    expect(loadingState.props.accessibilityViewIsModal).toBe(false);
    loading.unmount();

    const empty = render(<InlineState kind="empty" message="完成练习后会显示记录" title="暂无记录" />);
    expect(empty.getByRole('summary', { name: '暂无记录. 完成练习后会显示记录' })).toBeTruthy();
    expect(empty.getByRole('summary').props.accessibilityViewIsModal).toBe(false);
    empty.unmount();

    const warning = render(<InlineState kind="warning" message="当前显示缓存数据" title="更新失败" />);
    const warningState = warning.getByRole('summary', { name: '更新失败. 当前显示缓存数据' });
    expect(warningState.props.accessibilityLiveRegion).toBe('polite');
    expect(warningState.props.accessibilityViewIsModal).toBe(false);
    expect(warning.queryByRole('alert')).toBeNull();
    warning.unmount();

    const error = render(<InlineState kind="error" message="请检查网络后重试" title="无法加载" />);
    const errorState = error.getByRole('alert', { name: '无法加载. 请检查网络后重试' });
    expect(errorState.props.accessibilityLiveRegion).toBe('assertive');
    expect(errorState.props.accessibilityViewIsModal).toBe(false);
  });

  it('shows an error retry only when both its label and callback are present', () => {
    const onAction = jest.fn();
    const view = render(
      <InlineState
        actionLabel="重试"
        kind="error"
        message="网络不可用"
        onAction={onAction}
      />
    );
    fireEvent.press(view.getByRole('button', { name: '重试' }));
    expect(onAction).toHaveBeenCalledTimes(1);

    view.rerender(<InlineState actionLabel="重试" kind="error" message="网络不可用" />);
    expect(view.queryByRole('button')).toBeNull();

    view.rerender(
      <InlineState
        actionLabel="重试"
        kind="warning"
        message="正在显示缓存"
        onAction={onAction}
      />
    );
    expect(view.queryByRole('button')).toBeNull();
  });
});

describe('PrototypeHeader', () => {
  it('uses the exact back asset, centered title, equal 52-point slots, and optional right content', () => {
    const onBack = jest.fn();
    const view = render(
      <PrototypeHeader
        backLabel="返回练习"
        onBack={onBack}
        right={<View testID="right-content" />}
        title="呼吸引导"
      />
    );
    const back = view.getByRole('button', { name: '返回练习' });

    expect(view.getByRole('header', { name: '呼吸引导' })).toBeTruthy();
    expect(StyleSheet.flatten(view.getByTestId('prototype-header-title').props.style).textAlign).toBe(
      'center'
    );
    expect(StyleSheet.flatten(view.getByTestId('prototype-header-left-slot').props.style)).toMatchObject({
      height: layout.headerIconTarget,
      width: layout.headerIconTarget
    });
    expect(StyleSheet.flatten(view.getByTestId('prototype-header-right-slot').props.style)).toMatchObject({
      height: layout.headerIconTarget,
      width: layout.headerIconTarget
    });
    expect(view.UNSAFE_getByType(Image).props.source).toBe(referenceImages.back);
    expect(view.getByTestId('right-content')).toBeTruthy();
    fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps an empty right slot when no right content is supplied', () => {
    const view = render(<PrototypeHeader backLabel="返回" onBack={() => undefined} title="设置" />);

    expect(view.getByTestId('prototype-header-right-slot').children).toHaveLength(0);
  });
});
