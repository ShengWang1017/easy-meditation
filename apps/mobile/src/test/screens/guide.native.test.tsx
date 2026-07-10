import React from 'react';
import { jest } from '@jest/globals';
import { Image, StyleSheet } from 'react-native';
import { fireEvent } from '@testing-library/react-native';

let mockHasBackEntry = true;
let mockWindowWidth = 390;
const mockRouter = {
  back: jest.fn(),
  replace: jest.fn()
};

jest.mock('expo-router', () => ({
  router: {
    back: () => mockRouter.back(),
    canGoBack: () => mockHasBackEntry,
    replace: (href: unknown) => mockRouter.replace(href)
  }
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 844,
    scale: 3,
    fontScale: 1
  })
}));

import GuideScreen from '../../../app/guide';
import { AppText } from '../../components/AppText';
import { PrototypeScreen } from '../../components/PrototypeScreen';
import { referenceImages } from '../../theme/assets';
import { renderWithProviders } from '../renderWithProviders';

const guideCopy = [
  '开始前读一小段就好',
  '呼吸训练让注意力有一个温柔的落点。',
  '它为什么有用',
  '有节奏地吸气、停留和呼气，会让身体从紧绷里慢慢退出来。你不需要“清空大脑”，只要一次次回到下一次呼吸。',
  '盒式呼吸法',
  '适合紧张或思绪很多的时候，用均匀节奏稳定自己。',
  '长呼气',
  '呼气更长，适合睡前或需要慢慢降速的时刻。',
  '等量呼吸法',
  '吸气和呼气等长，适合工作间隙重新找回专注。',
  '自定义',
  '按自己的舒适区调整节奏；任何不舒服都可以缩短停留。'
] as const;

describe('GuideScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasBackEntry = true;
    mockWindowWidth = 390;
  });

  it('renders the exact guide copy in the Web prototype order', () => {
    const view = renderWithProviders(<GuideScreen />);

    expect(view.getByRole('header', { name: '练习指南' })).toBeTruthy();
    expect(
      view
        .UNSAFE_getAllByType(AppText)
        .map((node) => node.props.children)
        .filter((content) =>
          guideCopy.includes(content as (typeof guideCopy)[number])
        )
    ).toEqual(guideCopy);
    const screen = view.UNSAFE_getByType(PrototypeScreen);
    expect(screen.props).toMatchObject({
      backgroundVariant: 'guide',
      scrollable: true
    });
    expect(view.getByTestId('prototype-screen-halo')).toBeTruthy();
  });

  it('uses the source back asset and history back with a practice fallback', () => {
    const view = renderWithProviders(<GuideScreen />);
    const back = view.getByRole('button', { name: '返回呼吸训练首页' });

    expect(view.UNSAFE_getByType(Image).props.source).toBe(referenceImages.back);
    fireEvent.press(back);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    mockHasBackEntry = false;
    mockRouter.back.mockClear();
    fireEvent.press(back);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/practice');
  });

  it('matches the wide and compact guide geometry', () => {
    const view = renderWithProviders(<GuideScreen />);

    expect(StyleSheet.flatten(view.getByTestId('guide-header-title').props.style)).toMatchObject({
      fontSize: 32,
      lineHeight: 32
    });
    expect(StyleSheet.flatten(view.getByTestId('guide-copy').props.style)).toMatchObject({
      gap: 16,
      paddingTop: 38
    });
    expect(StyleSheet.flatten(view.getByTestId('guide-kicker').props.style).fontSize).toBe(18);
    expect(StyleSheet.flatten(view.getByTestId('guide-heading').props.style)).toMatchObject({
      fontSize: 27,
      lineHeight: 33.48
    });
    expect(StyleSheet.flatten(view.getByTestId('guide-panel').props.style)).toMatchObject({
      borderRadius: 28,
      paddingBottom: 20,
      paddingHorizontal: 22,
      paddingTop: 22
    });
    expect(StyleSheet.flatten(view.getByTestId('guide-panel-body').props.style)).toMatchObject({
      fontSize: 17,
      lineHeight: 25.16
    });
    expect(StyleSheet.flatten(view.getByTestId('guide-list-item-0').props.style).borderRadius).toBe(28);

    mockWindowWidth = 380;
    view.unmount();
    const compactView = renderWithProviders(<GuideScreen />);
    expect(StyleSheet.flatten(compactView.getByTestId('guide-header-title').props.style).fontSize).toBe(28);
    expect(StyleSheet.flatten(compactView.getByTestId('guide-copy').props.style)).toMatchObject({
      gap: 12,
      paddingTop: 30
    });
    expect(StyleSheet.flatten(compactView.getByTestId('guide-kicker').props.style).fontSize).toBe(16);
    expect(StyleSheet.flatten(compactView.getByTestId('guide-heading').props.style).fontSize).toBe(23);
    expect(StyleSheet.flatten(compactView.getByTestId('guide-panel').props.style)).toMatchObject({
      borderRadius: 24,
      paddingBottom: 16,
      paddingHorizontal: 18,
      paddingTop: 18
    });
    expect(StyleSheet.flatten(compactView.getByTestId('guide-panel-body').props.style)).toMatchObject({
      fontSize: 15,
      lineHeight: 21.3
    });
    expect(StyleSheet.flatten(compactView.getByTestId('guide-list-item-0').props.style).borderRadius).toBe(22);
  });
});
