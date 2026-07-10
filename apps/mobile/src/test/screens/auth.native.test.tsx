import React from 'react';
import { jest } from '@jest/globals';
import { Alert, TextInput, type TextProps } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

type LoginInput = { email: string; password: string };
type RegisterInput = { email: string; password: string; nickname?: string };

const mockLogin = jest.fn<(input: LoginInput) => Promise<void>>();
const mockRegister = jest.fn<(input: RegisterInput) => Promise<void>>();
const mockReplace = jest.fn<(href: string) => void>();
const mockLinkNavigate = jest.fn<(href: string) => void>();

jest.mock('../../store/authStore', () => ({
  useAuthStore: (
    selector: (state: {
      login: typeof mockLogin;
      register: typeof mockRegister;
    }) => unknown
  ) => selector({ login: mockLogin, register: mockRegister })
}));

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Link: ({
      asChild,
      children,
      href,
      style
    }: {
      asChild?: boolean;
      children: React.ReactElement<{
        accessibilityHint?: string;
        disabled?: boolean;
        onPress?: () => void;
      }> | React.ReactNode;
      href: string;
      style?: TextProps['style'];
    }) => {
      if (asChild && React.isValidElement(children)) {
        const child = children as React.ReactElement<{
          accessibilityHint?: string;
          disabled?: boolean;
          onPress?: () => void;
        }>;
        return React.cloneElement(child, {
          accessibilityHint: href,
          onPress: child.props.disabled
            ? undefined
            : () => mockLinkNavigate(href)
        });
      }

      return React.createElement(
        Text,
        {
          accessibilityHint: href,
          accessibilityRole: 'link',
          onPress: () => mockLinkNavigate(href),
          style
        },
        children
      );
    },
    router: {
      replace: (href: string) => mockReplace(href)
    }
  };
});

import { ApiRequestError } from '../../api/client';
import { renderWithProviders } from '../renderWithProviders';
import LoginScreen from '../../../app/(auth)/login';
import RegisterScreen from '../../../app/(auth)/register';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockReplace.mockReset();
    mockLinkNavigate.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves the current copy, auth link, login payload, and success route', async () => {
    mockLogin.mockResolvedValue(undefined);
    const view = renderWithProviders(<LoginScreen />);

    expect(view.getByText('Easy Meditation')).toBeTruthy();
    expect(view.getByRole('header', { name: '欢迎回来' })).toBeTruthy();
    expect(view.getByText('继续你的今日练习，呼吸会带你回到安静里。')).toBeTruthy();
    expect(view.getByRole('link', { name: '创建新账号' }).props.accessibilityHint).toBe(
      '/(auth)/register'
    );
    for (const id of [
      'auth-screen',
      'auth-form',
      'auth-actions',
      'auth-eyebrow',
      'auth-title',
      'auth-subtitle'
    ]) {
      expect(view.UNSAFE_getByProps({ nativeID: id })).toBeTruthy();
    }
    fireEvent.press(view.getByRole('link', { name: '创建新账号' }));
    expect(mockLinkNavigate).toHaveBeenCalledWith('/(auth)/register');

    fireEvent.changeText(view.getByLabelText('邮箱'), 'person@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '登录' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'person@example.com',
        password: 'password123'
      });
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/practice');
    });
  });

  it('allows only one submit while pending and exposes the exact loading state', async () => {
    const pending = deferred<void>();
    mockLogin.mockReturnValue(pending.promise);
    const view = renderWithProviders(<LoginScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'person@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '登录' }));

    const loadingButton = view.getByRole('button', {
      name: '登录中...',
      busy: true,
      disabled: true
    });
    const disabledLink = view.getByRole('link', {
      name: '创建新账号',
      disabled: true
    });
    fireEvent.press(loadingButton);
    fireEvent.press(disabledLink);
    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLinkNavigate).not.toHaveBeenCalled();
    expect(disabledLink.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })])
    );

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/practice'));
  });

  it('renders field errors inline, retains email, clears password, and never opens Alert', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockLogin.mockRejectedValue(
      new ApiRequestError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        fields: { email: '请输入有效的邮箱地址。' }
      })
    );
    const view = renderWithProviders(<LoginScreen />);
    const email = view.getByLabelText('邮箱');
    const password = view.getByLabelText('密码');

    fireEvent.changeText(email, 'bad-email');
    fireEvent.changeText(password, 'secret');
    fireEvent.press(view.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(view.getByText('请输入有效的邮箱地址。')).toBeTruthy());
    expect(view.getByLabelText('邮箱').props.value).toBe('bad-email');
    expect(view.getByLabelText('密码').props.value).toBe('');
    expect(view.getByLabelText('邮箱').props.accessibilityHint).toBe(
      '请输入有效的邮箱地址。'
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('submits from the password return key in email-to-password order', async () => {
    mockLogin.mockResolvedValue(undefined);
    const view = renderWithProviders(<LoginScreen />);
    const [email, password] = view.UNSAFE_getAllByType(TextInput);

    expect(email?.props).toMatchObject({ returnKeyType: 'next', submitBehavior: 'submit' });
    expect(password?.props).toMatchObject({
      returnKeyType: 'done',
      submitBehavior: 'blurAndSubmit'
    });

    fireEvent.changeText(view.getByLabelText('邮箱'), 'person@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent(password!, 'submitEditing');

    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });

  it('ignores a deferred login result after the screen unmounts', async () => {
    const pending = deferred<void>();
    mockLogin.mockReturnValue(pending.promise);
    const view = renderWithProviders(<LoginScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'person@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '登录' }));
    view.unmount();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('RegisterScreen', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockReplace.mockReset();
    mockLinkNavigate.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trims the optional nickname while preserving payload, copy, link, and success route', async () => {
    mockRegister.mockResolvedValue(undefined);
    const view = renderWithProviders(<RegisterScreen />);

    expect(view.getByText('开始新的呼吸节奏')).toBeTruthy();
    expect(view.getByRole('header', { name: '创建账号' })).toBeTruthy();
    expect(view.getByText('账号建好后，练习记录和设置就能跟着你一起走。')).toBeTruthy();
    expect(view.getByRole('link', { name: '已有账号，去登录' }).props.accessibilityHint).toBe(
      '/(auth)/login'
    );
    for (const id of [
      'auth-screen',
      'auth-form',
      'auth-actions',
      'auth-eyebrow',
      'auth-title',
      'auth-subtitle'
    ]) {
      expect(view.UNSAFE_getByProps({ nativeID: id })).toBeTruthy();
    }
    fireEvent.press(view.getByRole('link', { name: '已有账号，去登录' }));
    expect(mockLinkNavigate).toHaveBeenCalledWith('/(auth)/login');

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('昵称，可不填'), '  小安  ');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '注册并开始' }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'new@example.com',
        nickname: '小安',
        password: 'password123'
      });
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/practice');
    });
  });

  it('omits an all-whitespace optional nickname', async () => {
    mockRegister.mockResolvedValue(undefined);
    const view = renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('昵称，可不填'), '   ');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '注册并开始' }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        email: 'new@example.com',
        nickname: undefined,
        password: 'password123'
      });
    });
  });

  it('allows only one submit while pending and exposes the exact loading state', async () => {
    const pending = deferred<void>();
    mockRegister.mockReturnValue(pending.promise);
    const view = renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '注册并开始' }));

    const loadingButton = view.getByRole('button', {
      name: '提交中...',
      busy: true,
      disabled: true
    });
    const disabledLink = view.getByRole('link', {
      name: '已有账号，去登录',
      disabled: true
    });
    fireEvent.press(loadingButton);
    fireEvent.press(disabledLink);
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockLinkNavigate).not.toHaveBeenCalled();
    expect(disabledLink.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })])
    );

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/practice'));
  });

  it('shows a form error above the action, retains email and nickname, clears password, and never alerts', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRegister.mockRejectedValue(new Error('注册失败，请再试一次。'));
    const view = renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('昵称，可不填'), '小安');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '注册并开始' }));

    await waitFor(() => expect(view.getByTestId('register-form-error')).toHaveTextContent(
      '请求失败，请稍后再试。'
    ));
    expect(view.getByLabelText('邮箱').props.value).toBe('new@example.com');
    expect(view.getByLabelText('昵称，可不填').props.value).toBe('小安');
    expect(view.getByLabelText('密码').props.value).toBe('');
    expect(alert).not.toHaveBeenCalled();
  });

  it('uses email-to-nickname-to-password keyboard order and submits from password', async () => {
    mockRegister.mockResolvedValue(undefined);
    const view = renderWithProviders(<RegisterScreen />);
    const [email, nickname, password] = view.UNSAFE_getAllByType(TextInput);

    expect(email?.props).toMatchObject({ returnKeyType: 'next', submitBehavior: 'submit' });
    expect(nickname?.props).toMatchObject({ returnKeyType: 'next', submitBehavior: 'submit' });
    expect(password?.props).toMatchObject({
      returnKeyType: 'done',
      submitBehavior: 'blurAndSubmit'
    });

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent(password!, 'submitEditing');

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
  });

  it('ignores a deferred registration result after the screen unmounts', async () => {
    const pending = deferred<void>();
    mockRegister.mockReturnValue(pending.promise);
    const view = renderWithProviders(<RegisterScreen />);

    fireEvent.changeText(view.getByLabelText('邮箱'), 'new@example.com');
    fireEvent.changeText(view.getByLabelText('密码'), 'password123');
    fireEvent.press(view.getByRole('button', { name: '注册并开始' }));
    view.unmount();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
