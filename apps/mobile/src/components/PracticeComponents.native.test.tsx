import React from 'react';
import { jest } from '@jest/globals';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BREATHING_METHODS_SEED } from '@easy-meditation/shared';

import { buildMethodPresentationSlots } from '../domain/methodPresentation';
import { colors, layout } from '../theme/tokens';
import { BeforeStartCard } from './BeforeStartCard';
import { BottomPillNav } from './BottomPillNav';
import { DurationPopover } from './DurationPopover';
import { ModeCard, type ModeCardViewModel } from './ModeCard';

let mockWindowWidth = 390;

jest.mock(
  '@easy-meditation/shared',
  () => ({
    BREATHING_METHODS_SEED: [
      {
        id: 'box',
        slug: 'box',
        title: '盒式呼吸',
        subtitle: '吸气 · 屏息 · 呼气 · 屏息',
        category: 'classic',
        defaultDurationSeconds: 180,
        phases: [
          { kind: 'inhale', label: '吸气', durationSeconds: 4 },
          { kind: 'hold', label: '屏息', durationSeconds: 4 },
          { kind: 'exhale', label: '呼气', durationSeconds: 4 },
          { kind: 'hold', label: '屏息', durationSeconds: 4 }
        ],
        sortOrder: 10,
        isActive: true
      },
      {
        id: 'four-seven-eight',
        slug: 'four-seven-eight',
        title: '4-7-8 呼吸',
        subtitle: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
        category: 'classic',
        defaultDurationSeconds: 180,
        phases: [
          { kind: 'inhale', label: '吸气', durationSeconds: 4 },
          { kind: 'hold', label: '屏息', durationSeconds: 7 },
          { kind: 'exhale', label: '呼气', durationSeconds: 8 }
        ],
        sortOrder: 20,
        isActive: true
      },
      {
        id: 'coherent',
        slug: 'coherent',
        title: '共振呼吸',
        subtitle: '吸气 5 秒 · 呼气 5 秒',
        category: 'classic',
        defaultDurationSeconds: 300,
        phases: [
          { kind: 'inhale', label: '吸气', durationSeconds: 5 },
          { kind: 'exhale', label: '呼气', durationSeconds: 5 }
        ],
        sortOrder: 30,
        isActive: true
      }
    ]
  }),
  { virtual: true }
);

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 844,
    scale: 3,
    fontScale: 1
  })
}));

const presentations = buildMethodPresentationSlots(BREATHING_METHODS_SEED);

function viewModel(
  id: ModeCardViewModel['id'],
  overrides: Partial<ModeCardViewModel> = {}
): ModeCardViewModel {
  const presentation = presentations.find((candidate) => candidate.id === id);
  if (!presentation) {
    throw new Error(`Missing test presentation for ${id}`);
  }

  const backgroundColors = {
    box: colors.lilac,
    'four-seven-eight': colors.periwinkle,
    coherent: colors.blue,
    custom: colors.mintBlue
  } as const;

  return {
    ...presentation,
    backgroundColor: backgroundColors[id],
    durationMinutes:
      id === 'custom'
        ? 5
        : Math.round((presentation.method?.defaultDurationSeconds ?? 60) / 60),
    durationPopoverOpen: false,
    ...overrides
  };
}

function renderModeCard(model: ModeCardViewModel) {
  const callbacks = {
    onPress: jest.fn(),
    onOpenDuration: jest.fn(),
    onOpenCustomEditor: jest.fn(),
    onDurationChange: jest.fn(async () => undefined),
    onRequestCloseDuration: jest.fn()
  };
  const view = render(<ModeCard viewModel={model} {...callbacks} />);

  return { ...view, ...callbacks };
}

describe('DurationPopover', () => {
  it('uses a 44-point minimum target for the duration input container', () => {
    const view = render(
      <DurationPopover
        methodTitle="盒式呼吸法"
        onChange={jest.fn(async () => undefined)}
        onRequestClose={jest.fn()}
        value={3}
      />
    );
    const input = view.getByLabelText('输入盒式呼吸法训练分钟数');
    let inputWrap = input.parent;
    while (
      inputWrap &&
      StyleSheet.flatten(inputWrap.props.style).minHeight === undefined
    ) {
      inputWrap = inputWrap.parent;
    }

    expect(inputWrap).not.toBeNull();
    expect(StyleSheet.flatten(inputWrap!.props.style).minHeight).toBe(
      layout.touchTarget
    );
  });

  it.each([
    ['0', 1],
    ['61', 60],
    ['17.6', 18]
  ])('normalizes %s minutes to %i before persisting', async (input, expected) => {
    const onChange = jest.fn(async () => undefined);
    const onRequestClose = jest.fn();
    const view = render(
      <DurationPopover
        methodTitle="盒式呼吸法"
        onChange={onChange}
        onRequestClose={onRequestClose}
        value={3}
      />
    );

    fireEvent.changeText(view.getByLabelText('输入盒式呼吸法训练分钟数'), input);
    const confirm = view.getByRole('button', { name: '确认盒式呼吸法训练时长' });
    expect(StyleSheet.flatten(confirm.props.style).minHeight).toBe(layout.touchTarget);
    fireEvent.press(confirm);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expected));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('closes on an outside press without writing a value', () => {
    const onChange = jest.fn(async () => undefined);
    const onRequestClose = jest.fn();
    const view = render(
      <DurationPopover
        methodTitle="长呼气"
        onChange={onChange}
        onRequestClose={onRequestClose}
        value={3}
      />
    );

    fireEvent.press(view.getByRole('button', { name: '关闭长呼气时长设置' }));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stays open with retry feedback when persistence rejects', async () => {
    const onChange = jest
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const onRequestClose = jest.fn();
    const view = render(
      <DurationPopover
        methodTitle="盒式呼吸法"
        onChange={onChange}
        onRequestClose={onRequestClose}
        value={3}
      />
    );

    fireEvent.changeText(view.getByLabelText('输入盒式呼吸法训练分钟数'), '8');
    fireEvent.press(view.getByRole('button', { name: '确认盒式呼吸法训练时长' }));

    await waitFor(() => expect(view.getByText('保存失败，请重试。')).toBeTruthy());
    expect(view.getByLabelText('输入盒式呼吸法训练分钟数')).toBeTruthy();
    expect(onRequestClose).not.toHaveBeenCalled();

    fireEvent.press(
      view.getByRole('button', { name: '重试保存盒式呼吸法训练时长' })
    );
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});

describe('ModeCard', () => {
  it('does not bubble a built-in duration press into session navigation', () => {
    const view = renderModeCard(viewModel('box'));

    fireEvent.press(view.getByRole('button', { name: '更改盒式呼吸法训练时长' }));

    expect(view.onOpenDuration).toHaveBeenCalledTimes(1);
    expect(view.onPress).not.toHaveBeenCalled();
    expect(view.onOpenCustomEditor).not.toHaveBeenCalled();
  });

  it('routes the custom card, duration, and gear through the editor without bubbling', () => {
    const entryPoints = [
      '编辑自定义呼吸方式',
      '编辑自定义训练时长',
      '设置自定义呼吸方式'
    ];

    for (const entryPoint of entryPoints) {
      const view = renderModeCard(viewModel('custom'));
      fireEvent.press(view.getByRole('button', { name: entryPoint }));

      expect(view.onOpenCustomEditor).toHaveBeenCalledTimes(1);
      expect(view.onPress).not.toHaveBeenCalled();
      expect(view.onOpenDuration).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it('keeps an unavailable fixed slot visible, disabled, and inert', () => {
    const model = viewModel('box', {
      availability: 'unavailable',
      method: null
    });
    const view = renderModeCard(model);
    const card = view.getByTestId('mode-card-box');

    expect(card.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(card);
    fireEvent.press(
      view.getByRole('button', {
        name: '盒式呼吸法训练时长暂不可用',
        disabled: true
      })
    );

    expect(view.onPress).not.toHaveBeenCalled();
    expect(view.onOpenDuration).not.toHaveBeenCalled();
    expect(view.onOpenCustomEditor).not.toHaveBeenCalled();
  });

  it('matches the wide and compact card geometry', () => {
    mockWindowWidth = 390;
    const wide = renderModeCard(viewModel('box'));

    expect(StyleSheet.flatten(wide.getByTestId('mode-card-shell-box').props.style)).toMatchObject({
      minHeight: layout.methodCardHeight,
      borderRadius: layout.methodCardRadius,
      paddingTop: layout.methodCardPadding.top,
      paddingRight: layout.methodCardPadding.right,
      paddingBottom: layout.methodCardPadding.bottom,
      paddingLeft: layout.methodCardPadding.left
    });
    expect(StyleSheet.flatten(wide.getByTestId('mode-card-art-box').props.style)).toMatchObject({
      top: 48,
      right: -12,
      width: 98,
      height: 98,
      opacity: 0.42,
      transform: [{ rotate: '8deg' }]
    });
    wide.unmount();

    mockWindowWidth = 380;
    const compact = renderModeCard(viewModel('box'));
    expect(StyleSheet.flatten(compact.getByTestId('mode-card-shell-box').props.style)).toMatchObject({
      minHeight: layout.compactMethodCardHeight,
      borderRadius: layout.compactMethodCardRadius,
      paddingTop: layout.compactMethodCardPadding.top,
      paddingRight: layout.compactMethodCardPadding.right,
      paddingBottom: layout.compactMethodCardPadding.bottom,
      paddingLeft: layout.compactMethodCardPadding.left
    });
    expect(StyleSheet.flatten(compact.getByTestId('mode-card-art-box').props.style)).toMatchObject({
      top: 44,
      width: 86,
      height: 86
    });
  });

  it.each([
    ['four-seven-eight', { top: 42, right: -22, width: 112, height: 112, opacity: 0.36, rotate: '-16deg' }],
    ['coherent', { top: 58, right: -18, width: 116, height: 112, opacity: 0.34, rotate: '18deg' }],
    ['custom', { top: 50, right: -12, width: 104, height: 104, opacity: 0.28, rotate: '-28deg' }]
  ] as const)('ports the %s flower geometry exactly', (id, expected) => {
    mockWindowWidth = 390;
    const view = renderModeCard(viewModel(id));

    expect(StyleSheet.flatten(view.getByTestId(`mode-card-art-${id}`).props.style)).toMatchObject({
      top: expected.top,
      right: expected.right,
      width: expected.width,
      height: expected.height,
      opacity: expected.opacity,
      transform: [{ rotate: expected.rotate }]
    });
  });
});

describe('BeforeStartCard', () => {
  it('keeps dismiss separate from opening the guide', async () => {
    const onDismiss = jest.fn(async () => undefined);
    const onOpenGuide = jest.fn();
    const view = render(
      <BeforeStartCard onDismiss={onDismiss} onOpenGuide={onOpenGuide} />
    );

    fireEvent.press(view.getByRole('button', { name: '关闭开始前提示' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(onOpenGuide).not.toHaveBeenCalled();

    fireEvent.press(view.getByRole('button', { name: '了解呼吸训练和冥想' }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);
  });

  it('keeps the card visible with a retry when dismissal persistence rejects', async () => {
    const onDismiss = jest
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'));
    const view = render(
      <BeforeStartCard onDismiss={onDismiss} onOpenGuide={jest.fn()} />
    );

    fireEvent.press(view.getByRole('button', { name: '关闭开始前提示' }));

    await waitFor(() => expect(view.getByText('关闭失败，请重试。')).toBeTruthy());
    expect(view.getByTestId('before-start-card-shell')).toBeTruthy();

    fireEvent.press(view.getByRole('button', { name: '重试关闭开始前提示' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(2));
    expect(view.queryByText('关闭失败，请重试。')).toBeNull();
  });
});

describe('BottomPillNav', () => {
  function tabBarProps(index = 0) {
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const navigate = jest.fn();
    const props = {
      state: {
        index,
        key: 'tabs',
        routeNames: ['practice', 'records'],
        history: [],
        stale: false,
        type: 'tab',
        routes: [
          { key: 'practice-key', name: 'practice' },
          { key: 'records-key', name: 'records' }
        ]
      },
      descriptors: {},
      navigation: { emit, navigate },
      insets: { top: 0, right: 0, bottom: 0, left: 0 }
    } as unknown as BottomTabBarProps;

    return { props, emit, navigate };
  }

  it('renders exactly two labels with one route-owned active pill and measured geometry', () => {
    const { props } = tabBarProps(1);
    const view = render(<BottomPillNav {...props} />);
    const tabs = view.getAllByRole('tab');

    expect(view.getAllByText(/^(冥想|记录)$/).map((node) => node.props.children)).toEqual([
      '冥想',
      '记录'
    ]);
    expect(tabs.map((tab) => tab.props.accessibilityState?.selected)).toEqual([
      false,
      true
    ]);
    expect(StyleSheet.flatten(view.getByTestId('bottom-pill-nav').props.style)).toMatchObject({
      width: layout.navWidth,
      height: layout.navHeight,
      borderRadius: layout.navRadius
    });
    expect(StyleSheet.flatten(view.getByTestId('bottom-pill-records').props.style)).toMatchObject({
      backgroundColor: colors.activeNav
    });
    expect(StyleSheet.flatten(view.getByTestId('bottom-pill-underline').props.style)).toMatchObject({
      width: 108,
      height: 5,
      backgroundColor: colors.activeNav
    });
  });

  it('emits tabPress before navigating and leaves the active route alone', () => {
    const { props, emit, navigate } = tabBarProps(0);
    const view = render(<BottomPillNav {...props} />);

    fireEvent.press(view.getByRole('tab', { name: '记录' }));
    expect(emit).toHaveBeenLastCalledWith({
      type: 'tabPress',
      target: 'records-key',
      canPreventDefault: true
    });
    expect(navigate).toHaveBeenCalledWith('records', undefined);

    navigate.mockClear();
    fireEvent.press(view.getByRole('tab', { name: '冥想' }));
    expect(emit).toHaveBeenLastCalledWith({
      type: 'tabPress',
      target: 'practice-key',
      canPreventDefault: true
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});
