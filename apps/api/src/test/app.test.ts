import crypto from 'node:crypto';
import { BREATHING_METHODS_SEED, breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';

afterEach(() => {
  vi.restoreAllMocks();
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `session-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      password: 'quiet-breathing-123',
      nickname: 'Session Tester'
    }
  });

  expect(response.statusCode).toBe(201);
  return response.json().data.tokens.accessToken as string;
}

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

});

describe('practice sessions and stats', () => {
  test('creates one practice session idempotently and updates stats', async () => {
    const app = await buildApp();
    const accessToken = await registerTestUser(app);
    const clientSessionId = crypto.randomUUID();
    const payload = {
      clientSessionId,
      methodType: 'built_in',
      methodId: 'box',
      customRhythmId: null,
      methodTitleSnapshot: '鐩掑紡鍛煎惛',
      rhythmSnapshot: [
        { kind: 'inhale', label: '鍚告皵', durationSeconds: 4 },
        { kind: 'hold', label: '灞忔伅', durationSeconds: 4 },
        { kind: 'exhale', label: '鍛兼皵', durationSeconds: 4 },
        { kind: 'hold', label: '灞忔伅', durationSeconds: 4 }
      ],
      plannedDurationSeconds: 180,
      actualDurationSeconds: 120,
      completed: false,
      startedAt: new Date('2026-07-07T08:00:00.000Z').toISOString(),
      endedAt: new Date('2026-07-07T08:02:00.000Z').toISOString()
    };

    const created = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.actualDurationSeconds).toBe(120);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().data.id).toBe(created.json().data.id);

    const stats = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    expect(stats.statusCode).toBe(200);
    expect(stats.json().data.totalSessions).toBe(1);
    expect(stats.json().data.totalPracticeSeconds).toBe(120);

    await app.close();
  });

  test('scopes sessions and stats to the authenticated user', async () => {
    const app = await buildApp();
    const firstAccessToken = await registerTestUser(app);
    const secondAccessToken = await registerTestUser(app);

    const createForFirstUser = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${firstAccessToken}` },
      payload: {
        clientSessionId: crypto.randomUUID(),
        methodType: 'built_in',
        methodId: 'box',
        customRhythmId: null,
        methodTitleSnapshot: 'Box breathing',
        rhythmSnapshot: [
          { kind: 'inhale', label: 'Inhale', durationSeconds: 4 },
          { kind: 'hold', label: 'Hold', durationSeconds: 4 },
          { kind: 'exhale', label: 'Exhale', durationSeconds: 4 },
          { kind: 'hold', label: 'Hold', durationSeconds: 4 }
        ],
        plannedDurationSeconds: 180,
        actualDurationSeconds: 180,
        completed: true,
        startedAt: new Date('2026-07-07T09:00:00.000Z').toISOString(),
        endedAt: new Date('2026-07-07T09:03:00.000Z').toISOString()
      }
    });
    expect(createForFirstUser.statusCode).toBe(201);

    const secondUserSessions = await app.inject({
      method: 'GET',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${secondAccessToken}` }
    });
    expect(secondUserSessions.statusCode).toBe(200);
    expect(secondUserSessions.json().data).toEqual([]);

    const secondUserStats = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${secondAccessToken}` }
    });
    expect(secondUserStats.statusCode).toBe(200);
    expect(secondUserStats.json().data.totalSessions).toBe(0);
    expect(secondUserStats.json().data.totalPracticeSeconds).toBe(0);

    await app.close();
  });

  test('does not expose another user session through idempotency', async () => {
    const app = await buildApp();
    const firstAccessToken = await registerTestUser(app);
    const secondAccessToken = await registerTestUser(app);
    const clientSessionId = crypto.randomUUID();
    const payload = {
      clientSessionId,
      methodType: 'built_in',
      methodId: 'box',
      customRhythmId: null,
      methodTitleSnapshot: 'Box breathing',
      rhythmSnapshot: [
        { kind: 'inhale', label: 'Inhale', durationSeconds: 4 },
        { kind: 'hold', label: 'Hold', durationSeconds: 4 },
        { kind: 'exhale', label: 'Exhale', durationSeconds: 4 },
        { kind: 'hold', label: 'Hold', durationSeconds: 4 }
      ],
      plannedDurationSeconds: 180,
      actualDurationSeconds: 180,
      completed: true,
      startedAt: new Date('2026-07-07T10:00:00.000Z').toISOString(),
      endedAt: new Date('2026-07-07T10:03:00.000Z').toISOString()
    };

    const created = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${firstAccessToken}` },
      payload
    });
    expect(created.statusCode).toBe(201);

    const duplicateFromAnotherUser = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${secondAccessToken}` },
      payload
    });
    expect(duplicateFromAnotherUser.statusCode).toBe(409);
    expect(duplicateFromAnotherUser.json()).toMatchObject({
      data: null,
      error: {
        code: 'PRACTICE_SESSION_CONFLICT'
      }
    });

    const secondUserStats = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${secondAccessToken}` }
    });
    expect(secondUserStats.statusCode).toBe(200);
    expect(secondUserStats.json().data.totalSessions).toBe(0);

    await app.close();
  });
});

describe('auth flow race handling', () => {
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
