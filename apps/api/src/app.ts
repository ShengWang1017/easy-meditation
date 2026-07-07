import cors from '@fastify/cors';
import Fastify from 'fastify';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerMeRoutes } from './modules/me/me.routes.js';
import { registerMethodsRoutes } from './modules/methods/methods.routes.js';
import { registerSessionRoutes } from './modules/sessions/sessions.routes.js';
import { registerStatsRoutes } from './modules/stats/stats.routes.js';
import { authPlugin } from './plugins/auth.js';

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });
  await app.register(authPlugin);

  app.get('/health', async () => ({
    data: { ok: true },
    error: null
  }));

  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerMethodsRoutes(app);
  await registerSessionRoutes(app);
  await registerStatsRoutes(app);

  return app;
}
