import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerMethodsRoutes } from './modules/methods/methods.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  app.get('/health', async () => ({
    data: { ok: true },
    error: null
  }));

  await registerMethodsRoutes(app);

  return app;
}
