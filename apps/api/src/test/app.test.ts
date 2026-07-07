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
