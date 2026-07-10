import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({
  default: { expoConfig: null, manifest2: null }
}));

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn()
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' }
}));

vi.mock('../query/client', () => ({
  activeUserScopeCoordinator: {
    retire: vi.fn(async () => undefined)
  }
}));

import { ApiRequestError } from '../api/client';
import { getAuthFormErrors } from './authFormErrors';

describe('getAuthFormErrors', () => {
  it('maps only supported ApiRequestError fields to inline field errors', () => {
    const error = new ApiRequestError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid.',
      fields: {
        email: '请输入有效的邮箱地址。',
        password: '密码至少需要 8 位。',
        nickname: '昵称不能超过 40 个字符。',
        ignored: 'Do not expose an unknown field.'
      }
    });

    expect(getAuthFormErrors(error)).toEqual({
      fields: {
        email: '请输入有效的邮箱地址。',
        password: '密码至少需要 8 位。',
        nickname: '昵称不能超过 40 个字符。'
      }
    });
  });

  it('uses the request message as a form error when no supported field error exists', () => {
    const error = new ApiRequestError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码不正确。'
    });

    expect(getAuthFormErrors(error)).toEqual({
      form: '邮箱或密码不正确。',
      fields: {}
    });
  });

  it('uses a safe ordinary Error message as a form error', () => {
    expect(getAuthFormErrors(new Error('网络暂时不可用。'))).toEqual({
      form: '网络暂时不可用。',
      fields: {}
    });
  });

  it('falls back to the existing generic request copy for unknown or empty errors', () => {
    expect(getAuthFormErrors({ message: 'not an Error' })).toEqual({
      form: '请求失败，请稍后再试。',
      fields: {}
    });
    expect(getAuthFormErrors(new Error('   '))).toEqual({
      form: '请求失败，请稍后再试。',
      fields: {}
    });
  });
});
