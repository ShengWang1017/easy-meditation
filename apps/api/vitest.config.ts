import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts']
  }
});
