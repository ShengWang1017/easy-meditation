# Task 5 Report: Expo Mobile Scaffold, Auth Store, And API Client

## Summary

Implemented an Expo React Native mobile workspace under `apps/mobile` with:

- Expo Router app scaffold and app config
- shared theme tokens and `Screen` layout component
- typed auth API helpers using `@easy-meditation/shared`
- generic `apiRequest<T>()` client with auth header injection
- Zustand auth store with SecureStore-backed refresh token restore
- auth-gated root navigation
- login/register screens with normal Chinese copy
- temporary `practice` tab plus a placeholder `records` tab required by the tab layout
- focused Vitest coverage so the mobile workspace `test` script is meaningful

## Files Changed

- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/babel.config.js`
- `apps/mobile/tsconfig.json`
- `apps/mobile/expo-env.d.ts`
- `apps/mobile/vitest.config.ts`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(auth)/login.tsx`
- `apps/mobile/app/(auth)/register.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/app/(tabs)/practice.tsx`
- `apps/mobile/app/(tabs)/records.tsx`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/client.test.ts`
- `apps/mobile/src/api/auth.ts`
- `apps/mobile/src/store/authStore.ts`
- `apps/mobile/src/store/authStore.test.ts`
- `apps/mobile/src/components/Screen.tsx`
- `apps/mobile/src/theme/tokens.ts`
- `package-lock.json`

## TDD Evidence

### RED

1. Ran `npm --workspace apps/mobile run test` before installing dependencies.
2. Result: FAIL.
3. Failure reason: the new mobile suite could not resolve `expo-secure-store` and `zustand` yet, proving the workspace/test path was not already passing.

### GREEN

1. Added the mobile scaffold, API client, auth store, and focused tests for:
   - auth header + error-envelope behavior in `apiRequest<T>()`
   - auth store login/register/restore/logout token lifecycle
2. First post-install test run still failed:
   - `src/api/client.test.ts` loaded the real Expo native module path through `authStore`
   - Vitest failed parsing the React Native Flow entrypoint
3. Fixed by mocking `expo-secure-store` in `client.test.ts`.
4. Re-ran `npm --workspace apps/mobile run test`.
5. Result: PASS, 8 tests passed.

## Dependency Resolution Notes

`npm install` initially failed with an Expo / React Native peer dependency conflict:

- `react-native-screens@4.25.2` required `react-native >= 0.82.0`
- the mobile app is constrained to Expo SDK 53 / React Native 0.79

To resolve conservatively, I checked an SDK 53 template with `create-expo-app` plus `npx expo install` and aligned the mobile package versions to the SDK 53-compatible set:

- `expo ~53.0.27`
- `react-native 0.79.6`
- `expo-router ~5.1.11`
- `expo-secure-store ~14.2.4`
- `expo-constants ~17.1.8`
- `expo-linking ~7.1.7`
- `expo-crypto ~14.1.5`
- `react-native-gesture-handler ~2.24.0`
- `react-native-reanimated ~3.17.4`
- `react-native-safe-area-context 5.4.0`
- `react-native-screens ~4.11.1`

Also added `@babel/core` because the Expo SDK 53 template includes it as a dev dependency.

## Verification

### Required commands

1. `npm install`
   - PASS

2. `npm --workspace apps/mobile run typecheck`
   - PASS

3. `npm --workspace apps/mobile run test`
   - PASS
   - 2 files, 8 tests passed

### Extra verification

4. `npm test`
   - PASS
   - `apps/api`: 12 tests passed
   - `apps/mobile`: 8 tests passed
   - `packages/shared`: 10 tests passed

## Self-Review Against Brief

- Expo React Native scaffold created under `apps/mobile`: yes
- shared types consumed from `@easy-meditation/shared`: yes
- auth endpoints from Task 3 used: yes
- generic `apiRequest<T>()`: yes
- `useAuthStore` with `accessToken`, `refreshToken`, `login`, `register`, `logout`, `restore`: yes
- root auth gating and navigation shell: yes
- login/register screens with normal Chinese copy: yes
- temporary practice tab screen: yes
- tests added so mobile test script is meaningful: yes

## Concerns

- I added `apps/mobile/app/(tabs)/records.tsx` even though it was not listed in the brief, because the tab layout declares a `records` route and Expo Router would otherwise have a dangling tab target.
- I did not modify backend/API files.

## Task 5 Review Fixes Addendum

### Scope

- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/client.test.ts`
- `apps/mobile/src/api/auth.ts`
- `apps/mobile/src/store/authStore.ts`
- `apps/mobile/src/store/authStore.test.ts`

### RED

1. Added failing review tests for:
   - SecureStore read rejection during `restore()`
   - backend refresh-token revocation during `logout()`
   - best-effort local logout cleanup when revoke fails
   - API base URL resolution for env override, Expo dev host, and Android emulator fallback
2. Ran:
   - `npm --workspace apps/mobile run test -- src/api/client.test.ts src/store/authStore.test.ts`
3. Expected failures observed:
   - `restore()` rejected when `SecureStore.getItemAsync()` threw, leaving the new test red
   - `authApi.logout` did not exist, so logout revocation tests failed
   - `resolveApiBaseUrl` did not exist, so base URL resolution tests failed

### GREEN

1. Implemented:
   - `resolveApiBaseUrl()` in `client.ts` with env override, Expo dev-host detection, Android emulator fallback, and iOS/web localhost fallback
   - `logout(refreshToken)` auth API helper targeting `POST /auth/logout`
   - `authStore.restore()` cleanup on SecureStore read failure with `isRestoring` always cleared
   - best-effort backend logout revocation before local token cleanup
2. Re-ran focused tests:
   - `npm --workspace apps/mobile run test -- src/api/client.test.ts src/store/authStore.test.ts`
   - PASS, 13 tests passed
3. Re-ran required verification:
   - `npm --workspace apps/mobile run test`
   - PASS, 2 files and 13 tests passed
   - `npm --workspace apps/mobile run typecheck`
   - PASS

### Review Fix Notes

- Logout revocation is intentionally best-effort: local cleanup still completes when `/auth/logout` fails.
- No backend/API files were modified.

## Task 5 Final Review Fix Addendum

### Scope

- `apps/mobile/src/store/authStore.ts`
- `apps/mobile/src/store/authStore.test.ts`

### RED

1. Added a failing logout regression test covering:
   - access and refresh tokens already present in memory
   - `authApi.logout()` succeeding
   - `SecureStore.deleteItemAsync()` rejecting
2. Ran:
   - `npm --workspace apps/mobile run test -- authStore.test.ts`
3. Observed expected failure:
   - `still clears local auth state when secure storage deletion fails during logout`
   - rejected with `Error: secure store unavailable` instead of resolving

### GREEN

1. Updated `authStore.logout()` so it:
   - keeps backend revocation best-effort
   - keeps secure-store deletion best-effort
   - always clears in-memory auth state in `finally`
2. Re-ran focused verification:
   - `npm --workspace apps/mobile run test -- authStore.test.ts`
   - PASS, 8 tests passed
3. Re-ran required workspace verification:
   - `npm --workspace apps/mobile run test`
   - PASS, 2 files and 14 tests passed
   - `npm --workspace apps/mobile run typecheck`
   - PASS

### Mojibake Adjudication Note

- The earlier mojibake finding was treated as a false positive per controller adjudication.
- I did not change user-facing Chinese copy in this fix.
