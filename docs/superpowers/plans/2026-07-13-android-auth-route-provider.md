# Android Auth Route Provider Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Android unauthenticated launches and session termination from rendering a protected screen after its preferences provider has been removed.

**Architecture:** Replace redirect-based authentication branching in the normal root navigator with one Expo Router stack containing mutually exclusive `Stack.Protected` route sets. Wrap that stack in `AuthSessionBoundary` only while authenticated, so protected routes and their user-scoped provider enter and leave the tree together.

**Tech Stack:** Expo Router 5.1, React Native, TypeScript, Jest, Testing Library React Native, Android Debug Bridge

## Global Constraints

- An unauthenticated launch exposes only `(auth)/login` and `(auth)/register`, with login declared first.
- An authenticated launch exposes only `(tabs)`, `guide`, `custom-rhythm`, and `session/[methodId]`.
- No protected screen can render outside `AuthSessionBoundary`.
- Keep the existing authentication restore loading/error states and visual-QA routing behavior.
- Do not change authentication persistence, token refresh, API contracts, or screen UI.
- Preserve the current native session options: no header, no swipe removal, and no back-button menu.

---

## File Structure

- Modify `apps/mobile/src/test/screens/root-layout.native.test.tsx`: teach the Expo Router mock to enforce protected guards and add regression coverage for unauthenticated cold start and authenticated-to-unauthenticated transition.
- Modify `apps/mobile/app/_layout.tsx`: define the guarded normal stack and keep the authenticated provider lifetime aligned with protected route availability.
- No new runtime files or dependencies are required.

### Task 1: Guard Root Routes and Provider Lifetime

**Files:**
- Modify: `apps/mobile/src/test/screens/root-layout.native.test.tsx:5-45,133-164`
- Modify: `apps/mobile/app/_layout.tsx:1-93`
- Verify: `apps/mobile/src/test/screens/root-layout.native.test.tsx`

**Interfaces:**
- Consumes: Expo Router `Stack.Protected({ guard: boolean, children: ReactNode })` and `useAuthStore` fields `accessToken`, `isRestoring`, `restoreError`, `isTerminating`, and `restore`.
- Produces: `NormalStack({ authenticated: boolean }): ReactElement`, whose available root screen names are exactly the auth routes when `authenticated` is false and exactly the protected application routes when true.
- Preserves: `AuthSessionBoundary({ children })` remains the sole provider of the user-scoped preferences store for normal authenticated screens.

- [ ] **Step 1: Make the router mock enforce protected route guards**

Change the mock auth state type so a test can transition to `null`, and replace the mock `Stack` construction with an object-assigned component that includes `Protected`:

```tsx
const mockAuthState: {
  accessToken: string | null;
  isRestoring: boolean;
  restoreError: string | null;
  isTerminating: boolean;
  restore: typeof mockRestore;
} = {
  accessToken: 'access-token',
  isRestoring: false,
  restoreError: null,
  isTerminating: false,
  restore: mockRestore
};

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View: MockView } = jest.requireActual<typeof import('react-native')>(
    'react-native'
  );
  const Stack = Object.assign(
    ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(MockView, { testID: 'root-stack' }, children),
    {
      Screen: (props: {
        name: string;
        options?: Record<string, unknown>;
      }) => {
        mockRegisteredScreens.push(props);
        return null;
      },
      Protected: ({
        children,
        guard
      }: {
        children?: React.ReactNode;
        guard: boolean;
      }) =>
        guard
          ? ReactModule.createElement(ReactModule.Fragment, null, children)
          : null
    }
  );

  return {
    Slot: () => ReactModule.createElement(MockView, { testID: 'root-slot' }),
    Stack,
    useGlobalSearchParams: () => mockSearchParams,
    usePathname: () => mockPathname
  };
});
```

Remove the obsolete `Redirect` and `useSegments` mock exports because normal routing will no longer consume them.

- [ ] **Step 2: Write the failing route-lifetime regression tests**

Reset the mutable auth state in `beforeEach`, then add cold-start and transition coverage after the existing session-options test:

```tsx
beforeEach(() => {
  (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
  mockRegisteredScreens.length = 0;
  mockAuthState.accessToken = 'access-token';
  mockRestore.mockClear();
  mockSearchParams = {};
  mockPathname = '/practice';
  delete process.env.EXPO_PUBLIC_VISUAL_QA;
});

it('keeps an unauthenticated cold start inside the root stack', () => {
  mockAuthState.accessToken = null;

  const view = render(<RootLayout />);

  expect(view.getByTestId('root-stack')).toBeTruthy();
  expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
    '(auth)/login',
    '(auth)/register'
  ]);
});

it('removes protected routes when the authenticated session ends', () => {
  const view = render(<RootLayout />);

  expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
    '(tabs)',
    'guide',
    'custom-rhythm',
    'session/[methodId]'
  ]);

  mockRegisteredScreens.length = 0;
  mockAuthState.accessToken = null;
  view.rerender(<RootLayout />);

  expect(view.getByTestId('root-stack')).toBeTruthy();
  expect(mockRegisteredScreens.map((screen) => screen.name)).toEqual([
    '(auth)/login',
    '(auth)/register'
  ]);
});
```

- [ ] **Step 3: Run the focused test and verify the regression is red**

Run:

```bash
npm --workspace apps/mobile run test:native -- --runTestsByPath src/test/screens/root-layout.native.test.tsx
```

Expected: FAIL because the existing unauthenticated branch returns `Redirect`, so `root-stack` cannot be found. The authenticated route-name assertion also fails because the existing stack only explicitly registers `session/[methodId]`.

- [ ] **Step 4: Replace normal redirects with guarded root routes**

Remove `Redirect` and `useSegments` from the Expo Router import, keep `Slot` for visual QA, reuse one session-options constant, and add the guarded normal stack:

```tsx
import {
  Slot,
  Stack,
  useGlobalSearchParams,
  usePathname
} from 'expo-router';

const sessionScreenOptions = {
  headerShown: false,
  gestureEnabled: false,
  headerBackButtonMenuEnabled: false
} as const;

function ProtectedStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="session/[methodId]"
        options={sessionScreenOptions}
      />
    </Stack>
  );
}

function NormalStack({ authenticated }: { authenticated: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!authenticated}>
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
      </Stack.Protected>
      <Stack.Protected guard={authenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="guide" />
        <Stack.Screen name="custom-rhythm" />
        <Stack.Screen
          name="session/[methodId]"
          options={sessionScreenOptions}
        />
      </Stack.Protected>
    </Stack>
  );
}
```

Remove `useSegments`, `inAuthGroup`, and both redirect branches from `NormalRootNavigator`. After the unchanged restore loading/error returns, use the same guarded stack in both auth states and add the boundary only for an authenticated session:

```tsx
const stack = <NormalStack authenticated={Boolean(accessToken)} />;

if (!accessToken) {
  return stack;
}

return <AuthSessionBoundary>{stack}</AuthSessionBoundary>;
```

- [ ] **Step 5: Run the focused test and type checker**

Run:

```bash
npm --workspace apps/mobile run test:native -- --runTestsByPath src/test/screens/root-layout.native.test.tsx
npm --workspace apps/mobile run typecheck
```

Expected: the root-layout test file passes, including the existing visual-QA and session-option cases; TypeScript exits with code 0.

- [ ] **Step 6: Run the complete mobile test suite**

Run:

```bash
npm --workspace apps/mobile test
```

Expected: unit, native, and asset tests all pass with no failed suites.

- [ ] **Step 7: Verify the Android runtime symptom**

With Metro on port 8081, the local API on port 4000, and `emulator-5554` running, restart the native debug app:

```bash
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 reverse tcp:4000 tcp:4000
adb -s emulator-5554 logcat -c
adb -s emulator-5554 shell am force-stop com.easymeditation.app
adb -s emulator-5554 shell am start -n com.easymeditation.app/.MainActivity
```

After the bundle loads, dump the visible UI:

```bash
adb -s emulator-5554 shell uiautomator dump /sdcard/easy-meditation-window.xml
adb -s emulator-5554 shell cat /sdcard/easy-meditation-window.xml
```

Expected: the hierarchy contains the login screen copy and does not contain `usePreferencesStore must be used within PreferencesStoreProvider`.

Inspect errors:

```bash
adb -s emulator-5554 logcat -d -v brief ReactNativeJS:E '*:S'
```

Expected: no preferences-provider error and no fatal JavaScript exception from the launch.

- [ ] **Step 8: Review the final diff and commit the fix**

Run:

```bash
git diff --check -- apps/mobile/app/_layout.tsx apps/mobile/src/test/screens/root-layout.native.test.tsx
git diff -- apps/mobile/app/_layout.tsx apps/mobile/src/test/screens/root-layout.native.test.tsx
git add apps/mobile/app/_layout.tsx apps/mobile/src/test/screens/root-layout.native.test.tsx
git commit -m "fix(mobile): guard authenticated root routes"
```

Expected: the diff contains only the root route guard and its regression tests; the commit succeeds without staging `.gitignore` or `apps/mobile/expo-env.d.ts`.
