import { describe, expect, test } from 'vitest';
import {
  apiErrorSchema,
  authRefreshSchema,
  authLogoutSchema,
  customRhythmCreateSchema,
  customRhythmReadSchema,
  customRhythmsListSchema,
  customRhythmUpdateSchema,
  errorEnvelopeSchema,
  userSettingsReadSchema,
  userSettingsUpdateSchema
} from './schemas.js';

describe('shared API schemas', () => {
  test('accepts custom rhythm create payloads used by mobile forms', () => {
    const payload = customRhythmCreateSchema.parse({
      name: 'Evening wind-down',
      inhaleSeconds: 4,
      holdSeconds: 4,
      exhaleSeconds: 6,
      defaultDurationSeconds: 300
    });

    expect(payload).toMatchObject({
      name: 'Evening wind-down',
      inhaleSeconds: 4,
      holdSeconds: 4,
      exhaleSeconds: 6,
      defaultDurationSeconds: 300
    });
  });

  test('requires at least one field when patching a custom rhythm', () => {
    expect(() => customRhythmUpdateSchema.parse({})).toThrow(/at least one/i);

    const payload = customRhythmUpdateSchema.parse({
      exhaleSeconds: 8
    });

    expect(payload).toEqual({ exhaleSeconds: 8 });
  });

  test('anchors read and list contracts for custom rhythms', () => {
    const rhythm = customRhythmReadSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Box reset',
      inhaleSeconds: 4,
      holdSeconds: 4,
      exhaleSeconds: 4,
      defaultDurationSeconds: 180,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z'
    });

    const list = customRhythmsListSchema.parse([rhythm]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(rhythm.id);
  });

  test('supports reading and patching user settings', () => {
    const settings = userSettingsReadSchema.parse({
      defaultMethodType: 'custom',
      defaultMethodId: null,
      defaultCustomRhythmId: '550e8400-e29b-41d4-a716-446655440001',
      defaultDurationSeconds: 600,
      soundEnabled: true,
      hapticsEnabled: false,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z'
    });

    const patch = userSettingsUpdateSchema.parse({
      soundEnabled: false,
      defaultDurationSeconds: 300
    });

    expect(settings.defaultMethodType).toBe('custom');
    expect(patch).toEqual({
      soundEnabled: false,
      defaultDurationSeconds: 300
    });
  });

  test('exposes a shared error envelope alongside the success envelope', () => {
    const error = apiErrorSchema.parse({
      code: 'VALIDATION_ERROR',
      message: 'Some fields are invalid.',
      fields: {
        email: 'Enter a valid email address.'
      }
    });

    const envelope = errorEnvelopeSchema.parse({
      data: null,
      error
    });

    expect(envelope).toEqual({
      data: null,
      error
    });
  });

  test('shares refresh and logout token body schemas with the API', () => {
    const refreshBody = authRefreshSchema.parse({
      refreshToken: 'refresh-token-value'
    });
    const logoutBody = authLogoutSchema.parse({
      refreshToken: 'refresh-token-value'
    });

    expect(refreshBody).toEqual({ refreshToken: 'refresh-token-value' });
    expect(logoutBody).toEqual({ refreshToken: 'refresh-token-value' });
  });
});
