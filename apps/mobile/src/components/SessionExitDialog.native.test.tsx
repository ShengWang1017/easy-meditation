import React from 'react';
import { jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { layout } from '../theme/tokens';
import { SessionExitDialog } from './SessionExitDialog';

describe('SessionExitDialog', () => {
  it('renders the prototype confirmation actions with accessible targets', () => {
    const onContinue = jest.fn();
    const onEnd = jest.fn();
    const view = render(
      <SessionExitDialog
        error={null}
        isPersisting={false}
        onContinue={onContinue}
        onEnd={onEnd}
        onRetry={jest.fn()}
        visible
      />
    );

    expect(view.getByText('要结束这次练习吗？')).toBeTruthy();
    const continueButton = view.getByRole('button', { name: '继续练习' });
    const endButton = view.getByRole('button', { name: '结束并离开' });
    expect(StyleSheet.flatten(continueButton.props.style).minHeight).toBeGreaterThanOrEqual(
      layout.touchTarget
    );
    expect(StyleSheet.flatten(endButton.props.style).minHeight).toBeGreaterThanOrEqual(
      layout.touchTarget
    );

    fireEvent.press(continueButton);
    fireEvent.press(endButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('locks actions while persisting and exposes retry after local failure', () => {
    const onRetry = jest.fn();
    const view = render(
      <SessionExitDialog
        error="无法在本机保存本次练习，请重试。"
        isPersisting
        onContinue={jest.fn()}
        onEnd={jest.fn()}
        onRetry={onRetry}
        visible
      />
    );

    expect(view.getByText('无法在本机保存本次练习，请重试。')).toBeTruthy();
    expect(view.getByRole('button', { name: '继续练习' }).props.accessibilityState).toMatchObject({
      disabled: true
    });
    expect(
      view.getByRole('button', { name: '结束并离开' }).props.accessibilityState
    ).toMatchObject({ disabled: true, busy: true });

    view.rerender(
      <SessionExitDialog
        error="无法在本机保存本次练习，请重试。"
        isPersisting={false}
        onContinue={jest.fn()}
        onEnd={jest.fn()}
        onRetry={onRetry}
        visible
      />
    );
    fireEvent.press(view.getByRole('button', { name: '重试保存并离开' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
