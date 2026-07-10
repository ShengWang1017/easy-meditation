import { ApiRequestError } from '../api/client';

export type AuthFieldName = 'email' | 'password' | 'nickname';

export type AuthFormErrors = {
  form?: string;
  fields: Partial<Record<AuthFieldName, string>>;
};

const GENERIC_REQUEST_ERROR_MESSAGE = '请求失败，请稍后再试。';
const AUTH_FIELD_NAMES = ['email', 'password', 'nickname'] as const;

function safeMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return GENERIC_REQUEST_ERROR_MESSAGE;
}

export function getAuthFormErrors(error: unknown): AuthFormErrors {
  if (error instanceof ApiRequestError && error.fields) {
    const fields: AuthFormErrors['fields'] = {};

    for (const field of AUTH_FIELD_NAMES) {
      const message = error.fields[field]?.trim();
      if (message) {
        fields[field] = message;
      }
    }

    if (Object.keys(fields).length > 0) {
      return { fields };
    }
  }

  return {
    form: safeMessage(error),
    fields: {}
  };
}
