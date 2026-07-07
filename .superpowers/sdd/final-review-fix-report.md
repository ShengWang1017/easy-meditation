# Final Review Important Findings Fix Report

## 2026-07-08 Mobile/Backend Vertical Slice Important Fixes

### Findings Addressed

- API validation envelope: added a global Zod error handler so route-level `.parse(...)` failures return HTTP 400 with `{ data: null, error: { code: 'VALIDATION_ERROR', message, fields } }`.
- Practice-session ownership/type invariants: enforced built-in sessions to use only non-null active built-in `methodId` and null `customRhythmId`; enforced custom sessions to use null `methodId` and a non-deleted custom rhythm owned by `request.user.sub`.
- Mobile active access-token refresh: added one authenticated 401 retry using the current refresh token, low-level `/auth/refresh`, rotated token storage, and invalid-refresh local auth clearing.
- Atomic refresh rotation: changed `/auth/refresh` to conditionally revoke exactly one unrevoked, unexpired stored token in a transaction before issuing the rotated pair.
- Stats source of truth: changed `GET /stats/summary` so weekly seconds use a DB aggregate over the weekly window, current streak uses all authenticated user practice dates up to now, and `recentSessions` remains limited to 10.

### Files Changed

- `apps/api/src/app.ts`
- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/sessions/sessions.routes.ts`
- `apps/api/src/modules/stats/stats.routes.ts`
- `apps/api/src/modules/stats/stats.service.ts`
- `apps/api/src/test/app.test.ts`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/client.test.ts`
- `apps/mobile/src/store/authStore.ts`

### RED Evidence

- `npm --workspace apps/api run test -- src/test/app.test.ts`
  - Failed as expected: 6 failures.
  - Validation envelope tests received 500 instead of 400.
  - Built-in/custom relation invariant tests received 201 instead of 400.
  - Weekly seconds returned 200 instead of 205.
  - Current streak returned 0 instead of 2.
- `npm --workspace apps/mobile run test -- src/api/client.test.ts`
  - Failed as expected: 2 failures.
  - Expired access-token request rejected with original 401 instead of refreshing/retrying.
  - Invalid refresh path returned original `UNAUTHORIZED` instead of `INVALID_REFRESH_TOKEN` and local clearing.
- Initial focused command filters using workspace-prefixed paths found no files because workspace scripts run from package directories; reran with package-relative filters before implementation.

### GREEN Evidence

- Focused after implementation:
  - `npm --workspace apps/api run test -- src/test/app.test.ts`: passed, 19 tests.
  - `npm --workspace apps/mobile run test -- src/api/client.test.ts`: passed, 8 tests.

### Final Verification

- `npm --workspace apps/api run test`: passed, 1 file / 19 tests.
- `npm --workspace apps/mobile run test`: passed, 5 files / 23 tests.
- `npm --workspace apps/api run typecheck`: passed.
- `npm --workspace apps/mobile run typecheck`: passed.
- `npm test`: passed across API, mobile, and shared; 8 files / 52 tests total.

### Concerns

- No public custom-rhythm creation route was present in the reviewed API surface, so cross-user custom rhythm rejection is covered by creating `CustomRhythm` rows directly through Prisma in the API test.
- The refresh replay regression is sequential; the implementation uses conditional revoke in a transaction to cover the concurrent double-rotation risk.
- Weekly stats preserve the existing rolling 7-day window semantics while moving the source of truth to a DB aggregate, rather than changing behavior to calendar-week boundaries.

## 2026-07-08 Final Review Fix Worker Follow-up

### Files Changed

- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/client.test.ts`
- `apps/api/src/modules/auth/auth.routes.ts`
- `apps/api/src/test/app.test.ts`

### Tests Run

- `npm --workspace apps/mobile run test -- client.test.ts`
  - Passed: 1 file / 9 tests.
- `npm --workspace apps/mobile run test -- api`
  - Passed: 3 files / 12 tests.
- `npm --workspace apps/api run test -- auth`
  - Did not match any files in this repo layout; Vitest exited with `No test files found`.
- `npm --workspace apps/api run test -- src/test/app.test.ts`
  - Passed: 1 file / 20 tests.

### Outcome

- Mobile client now deduplicates concurrent refresh attempts by refresh token and preserves auth when an invalid refresh response is stale relative to the current store state.
- `/auth/refresh` now uses the shared Zod validation envelope path, returning `VALIDATION_ERROR` with field details for invalid bodies.

### Concerns

- The requested API filter `npm --workspace apps/api run test -- auth` is not a valid selector for this package's current Vitest layout, so the package-relative test file command was used as the targeted fallback verification.
