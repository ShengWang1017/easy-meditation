# Android Auth Route and Provider Stability Design

**Date:** 2026-07-13

## Problem

On an unauthenticated Android cold start, authentication restore completes with no saved refresh token. `NormalRootNavigator` immediately removes `AuthSessionBoundary` and returns a redirect to the login route. The previously mounted practice screen can render once during that navigation transition, after its `PreferencesStoreProvider` has already disappeared. Its call to `usePreferencesStore` then throws:

`usePreferencesStore must be used within PreferencesStoreProvider`

This is a routing/provider lifetime race, not stale emulator data or an API failure.

## Goals

- An unauthenticated launch exposes only the authentication routes and lands on login.
- An authenticated launch exposes only application routes.
- No protected screen can render outside `AuthSessionBoundary`.
- Login, logout, and expired-session transitions do not create an intermediate provider-less protected screen.
- Existing authentication restore loading/error handling and visual-QA routing keep their behavior.

## Non-goals

- Changing authentication persistence or token refresh behavior.
- Providing anonymous preferences to protected screens.
- Redesigning login, registration, or practice UI.
- Changing the local API contract.

## Chosen Design

Use Expo Router's locally installed `Stack.Protected` API to configure mutually exclusive route sets in one root stack.

- When unauthenticated, the stack includes only `(auth)`.
- When authenticated, the stack includes `(tabs)`, `guide`, `custom-rhythm`, and `session/[methodId]`.
- The authenticated stack is wrapped by `AuthSessionBoundary`, which prepares the user-scoped preferences store before rendering protected routes.
- The unauthenticated stack is rendered without `AuthSessionBoundary` because no user-scoped store should exist.
- Loading and restore-error states continue to return before either route set is rendered.
- Visual-QA mode continues through its existing isolated path.

The current redirect-based authentication branching will be removed from normal routing. A guard change updates the navigator's available screens directly, so a protected screen is excluded before it could render without its provider.

## State Transitions

### Cold start without a saved session

1. Authentication restore shows the existing loading state.
2. Restore resolves with no access token.
3. The root stack enables only the auth group.
4. Expo Router selects the login route; no protected screen mounts.

### Login

1. Login stores the authenticated session.
2. The root stack disables the auth group and enables protected routes.
3. `AuthSessionBoundary` fetches the user and hydrates the preferences store.
4. The protected navigator renders after the provider is ready.

### Logout or expired session

1. The access token becomes unavailable.
2. Protected routes are excluded from the new stack configuration.
3. The authenticated boundary is removed with its protected route tree.
4. The auth group becomes active and the login screen renders.

## Files and Responsibilities

- `apps/mobile/app/_layout.tsx`
  - Replace normal-route redirects with protected route groups.
  - Explicitly register auth and protected top-level routes.
  - Preserve existing session screen options and loading/error states.
- `apps/mobile/src/test/screens/root-layout.native.test.tsx`
  - Add regression coverage for unauthenticated route availability.
  - Cover an authenticated-to-unauthenticated transition and assert that the root stack remains configured while protected routes are excluded.
  - Preserve existing route-option and visual-QA assertions.

## Verification

- Run the focused root-layout native test first and confirm the new regression fails before implementation.
- Implement the route guard and make the focused test pass.
- Run mobile type checking and the full mobile test suites.
- Launch the native Android debug app with no saved refresh token.
- Confirm the login screen appears without the preferences-provider runtime error.
- After authentication, confirm the practice and session screens load and the breath sphere can be inspected.

## Risks and Mitigations

- **Incorrectly omitted route:** Explicitly list every current top-level protected route and assert registrations in tests.
- **Session options regression:** Reuse the existing session screen options and retain their current assertions.
- **Visual-QA regression:** Leave the visual-QA navigator path independent from normal authentication guards.
- **Provider timing regression:** Test the authenticated-to-unauthenticated rerender, which reproduces the lifetime boundary that caused the Android crash.
