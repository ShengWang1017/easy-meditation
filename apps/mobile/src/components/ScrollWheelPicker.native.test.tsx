import React from 'react';
import { jest } from '@jest/globals';
import { FlatList, StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ScrollWheelPicker } from './ScrollWheelPicker';

let mockWindowWidth = 390;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 844,
    scale: 3,
    fontScale: 1
  })
}));

describe('ScrollWheelPicker', () => {
  beforeEach(() => {
    mockWindowWidth = 390;
  });

  it('renders a fixed 56-point phase wheel with exact selected geometry', () => {
    const view = render(
      <ScrollWheelPicker
        accessibilityLabel="设置吸气秒数"
        onValueChange={jest.fn(async () => undefined)}
        testID="phase-wheel"
        unit="秒"
        value={2}
        values={[1, 2, 3, 4]}
        variant="phase"
      />
    );
    const wheel = view.getByRole('adjustable', { name: '设置吸气秒数' });
    const list = view.UNSAFE_getByType(FlatList);

    expect(wheel.props.accessibilityActions).toEqual([
      { name: 'increment', label: '增加' },
      { name: 'decrement', label: '减少' }
    ]);
    expect(wheel.props.accessibilityValue).toEqual({
      min: 1,
      max: 4,
      now: 2,
      text: '2秒'
    });
    expect(list.props).toMatchObject({
      decelerationRate: 'fast',
      initialScrollIndex: 1,
      nestedScrollEnabled: true,
      showsVerticalScrollIndicator: false,
      snapToAlignment: 'start',
      snapToInterval: 56
    });
    expect(list.props.getItemLayout(null, 3)).toEqual({
      index: 3,
      length: 56,
      offset: 168
    });
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({
      height: 168,
      width: 78
    });
    expect(
      StyleSheet.flatten(view.getByTestId('phase-wheel-option-3').props.style)
    ).toMatchObject({ fontSize: 36 });
    expect(
      StyleSheet.flatten(view.getByTestId('phase-wheel-option-2').props.style)
    ).toMatchObject({ fontSize: 43 });

    mockWindowWidth = 380;
    view.rerender(
      <ScrollWheelPicker
        accessibilityLabel="设置吸气秒数"
        onValueChange={jest.fn(async () => undefined)}
        testID="phase-wheel"
        value={2}
        values={[1, 2, 3, 4]}
        variant="phase"
      />
    );
    expect(
      StyleSheet.flatten(view.UNSAFE_getByType(FlatList).props.style)
    ).toMatchObject({ height: 168, width: 68 });
    expect(
      StyleSheet.flatten(view.getByTestId('phase-wheel-option-3').props.style)
    ).toMatchObject({ fontSize: 32 });
    expect(
      StyleSheet.flatten(view.getByTestId('phase-wheel-option-2').props.style)
    ).toMatchObject({ fontSize: 39 });
  });

  it('snaps momentum to the nearest supplied value', async () => {
    const onValueChange = jest.fn(async (_value: number) => undefined);
    const view = render(
      <ScrollWheelPicker
        accessibilityLabel="设置阶段"
        onValueChange={onValueChange}
        testID="snap-wheel"
        value={1}
        values={[1, 4, 7, 10]}
        variant="phase"
      />
    );

    fireEvent(view.getByTestId('snap-wheel-list'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 106 } }
    });

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(7));
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('commits a slow drag without momentum and deduplicates a later matching momentum event', async () => {
    const onValueChange = jest.fn(async (_value: number) => undefined);
    const view = render(
      <ScrollWheelPicker
        accessibilityLabel="设置阶段"
        onValueChange={onValueChange}
        testID="drag-wheel"
        value={1}
        values={[1, 4, 7, 10]}
        variant="phase"
      />
    );
    const list = view.getByTestId('drag-wheel-list');

    fireEvent(list, 'scrollBeginDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } }
    });
    fireEvent(list, 'scrollEndDrag', {
      nativeEvent: {
        contentOffset: { x: 0, y: 106 },
        velocity: { x: 0, y: 0 }
      }
    });
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(7));

    fireEvent(list, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 106 } }
    });

    await Promise.resolve();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('supports accessible increment and decrement without crossing boundaries', async () => {
    const onValueChange = jest.fn(async (_value: number) => undefined);
    const view = render(
      <ScrollWheelPicker
        accessibilityLabel="设置目标时间"
        onValueChange={onValueChange}
        testID="duration-wheel"
        unit="分钟"
        value={5}
        values={[2, 3, 5, 10]}
        variant="inline"
      />
    );
    const wheel = view.getByRole('adjustable', { name: '设置目标时间' });
    const list = view.UNSAFE_getByType(FlatList);

    expect(list.props.snapToInterval).toBe(34);
    expect(list.props.hitSlop).toEqual({
      top: 5,
      right: 0,
      bottom: 5,
      left: 0
    });
    expect(StyleSheet.flatten(list.props.style).height).toBe(34);
    expect(StyleSheet.flatten(wheel.props.style).height).toBe(44);
    fireEvent(wheel, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' }
    });
    fireEvent(wheel, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' }
    });
    await waitFor(() => expect(onValueChange).toHaveBeenCalledTimes(2));
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([10, 3]);

    onValueChange.mockClear();
    view.rerender(
      <ScrollWheelPicker
        accessibilityLabel="设置目标时间"
        onValueChange={onValueChange}
        testID="duration-wheel"
        unit="分钟"
        value={2}
        values={[2, 3, 5, 10]}
        variant="inline"
      />
    );
    fireEvent(
      view.getByRole('adjustable', { name: '设置目标时间' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'decrement' } }
    );
    expect(onValueChange).not.toHaveBeenCalled();

    view.rerender(
      <ScrollWheelPicker
        accessibilityLabel="设置目标时间"
        onValueChange={onValueChange}
        testID="duration-wheel"
        unit="分钟"
        value={10}
        values={[2, 3, 5, 10]}
        variant="inline"
      />
    );
    fireEvent(
      view.getByRole('adjustable', { name: '设置目标时间' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } }
    );
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('consumes a rejected async value handler without leaking the rejection', async () => {
    const onValueChange = jest.fn(async () => {
      throw new Error('preference write failed');
    });
    const view = render(
      <ScrollWheelPicker
        accessibilityLabel="设置阶段"
        onValueChange={onValueChange}
        testID="rejecting-wheel"
        value={1}
        values={[1, 2, 3]}
        variant="phase"
      />
    );

    fireEvent(view.getByTestId('rejecting-wheel-list'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 56 } }
    });

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(2));
    await Promise.resolve();
  });
});
