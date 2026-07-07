import { BREATHING_METHODS_SEED, breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { describe, expect, test } from 'vitest';
import { buildApp } from '../app.js';

describe('api app', () => {
  test('returns health status', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ok: true }, error: null });
  });

  test('returns seeded breathing methods', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/breathing-methods' });
    await app.close();

    expect(response.statusCode).toBe(200);

    const body = dataEnvelope(breathingMethodSchema.array()).parse(response.json());
    expect(body).toEqual({
      data: BREATHING_METHODS_SEED,
      error: null
    });
  });
});

describe('auth flow', () => {
  test('registers, reads current user, refreshes, and logs out', async () => {
    const app = await buildApp();

    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `test-${Date.now()}@example.com`,
        password: 'quiet-breathing-123',
        nickname: 'Tester'
      }
    });
    expect(register.statusCode).toBe(201);

    const tokens = register.json().data.tokens;
    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.email).toContain('@example.com');

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken }
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().data.accessToken).toEqual(expect.any(String));

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: tokens.refreshToken }
    });
    expect(logout.statusCode).toBe(200);

    await app.close();
  });

  test('rejects invalid login with a generic error', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'missing@example.com', password: 'bad-password' }
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
  });
});
