# Final Review Repro Fix Report

## 2026-07-08 Reproducibility Fixes

### Files Changed

- `package.json`
- `apps/api/package.json`
- `apps/api/prisma/seed.ts`
- `apps/api/src/plugins/auth.ts`
- `apps/api/src/test/app.test.ts`
- `apps/api/src/test/setup.ts`
- `apps/api/vitest.config.ts`
- `apps/mobile/package.json`
- `apps/mobile/src/api/client.test.ts`

### Test and Bootstrap Behavior

- API workspace commands now build `packages/shared` first via `prebuild`, `predev`, `prestart`, `pretest`, and `pretypecheck`.
- Mobile workspace commands now build `packages/shared` first via `prestart`, `pretest`, and `pretypecheck`.
- Root `dev:api` and `dev:mobile` now build `packages/shared` before starting consumers.
- API Vitest now runs with `setupFiles` and `fileParallelism: false`.
- API test setup runs `npm exec -- prisma migrate deploy --schema prisma/schema.prisma` from `apps/api`, cleans app-owned mutable tables in the configured schema, removes non-seed breathing-method rows, and reseeds `BREATHING_METHODS_SEED` before each test.
- Tests target the configured `DATABASE_URL`; with the current `apps/api/.env`, that is the local Docker Postgres at `127.0.0.1:5432`, database `easy_meditation`, schema `public`.

### Red Evidence

- After deleting only `packages/shared/dist` and `apps/api/dist`, `npm --workspace apps/api run test -- src/test/app.test.ts` failed before collection with `Failed to resolve entry for package "@easy-meditation/shared"`.
- With shared built but a fresh schema override, `npm --workspace apps/api run test -- src/test/app.test.ts -t "returns seeded breathing methods"` failed with HTTP 500 instead of 200 because the schema and seed data were not bootstrapped.

### Commands Run and Outcomes

- `npm run db:up`
  - Passed. Postgres container already running.
- Fresh-schema proof:
  - `DATABASE_URL=...schema=<new>` + `npm --workspace apps/api run test -- src/test/app.test.ts -t "returns seeded breathing methods"`
  - Passed after the fix; Prisma applied `20260707170722_init` and the test returned seeded methods.
- Clean generated-output state:
  - Deleted only `packages/shared/dist` and `apps/api/dist`.
- `npm --workspace apps/api run test -- src/test/app.test.ts`
  - Passed: 1 file, 21 tests. Pretest rebuilt shared; Prisma reported no pending migrations on `public`.
- `npm --workspace apps/mobile run test -- api`
  - Passed: 3 files, 12 tests. Pretest rebuilt shared.
- `npm test`
  - Passed across API, mobile, and shared: 8 files, 55 tests total. Shared rebuilt before both API and mobile test phases.
- `npm run typecheck --workspaces --if-present`
  - Passed for API, mobile, and shared.
- `npm run build --workspaces --if-present`
  - Passed for API and shared.

### Concerns

- API test setup intentionally cleans app-owned tables in the configured schema. On the current default `.env`, that means the local Docker Postgres `public` schema is reset between tests.
- Prisma emits a deprecation warning for `package.json#prisma`; verification still passes, but Prisma 7 will require migrating to a Prisma config file.
