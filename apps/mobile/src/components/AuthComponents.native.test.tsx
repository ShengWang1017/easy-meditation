import React from 'react';
import { jest } from '@jest/globals';
import { Image, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { referenceImages } from '../theme/assets';
import { fontFamilies } from '../theme/fonts';
import { colors } from '../theme/tokens';
import { renderWithProviders } from '../test/renderWithProviders';
import { AuthScaffold } from './AuthScaffold';
import { AuthTextField } from './AuthTextField';
import { PrototypeButton } from './PrototypeButton';
import { PrototypeScreen } from './PrototypeScreen';

describe('AuthScaffold', () => {
  it('uses the auth prototype screen and the source dandelion artwork', () => {
    const view = renderWithProviders(
      <AuthScaffold
        eyebrow="Easy Meditation"
        subtitle="继续你的今日练习，呼吸会带你回到安静里。"
        title="欢迎回来"
      >
        <PrototypeButton label="登录" />
      </AuthScaffold>
    );

    expect(view.UNSAFE_getByType(PrototypeScreen).props).toMatchObject({
      backgroundVariant: 'auth',
      keyboardAvoiding: true,
      scrollable: true
    });
    expect(view.UNSAFE_getByType(Image).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      resizeMode: 'contain',
      source: referenceImages.dandelion
    });
    expect(view.getByRole('header', { name: '欢迎回来' })).toBeTruthy();
    expect(view.getByText('Easy Meditation')).toBeTruthy();
    expect(view.getByText('继续你的今日练习，呼吸会带你回到安静里。')).toBeTruthy();
  });

  it('keeps a loading primary action named, busy, disabled, and inert', () => {
    const onPress = jest.fn();
    const view = renderWithProviders(
      <AuthScaffold eyebrow="开始" subtitle="说明" title="创建账号">
        <PrototypeButton label="提交中..." loading onPress={onPress} />
      </AuthScaffold>
    );
    const button = view.getByRole('button', {
      name: '提交中...',
      busy: true,
      disabled: true
    });

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('AuthTextField', () => {
  it('associates its label and inline error with the input', () => {
    const view = render(
      <AuthTextField
        error="请输入有效的邮箱地址。"
        label="邮箱"
        name="email"
        onChangeText={() => undefined}
        value="bad"
      />
    );
    const label = view.getByText('邮箱');
    const input = view.getByLabelText('邮箱');
    const error = view.getByRole('alert');

    expect(label.props.nativeID).toBe('auth-email-label');
    expect(input.props.accessibilityLabelledBy).toBe('auth-email-label');
    expect(input.props.accessibilityHint).toBe('请输入有效的邮箱地址。');
    expect(error.props.nativeID).toBe('auth-email-error');
    expect(error.props.accessibilityLiveRegion).toBe('polite');
    expect(view.getByText('请输入有效的邮箱地址。')).toBeTruthy();
  });

  it('uses system text, a 56-point minimum that can grow, and forwards keyboard-order props', () => {
    const onSubmitEditing = jest.fn();
    const view = render(
      <AuthTextField
        label="密码"
        name="password"
        onChangeText={() => undefined}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="done"
        secureTextEntry
        submitBehavior="blurAndSubmit"
        testID="password-input"
        value="secret"
      />
    );
    const input = view.getByTestId('password-input');

    expect(StyleSheet.flatten(input.props.style)).toMatchObject({
      backgroundColor: colors.surface,
      color: colors.ink,
      fontFamily: fontFamilies.system,
      minHeight: 56,
      paddingVertical: 14
    });
    expect(StyleSheet.flatten(input.props.style).height).toBeUndefined();
    expect(input.props.allowFontScaling).toBe(true);
    expect(input.props.maxFontSizeMultiplier).toBeUndefined();
    expect(input.props.returnKeyType).toBe('done');
    expect(input.props.submitBehavior).toBe('blurAndSubmit');
    expect(input.props.secureTextEntry).toBe(true);

    fireEvent(input, 'submitEditing');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });
});
