import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      ...configDefaults.exclude,
      '**/*.native.test.ts',
      '**/*.native.test.tsx'
    ],
    globals: true
  }
});
