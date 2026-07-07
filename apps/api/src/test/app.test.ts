import crypto from 'node:crypto';
import { BREATHING_METHODS_SEED, breathingMethodSchema, dataEnvelope } from '@easy-meditation/shared';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';

afterEach(() => {
  vi.restoreAllMocks();
});

async function registerTestAccount(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `session-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const response = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'quiet-breathing-123',
      nickname: 'Session Tester'
    }
  });

  expect(response.statusCode).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  return {
    accessToken: response.json().data.tokens.accessToken as string,
    refreshToken: response.json().data.tokens.refreshToken as string,
    userId: user.id
  };
}

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const account = await registerTestAccount(app);
  return account.accessToken;
}

function builtInSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
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
    endedAt: new Date('2026-07-07T09:03:00.000Z').toISOString(),
    ...overrides
  };
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
  test('rejects unauthenticated access to protected routes', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/me'
    });
    await app.close();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      data: null,
      error: {
        code: 'UNAUTHORIZED'
      }
    });
  });

  test('returns validation envelopes for invalid auth payloads', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'not-an-email',
        password: 'short',
        nickname: ''
      }
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: {
          email: expect.any(String),
          password: expect.any(String),
          nickname: expect.any(String)
        }
      }
    });
  });

  test('returns the standard validation envelope for an invalid refresh payload', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {}
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the highlighted fields.',
        fields: {
          refreshToken: expect.any(String)
        }
      }
    });
  });

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

  test('allows exactly one rotation for a refresh token replay', async () => {
    const app = await buildApp();
    const { refreshToken } = await registerTestAccount(app);

    const first = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken }
    });
    const second = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken }
    });
    await app.close();

    expect(first.statusCode).toBe(200);
    expect(first.json().data.refreshToken).toEqual(expect.any(String));
    expect(second.statusCode).toBe(401);
    expect(second.json()).toMatchObject({
      data: null,
      error: { code: 'INVALID_REFRESH_TOKEN' }
    });
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
  test('returns validation envelopes for invalid practice-session bodies', async () => {
    const app = await buildApp();
    const accessToken = await registerTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: builtInSessionPayload({
        clientSessionId: 'not-a-uuid',
        actualDurationSeconds: 0
      })
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: {
          clientSessionId: expect.any(String),
          actualDurationSeconds: expect.any(String)
        }
      }
    });
  });

  test('rejects built-in practice sessions without an active built-in method only', async () => {
    const app = await buildApp();
    const { accessToken, userId } = await registerTestAccount(app);
    const customRhythm = await prisma.customRhythm.create({
      data: {
        userId,
        name: 'Custom calm',
        inhaleSeconds: 4,
        holdSeconds: 2,
        exhaleSeconds: 6,
        defaultDurationSeconds: 180
      }
    });

    const missingMethod = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: builtInSessionPayload({ methodId: null })
    });
    const mixedRelation = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: builtInSessionPayload({ customRhythmId: customRhythm.id })
    });
    const unknownMethod = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: builtInSessionPayload({ methodId: 'missing-method' })
    });
    await app.close();

    expect(missingMethod.statusCode).toBe(400);
    expect(missingMethod.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: { methodId: expect.any(String) }
      }
    });
    expect(mixedRelation.statusCode).toBe(400);
    expect(mixedRelation.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: { customRhythmId: expect.any(String) }
      }
    });
    expect(unknownMethod.statusCode).toBe(404);
    expect(unknownMethod.json()).toMatchObject({
      data: null,
      error: { code: 'BREATHING_METHOD_NOT_FOUND' }
    });
  });

  test('requires custom practice sessions to use the authenticated user custom rhythm only', async () => {
    const app = await buildApp();
    const first = await registerTestAccount(app);
    const second = await registerTestAccount(app);
    const ownedRhythm = await prisma.customRhythm.create({
      data: {
        userId: first.userId,
        name: 'Owned rhythm',
        inhaleSeconds: 4,
        holdSeconds: 2,
        exhaleSeconds: 6,
        defaultDurationSeconds: 180
      }
    });
    const otherUserRhythm = await prisma.customRhythm.create({
      data: {
        userId: second.userId,
        name: 'Other rhythm',
        inhaleSeconds: 5,
        holdSeconds: 0,
        exhaleSeconds: 7,
        defaultDurationSeconds: 180
      }
    });

    const missingRhythm = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: builtInSessionPayload({
        methodType: 'custom',
        methodId: null,
        customRhythmId: null
      })
    });
    const mixedRelation = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: builtInSessionPayload({
        methodType: 'custom',
        methodId: 'box',
        customRhythmId: ownedRhythm.id
      })
    });
    const crossUserRhythm = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: builtInSessionPayload({
        methodType: 'custom',
        methodId: null,
        customRhythmId: otherUserRhythm.id
      })
    });
    const valid = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${first.accessToken}` },
      payload: builtInSessionPayload({
        methodType: 'custom',
        methodId: null,
        customRhythmId: ownedRhythm.id
      })
    });
    await app.close();

    expect(missingRhythm.statusCode).toBe(400);
    expect(missingRhythm.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: { customRhythmId: expect.any(String) }
      }
    });
    expect(mixedRelation.statusCode).toBe(400);
    expect(mixedRelation.json()).toMatchObject({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        fields: { methodId: expect.any(String) }
      }
    });
    expect(crossUserRhythm.statusCode).toBe(404);
    expect(crossUserRhythm.json()).toMatchObject({
      data: null,
      error: { code: 'CUSTOM_RHYTHM_NOT_FOUND' }
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json().data).toMatchObject({
      methodType: 'custom',
      methodId: null,
      customRhythmId: ownedRhythm.id
    });
  });

  test('creates one practice session idempotently and updates stats', async () => {
    const app = await buildApp();
    const accessToken = await registerTestUser(app);
    const clientSessionId = crypto.randomUUID();
    const payload = {
      clientSessionId,
      methodType: 'built_in' as const,
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
      methodType: 'built_in' as const,
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

  test('returns the existing session when creation loses a same-user race on clientSessionId', async () => {
    const app = await buildApp();
    const { accessToken, userId } = await registerTestAccount(app);
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
      startedAt: new Date('2026-07-07T11:00:00.000Z').toISOString(),
      endedAt: new Date('2026-07-07T11:03:00.000Z').toISOString()
    };

    const existing = await prisma.practiceSession.create({
      data: {
        ...payload,
        methodType: 'built_in' as const,
        userId,
        startedAt: new Date(payload.startedAt),
        endedAt: new Date(payload.endedAt)
      }
    });

    const findUniqueSpy = vi.spyOn(prisma.practiceSession, 'findUnique').mockResolvedValueOnce(null as never);
    const createSpy = vi.spyOn(prisma.practiceSession, 'create').mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`client_session_id`)'), {
        code: 'P2002'
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/practice-sessions',
      headers: { authorization: `Bearer ${accessToken}` },
      payload
    });

    createSpy.mockRestore();
    findUniqueSpy.mockRestore();
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.id).toBe(existing.id);
  });

  test('computes summary totals from all authenticated user sessions, not only the recent window', async () => {
    const app = await buildApp();
    const { accessToken, userId } = await registerTestAccount(app);

    await prisma.practiceSession.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        clientSessionId: crypto.randomUUID(),
        userId,
        methodType: 'built_in' as const,
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
        actualDurationSeconds: 1,
        completed: true,
        startedAt: new Date(Date.UTC(2026, 6, 1, 0, index, 0)),
        endedAt: new Date(Date.UTC(2026, 6, 1, 0, index, 30))
      }))
    });

    const response = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.totalSessions).toBe(205);
    expect(response.json().data.totalPracticeSeconds).toBe(205);
    expect(response.json().data.recentSessions).toHaveLength(10);
  });

  test('computes weekly practice seconds from all sessions in the week, not only the recent window', async () => {
    const app = await buildApp();
    const { accessToken, userId } = await registerTestAccount(app);
    const now = new Date();

    await prisma.practiceSession.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        clientSessionId: crypto.randomUUID(),
        userId,
        methodType: 'built_in' as const,
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
        actualDurationSeconds: 1,
        completed: true,
        startedAt: new Date(now.getTime() - index * 60 * 1000 - 30_000),
        endedAt: new Date(now.getTime() - index * 60 * 1000)
      }))
    });

    const response = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.weeklyPracticeSeconds).toBe(205);
  });

  test('computes the current streak from distinct practice dates beyond the recent window', async () => {
    const app = await buildApp();
    const { accessToken, userId } = await registerTestAccount(app);
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    await prisma.practiceSession.createMany({
      data: [
        ...Array.from({ length: 205 }, (_, index) => ({
          clientSessionId: crypto.randomUUID(),
          userId,
          methodType: 'built_in' as const,
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
          actualDurationSeconds: 1,
          completed: true,
          startedAt: new Date(tomorrowStart.getTime() + index * 60 * 1000),
          endedAt: new Date(tomorrowStart.getTime() + index * 60 * 1000 + 30_000)
        })),
        {
          clientSessionId: crypto.randomUUID(),
          userId,
          methodType: 'built_in' as const,
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
          actualDurationSeconds: 1,
          completed: true,
          startedAt: new Date(todayStart.getTime() + 60 * 60 * 1000),
          endedAt: new Date(todayStart.getTime() + 60 * 60 * 1000 + 30_000)
        },
        {
          clientSessionId: crypto.randomUUID(),
          userId,
          methodType: 'built_in' as const,
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
          actualDurationSeconds: 1,
          completed: true,
          startedAt: new Date(yesterdayStart.getTime() + 60 * 60 * 1000),
          endedAt: new Date(yesterdayStart.getTime() + 60 * 60 * 1000 + 30_000)
        }
      ]
    });

    const response = await app.inject({
      method: 'GET',
      url: '/stats/summary',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.currentStreak).toBe(2);
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
