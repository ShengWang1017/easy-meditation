import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await buildApp();

await app.listen({ host: '0.0.0.0', port: env.PORT });
