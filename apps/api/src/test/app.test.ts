import { BREATHING_METHODS_SEED, breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';

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

  test('rejects a refresh token after it has been rotated', async () => {
    const app = await buildApp();
    const email = `rotated-${Date.now()}@example.com`;
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'quiet-breathing-123',
        nickname: 'Rotator'
      }
    });

    expect(register.statusCode).toBe(201);
    const firstRefreshToken = register.json().data.tokens.refreshToken;

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: firstRefreshToken }
    });

    expect(refresh.statusCode).toBe(200);

    const reused = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: firstRefreshToken }
    });
    await app.close();

    expect(reused.statusCode).toBe(401);
    expect(reused.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('rejects a logged out refresh token', async () => {
    const app = await buildApp();
    const email = `logout-${Date.now()}@example.com`;
    const register = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'quiet-breathing-123',
        nickname: 'Logout'
      }
    });

    expect(register.statusCode).toBe(201);
    const refreshToken = register.json().data.tokens.refreshToken;

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken }
    });

    expect(logout.statusCode).toBe(200);

    const refreshAfterLogout = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken }
    });
    await app.close();

    expect(refreshAfterLogout.statusCode).toBe(401);
    expect(refreshAfterLogout.json().error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  test('returns the same field error when user creation loses a registration race', async () => {
    const app = await buildApp();
    const email = `racy-${Date.now()}@example.com`;
    const findUniqueSpy = vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(null as never);
    const createSpy = vi.spyOn(prisma.user, 'create').mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`email`)'), {
        code: 'P2002'
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'quiet-breathing-123',
        nickname: 'Race'
      }
    });

    createSpy.mockRestore();
    findUniqueSpy.mockRestore();
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      data: null,
      error: {
        code: 'EMAIL_ALREADY_REGISTERED',
        fields: {
          email: 'This email is already registered.'
        }
      }
    });
  });
});
