# Mobile Prototype Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Expo mobile app as a faithful native implementation of the approved repository Web prototype, while preserving authentication, API-backed built-in methods, wall-clock session timing, server-backed built-in records, and strict per-account data isolation.

**Architecture:** Keep Expo Router, React Native, TanStack Query, Zustand, SecureStore, the existing Fastify API, and shared Zod contracts. Add a small prototype design system, a user-scoped persisted preference/ledger store, an authenticated bootstrap boundary, a retrying submission outbox, Skia-based breathing visuals, Expo Audio cues, and pure record-merging logic. The Web prototype remains the visual and interaction source of truth; production mobile code stays native and never embeds a WebView.

**Tech Stack:** Expo SDK 53, React Native 0.79, React 19, Expo Router 5, TypeScript, TanStack Query 5, Zustand 5, AsyncStorage, SecureStore, Zod, React Native Skia, Reanimated, Expo Audio, React Native SVG, Vitest, Jest 29, jest-expo, React Native Testing Library, Playwright, Sharp, Pixelmatch.

## Global Constraints

- Treat `index.html`, `src/ui/app.js`, `src/ui/app-state.js`, `src/styles.css`, and `src/assets/reference-style/` as the approved source of truth.
- Implement native React Native views. Do not use a WebView or ship the Web prototype inside the app.
- Cover login, registration, practice home, guide, custom rhythm, focus session, and records on both iOS and Android.
- Keep backend routes and database schema unchanged. Built-in methods and built-in session records remain server-backed; custom rhythm, custom records, duration overrides, sound, and dismissal state remain local-only in this pass.
- Never read a global preference fallback. Every local preference key is exactly `easyMeditation.preferences.<userId>` after a successful `/me` bootstrap.
- Every post-bootstrap user-data query key starts with `['user', userId, ...]`; revision-scoped `/me` bootstrap is the sole pre-identity exception, and built-in methods remain public and globally cached.
- Persist a completed or intentionally ended session to the local ledger before any POST or navigation. A rejected local write must keep the user on the focus route.
- Keep `durationOverrides` limited to `box`, `four-seven-eight`, and `coherent`; custom duration has exactly one source, `customRhythm.durationMinutes`.
- Keep custom sessions local-only with `customRhythmId: null`; never pass them to `POST /practice-sessions`.
- Use `endedAt` and device-local calendar construction for records. Do not subtract fixed 24-hour milliseconds across DST boundaries.
- Keep text scaling enabled through `1.2`, all interactive targets at least `44x44`, and all icon-only controls named for accessibility.
- Use the exact approved colors, copy, card order, artwork, and hierarchy. Primary prototype-backed boxes may differ by at most 4 logical pixels and declared type size by at most 2 logical pixels at baseline viewports.
- Preserve unrelated working-tree changes. Each task commits only its own files.

---

## Task 1: Install Expo-Compatible Native Dependencies And Split The Test Runners

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `package-lock.json`
- Modify: `apps/mobile/vitest.config.ts`
- Create: `apps/mobile/jest.config.cjs`
- Create: `apps/mobile/src/test/jest.setup.ts`
- Create: `apps/mobile/src/test/renderWithProviders.tsx`
- Create: `apps/mobile/src/test/nativeSmoke.native.test.tsx`
- Create: `apps/mobile/src/test/svgMock.js`

**Interfaces:**

- Consumes: Expo SDK 53 compatibility resolution and the current Vitest pure-TypeScript suite.
- Produces:
  - `test:unit` for `*.test.ts` pure tests.
  - `test:native` for `*.native.test.ts` and `*.native.test.tsx` Jest/RNTL tests.
  - `renderWithProviders(ui, options)` with a fresh retry-disabled `QueryClient`.

- [ ] **Step 1: Write the native smoke test before installing the harness**

Create `apps/mobile/src/test/nativeSmoke.native.test.tsx`:

```tsx
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

describe('native test harness', () => {
  it('renders React Native accessibility semantics', () => {
    render(<Text accessibilityRole="header">测试</Text>);
    expect(screen.getByRole('header', { name: '测试' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the missing harness and verify RED**

Run from the repository root:

```bash
npm --prefix apps/mobile run test:native -- nativeSmoke
```

Expected: FAIL because `test:native`, Jest, and React Native Testing Library are not configured.

- [ ] **Step 3: Install only Expo-compatible native runtime versions**

Run:

```bash
cd apps/mobile
npx expo install --npm @react-native-async-storage/async-storage @shopify/react-native-skia expo-audio react-native-svg
cd ../..
npm install --workspace @easy-meditation/mobile --save-dev jest@29.7.0 jest-expo@~53.0.14 @types/jest@29.5.14 @testing-library/react-native@13.3.3 react-test-renderer@19.0.0 react-native-svg-transformer@1.5.3
```

Expected: Expo resolves SDK-compatible runtime packages; `package-lock.json` records one React 19 renderer and Jest 29 toolchain. Do not replace the Expo-selected Skia prerelease with npm `latest`.

- [ ] **Step 4: Configure separate Vitest and Jest ownership**

Update `apps/mobile/package.json` scripts to:

```json
{
  "pretest:unit": "npm --prefix ../../packages/shared run build",
  "test:unit": "vitest run",
  "pretest:native": "npm --prefix ../../packages/shared run build",
  "test:native": "jest --runInBand",
  "test": "npm run test:unit && npm run test:native"
}
```

Keep the existing `pretest` shared-package build. The two additional lifecycle scripts make focused runner commands work from a clean checkout where `packages/shared/dist` is absent. Add `**/*.native.test.ts` and `**/*.native.test.tsx` to `vitest.config.ts` exclusions. Configure `jest.config.cjs` with `preset: 'jest-expo'`, only the two native-test patterns, `jest.setup.ts`, and `svgMock.js`.

Use this Jest configuration:

```js
module.exports = {
  preset: 'jest-expo',
  rootDir: '.',
  testMatch: [
    '<rootDir>/**/*.native.test.ts',
    '<rootDir>/**/*.native.test.tsx'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test/jest.setup.ts'],
  moduleNameMapper: {
    '\\.(svg)$': '<rootDir>/src/test/svgMock.js'
  }
};
```

Initialize gesture-handler and Reanimated in `jest.setup.ts`:

```ts
import 'react-native-gesture-handler/jestSetup';
import { setUpTests } from 'react-native-reanimated';
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

setUpTests();
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
```

- [ ] **Step 5: Add a reusable provider renderer**

Create `renderWithProviders.tsx` with this public contract:

```ts
export type RenderWithProvidersOptions = {
  queryClient?: QueryClient;
};

export function createTestQueryClient(): QueryClient;

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderWithProvidersOptions
): ReturnType<typeof render> & { queryClient: QueryClient };
```

Set query and mutation retries to `false`, garbage collection time to `0`, and wrap with `QueryClientProvider`, `SafeAreaProvider`, and `GestureHandlerRootView`.

- [ ] **Step 6: Run the harness and existing suites**

Run:

```bash
npm --prefix apps/mobile run test:native -- nativeSmoke
npm --prefix apps/mobile run test:unit
npm --prefix apps/mobile run typecheck
```

Expected: smoke test PASS, current Vitest tests PASS, typecheck PASS.

- [ ] **Step 7: Commit the test and dependency foundation**

```bash
git add apps/mobile/package.json apps/mobile/vitest.config.ts apps/mobile/jest.config.cjs apps/mobile/src/test package-lock.json
git commit -m "chore(mobile): add native dependencies and component test harness"
```

---

## Task 2: Pin Fonts, Register Source Assets, And Port The Visual Tokens

**Files:**

- Modify: `apps/mobile/metro.config.js`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/scripts/fetch-lxgw-wenkai.mjs`
- Create: `apps/mobile/assets/fonts/LXGWWenKai-Regular.ttf`
- Create: `apps/mobile/assets/fonts/LXGWWenKai-Medium.ttf`
- Create: `apps/mobile/assets/fonts/OFL.txt`
- Create: `apps/mobile/src/theme/fonts.ts`
- Create: `apps/mobile/src/theme/assets.ts`
- Create: `apps/mobile/src/theme/PrototypeFontBoundary.tsx`
- Create: `apps/mobile/src/theme/tokens.test.ts`
- Create: `apps/mobile/src/theme/PrototypeFontBoundary.native.test.tsx`
- Create: `apps/mobile/src/types/svg.d.ts`

**Interfaces:**

```ts
export const fontFamilies = {
  display: 'LXGWWenKai-Medium',
  body: 'LXGWWenKai-Regular',
  system: undefined
} as const;

export const referenceImages = {
  back: ImageSourcePropType,
  info: ImageSourcePropType,
  gear: ImageSourcePropType,
  petalBox: ImageSourcePropType,
  petalSleep: ImageSourcePropType,
  petalFocus: ImageSourcePropType,
  dandelion: ImageSourcePropType
};
```

- [ ] **Step 1: Write exact token and font-boundary tests**

Assert at minimum:

```ts
expect(colors).toMatchObject({
  ink: '#111622',
  muted: '#6d7483',
  backgroundTop: '#f0f2ff',
  backgroundMid: '#e9fbfb',
  backgroundBottom: '#f6f7f9',
  lilac: '#ece0f7',
  periwinkle: '#e0e6ff',
  blue: '#dfe9fb',
  mintBlue: '#d4eef6',
  activeNav: '#a8e8e0',
  teal: '#0b717a'
});
```

The native boundary tests must prove that children stay hidden until both fonts load and that a load error renders an explicit blocking font error instead of silently falling back.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/theme/tokens.test.ts
npm --prefix apps/mobile run test:native -- PrototypeFontBoundary
```

Expected: FAIL because the exact token exports and boundary do not exist.

- [ ] **Step 3: Add a deterministic pinned font-fetch script and commit its output**

Use upstream commit `4d2df149f67075611c9f14f73380b518c4dde80b`, not a moving branch. The script downloads these paths:

```js
const FONT_BASE =
  'https://raw.githubusercontent.com/lxgw/LxgwWenKai/4d2df149f67075611c9f14f73380b518c4dde80b';

export const FONT_FILES = {
  'LXGWWenKai-Regular.ttf': `${FONT_BASE}/fonts/TTF/LXGWWenKai-Regular.ttf`,
  'LXGWWenKai-Medium.ttf': `${FONT_BASE}/fonts/TTF/LXGWWenKai-Medium.ttf`,
  'OFL.txt': `${FONT_BASE}/OFL.txt`
} as const;
```

Run the script twice and use `shasum -a 256` plus `cmp` to prove byte-for-byte stability. Keep `OFL.txt` beside the font files.

- [ ] **Step 4: Merge SVG transformation into the existing monorepo Metro config**

Preserve `watchFolders` and `nodeModulesPaths`, then add:

```js
const { assetExts, sourceExts } = config.resolver;
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer/expo');
config.resolver.assetExts = assetExts.filter((extension) => extension !== 'svg');
config.resolver.sourceExts = [...sourceExts, 'svg'];
```

Declare SVG imports as `React.FC<SvgProps>` and register the existing sound-on/off SVGs in `theme/assets.ts`. Register every PNG in one asset map so screens do not repeat `require(...)`.

- [ ] **Step 5: Port measured tokens from the Web CSS**

Add named tokens for the baseline 390-wide geometry: screen gutter 24; compact gutter 18; grid gap 15/12; touch target 44; header icon target 52; method card height 178/162, radius 32/28, padding 28-22-22; before card height 112 and radius 25; nav 170x42 and radius 24; exact Web shadows; header 32, intro 26, card title 20, card meta 14, before-card 21/15, and nav 15. Screens may consume these names but must not redefine near-match numbers.

Also name the custom-only gradient colors `#f0f2ff`, `#f2f4ff`, `#e8fbfa`, and `#f7f8fa` plus locations `0`, `0.13`, `0.58`, and `1`, because the final custom CSS override differs from the shared focus background.

- [ ] **Step 6: Load both fonts before mounting routed content**

Wrap the routed navigator in `PrototypeFontBoundary`. Map Medium to display/card copy, Regular to descriptive copy, and leave email, password, and timer digits on the platform font.

- [ ] **Step 7: Verify fonts, SVGs, and Metro resolution**

```bash
npm --prefix apps/mobile run test:unit -- src/theme/tokens.test.ts
npm --prefix apps/mobile run test:native -- PrototypeFontBoundary
npm --prefix apps/mobile run typecheck
cd apps/mobile && npx expo export --platform android --output-dir /tmp/easy-meditation-font-smoke
```

Expected: tests/typecheck PASS and Expo export resolves both TTF files and both SVG components.

- [ ] **Step 8: Commit the visual assets and token foundation**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/assets/fonts apps/mobile/metro.config.js apps/mobile/scripts/fetch-lxgw-wenkai.mjs apps/mobile/src/theme apps/mobile/src/types package-lock.json
git commit -m "feat(mobile): add prototype visual tokens fonts and assets"
```

---

## Task 3: Build The Shared Prototype UI Primitives

**Files:**

- Create: `apps/mobile/src/components/AppText.tsx`
- Create: `apps/mobile/src/components/PrototypeScreen.tsx`
- Create: `apps/mobile/src/components/PrototypeHeader.tsx`
- Create: `apps/mobile/src/components/PrototypeIconButton.tsx`
- Create: `apps/mobile/src/components/PrototypeButton.tsx`
- Create: `apps/mobile/src/components/InlineState.tsx`
- Create: `apps/mobile/src/components/PrototypePrimitives.native.test.tsx`

**Interfaces:**

```ts
export type AppTextVariant =
  | 'displayHero'
  | 'displayTitle'
  | 'displaySection'
  | 'cardTitle'
  | 'body'
  | 'label'
  | 'meta'
  | 'timer';

export type PrototypeScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  keyboardAvoiding?: boolean;
  backgroundVariant?: 'practice' | 'records' | 'guide' | 'focus' | 'custom' | 'auth';
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export type InlineStateProps = {
  kind: 'loading' | 'empty' | 'warning' | 'error';
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};
```

- [ ] **Step 1: Write component tests for fonts, scaling, targets, and states**

Cover display/body/system-family selection, `maxFontSizeMultiplier={1.2}`, scrollable and fixed screens, keyboard avoidance, 44-point targets, icon roles/names, button loading/disabled behavior, retry callbacks, and equal-width header side slots.

- [ ] **Step 2: Run the primitive tests and verify RED**

```bash
npm --prefix apps/mobile run test:native -- PrototypePrimitives
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement `AppText` and shared action primitives**

`AppText` accepts `variant`, `tone`, and `systemFont`; it never disables font scaling. `PrototypeIconButton` uses a 44x44 minimum box and default `hitSlop={8}`. `PrototypeButton` exposes only `primary` and `quiet` variants and sets accessibility busy/disabled while loading.

- [ ] **Step 4: Implement `PrototypeScreen` as the one layout owner**

Use `LinearGradient`, safe-area insets, optional `ScrollView`, optional `KeyboardAvoidingView`, centered `maxWidth: 420`, 24-point gutter above 380 width and 18-point gutter at or below 380. `practice` and `auth` use colors `[top, top, mid, bottom]` at locations `[0, 0.2, 0.56, 1]`; `records` and `guide` use `[top, mid, bottom]` at `[0, 0.56, 1]`; `focus` uses `[top, mid, bottom]` at `[0, 0.58, 1]`; `custom` uses the final four-color override `['#f0f2ff', '#f2f4ff', '#e8fbfa', '#f7f8fa']` at `[0, 0.13, 0.58, 1]`.

Add an absolute `react-native-svg` radial halo behind content for `guide`, centered at 50%/16%, white alpha 0.56 through 144 logical pixels and transparent by 320; and for `focus`, centered at 50%/34%, white alpha 0.68 through 144 and transparent by 304. Do not render a custom halo: the last `.custom-screen` rule at `src/styles.css:2017` overrides the earlier shared focus/custom declaration with the pure four-stop linear gradient.

- [ ] **Step 5: Implement the shared header and inline states**

The header always renders equal 52-point side slots, the exact source back asset, and a visually centered title. `InlineState` handles initial loading, local empty, quiet cached warning, and blocking retry without modal alerts.

- [ ] **Step 6: Run native tests and typecheck**

```bash
npm --prefix apps/mobile run test:native -- PrototypePrimitives
npm --prefix apps/mobile run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the shared primitives**

```bash
git add apps/mobile/src/components/AppText.tsx apps/mobile/src/components/PrototypeScreen.tsx apps/mobile/src/components/PrototypeHeader.tsx apps/mobile/src/components/PrototypeIconButton.tsx apps/mobile/src/components/PrototypeButton.tsx apps/mobile/src/components/InlineState.tsx apps/mobile/src/components/PrototypePrimitives.native.test.tsx
git commit -m "feat(mobile): add shared prototype UI primitives"
```

---

## Task 4: Add The Method Presentation Adapter And Custom Rhythm Domain

**Files:**

- Create: `apps/mobile/src/domain/customRhythm.ts`
- Create: `apps/mobile/src/domain/customRhythm.test.ts`
- Create: `apps/mobile/src/domain/methodPresentation.ts`
- Create: `apps/mobile/src/domain/methodPresentation.test.ts`
- Modify: `apps/mobile/src/api/sessions.ts`
- Modify: `apps/mobile/src/api/sessions.test.ts`

**Interfaces:**

```ts
export type BuiltInMethodId = 'box' | 'four-seven-eight' | 'coherent';
export type CustomDurationMinutes = 2 | 3 | 5 | 10;

export type CustomRhythm = {
  name: '自定义';
  inhaleSeconds: number;
  holdSeconds: number;
  exhaleSeconds: number;
  durationMinutes: CustomDurationMinutes;
};

export function redistributeCycleSeconds(
  rhythm: Pick<CustomRhythm, 'inhaleSeconds' | 'holdSeconds' | 'exhaleSeconds'>,
  targetSeconds: number
): Pick<CustomRhythm, 'inhaleSeconds' | 'holdSeconds' | 'exhaleSeconds'>;

export function toCustomBreathingMethod(rhythm: CustomRhythm): BreathingMethod;

export type MethodPresentationSlot = {
  id: BuiltInMethodId | 'custom';
  kind: 'built_in' | 'custom';
  order: 1 | 2 | 3 | 4;
  title: string;
  rhythmLabel: string;
  purpose: string;
  artKey: 'petalBox' | 'petalSleep' | 'petalFocus';
  availability: 'available' | 'unavailable' | 'local';
  method: BreathingMethod | null;
};
```

- [ ] **Step 1: Write failing adapter and redistribution tests**

Test shuffled API data, missing mapped methods, unknown extras, exact copy/art/order, coherent display label versus authoritative API phases, custom defaults, and these distribution results:

```ts
expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, 3)).toEqual({
  inhaleSeconds: 1,
  holdSeconds: 1,
  exhaleSeconds: 1
});
expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, 14)).toEqual({
  inhaleSeconds: 5,
  holdSeconds: 3,
  exhaleSeconds: 6
});
expect(redistributeCycleSeconds(DEFAULT_CUSTOM_RHYTHM, 36)).toEqual({
  inhaleSeconds: 12,
  holdSeconds: 12,
  exhaleSeconds: 12
});
```

- [ ] **Step 2: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/customRhythm.test.ts src/domain/methodPresentation.test.ts src/api/sessions.test.ts
```

Expected: FAIL because the new domain modules and display-title snapshot behavior are absent.

- [ ] **Step 3: Port the Web redistribution algorithm exactly**

Clamp phases to 1-12 and the aggregate to 3-36; proportionally scale current values; round/clamp; then distribute the remaining difference by largest fractional score with inhale, hold, exhale as the tie order. Keep all three phases present.

Use this complete implementation:

```ts
const CUSTOM_PHASE_KEYS = [
  'inhaleSeconds',
  'holdSeconds',
  'exhaleSeconds'
] as const;

function clampPhaseSeconds(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(12, Math.round(value)));
}

export function redistributeCycleSeconds(
  rhythm: Pick<CustomRhythm, (typeof CUSTOM_PHASE_KEYS)[number]>,
  targetSeconds: number
): Pick<CustomRhythm, (typeof CUSTOM_PHASE_KEYS)[number]> {
  const target = Math.max(3, Math.min(36, Math.round(targetSeconds)));
  const normalized = CUSTOM_PHASE_KEYS.map((key) => clampPhaseSeconds(rhythm[key]));
  const currentTotal = normalized.reduce((sum, value) => sum + value, 0);
  const rawValues = normalized.map((value) => (value * target) / currentTotal);
  const nextValues = rawValues.map(clampPhaseSeconds);
  let difference = target - nextValues.reduce((sum, value) => sum + value, 0);

  while (difference !== 0) {
    const direction = difference > 0 ? 1 : -1;
    const candidate = nextValues
      .map((value, index) => ({
        index,
        value,
        score: direction > 0 ? rawValues[index]! - value : value - rawValues[index]!
      }))
      .filter(({ value }) => (direction > 0 ? value < 12 : value > 1))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0];
    if (!candidate) break;
    nextValues[candidate.index] = nextValues[candidate.index]! + direction;
    difference -= direction;
  }

  return {
    inhaleSeconds: nextValues[0]!,
    holdSeconds: nextValues[1]!,
    exhaleSeconds: nextValues[2]!
  };
}
```

`toCustomBreathingMethod` emits `吸气`, `屏息`, and `呼气` phase labels in that order, uses the local seconds verbatim, and sets default duration from `durationMinutes * 60`.

Implement the complete shared contract, not a partial cast:

```ts
export function toCustomBreathingMethod(rhythm: CustomRhythm): BreathingMethod {
  return {
    id: 'custom',
    slug: 'custom',
    title: '自定义',
    subtitle: `吸气 ${rhythm.inhaleSeconds} 秒 · 屏息 ${rhythm.holdSeconds} 秒 · 呼气 ${rhythm.exhaleSeconds} 秒`,
    category: 'system',
    defaultDurationSeconds: rhythm.durationMinutes * 60,
    phases: [
      { kind: 'inhale', label: '吸气', durationSeconds: rhythm.inhaleSeconds },
      { kind: 'hold', label: '屏息', durationSeconds: rhythm.holdSeconds },
      { kind: 'exhale', label: '呼气', durationSeconds: rhythm.exhaleSeconds }
    ],
    sortOrder: 40,
    isActive: true
  };
}
```

- [ ] **Step 4: Implement the four fixed presentation slots**

Use exactly:

| ID | Title | Rhythm | Purpose | Art | Order |
| --- | --- | --- | --- | --- | --- |
| `box` | `盒式呼吸法` | `4-4-4-4` | `放松` | `petalBox` | 1 |
| `four-seven-eight` | `长呼气` | `4-7-8` | `睡眠` | `petalSleep` | 2 |
| `coherent` | `等量呼吸法` | `5-0-5` | `专注` | `petalFocus` | 3 |
| `custom` | `自定义` | current three values | empty | `petalBox` | 4 |

Missing mapped API data produces a same-position unavailable slot; unknown extra methods are ignored. Preserve the original API method object for execution.

Build the fixed slots from a literal table rather than API order:

```ts
const BUILT_IN_PRESENTATION = [
  { id: 'box', order: 1, title: '盒式呼吸法', rhythmLabel: '4-4-4-4', purpose: '放松', artKey: 'petalBox' },
  { id: 'four-seven-eight', order: 2, title: '长呼气', rhythmLabel: '4-7-8', purpose: '睡眠', artKey: 'petalSleep' },
  { id: 'coherent', order: 3, title: '等量呼吸法', rhythmLabel: '5-0-5', purpose: '专注', artKey: 'petalFocus' }
] as const;

export function buildMethodPresentationSlots(
  apiMethods: readonly BreathingMethod[],
  custom: CustomRhythm
): MethodPresentationSlot[] {
  const byId = new Map(apiMethods.map((method) => [method.id, method]));
  const builtIns: MethodPresentationSlot[] = BUILT_IN_PRESENTATION.map((item) => {
    const method = byId.get(item.id) ?? null;
    return {
      ...item,
      kind: 'built_in' as const,
      availability: method ? ('available' as const) : ('unavailable' as const),
      method
    };
  });
  return [
    ...builtIns,
    {
      id: 'custom',
      kind: 'custom' as const,
      order: 4,
      title: '自定义',
      rhythmLabel: `${custom.inhaleSeconds}-${custom.holdSeconds}-${custom.exhaleSeconds}`,
      purpose: '',
      artKey: 'petalBox',
      availability: 'local' as const,
      method: toCustomBreathingMethod(custom)
    }
  ];
}
```

- [ ] **Step 5: Snapshot the display title for new built-in records**

Change `buildCompletedPracticeSessionInput` so mapped built-ins use `getMethodDisplayTitle(method.id) ?? method.title`. Test that `box` saves `盒式呼吸法` and an unknown ID retains the API title.

- [ ] **Step 6: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/customRhythm.test.ts src/domain/methodPresentation.test.ts src/api/sessions.test.ts
npm --prefix apps/mobile run typecheck
git add apps/mobile/src/domain/customRhythm.ts apps/mobile/src/domain/customRhythm.test.ts apps/mobile/src/domain/methodPresentation.ts apps/mobile/src/domain/methodPresentation.test.ts apps/mobile/src/api/sessions.ts apps/mobile/src/api/sessions.test.ts
git commit -m "feat(mobile): add method presentation adapter"
```

---

## Task 5: Create The Awaitable User-Scoped Preference And Ledger Store

**Files:**

- Create: `apps/mobile/src/domain/sessionLedger.ts`
- Create: `apps/mobile/src/store/preferencesSchema.ts`
- Create: `apps/mobile/src/store/preferencesStore.ts`
- Create: `apps/mobile/src/store/preferencesStore.test.ts`
- Create: `apps/mobile/src/store/PreferencesStoreProvider.tsx`
- Create: `apps/mobile/src/store/PreferencesStoreProvider.native.test.tsx`

**Interfaces:**

```ts
export type LocalSessionLedgerEntry =
  | (PracticeSessionCreateInput & {
      origin: 'custom';
      state: 'local-only';
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'pending' | 'retry-paused';
      attemptCount: number;
      nextAttemptAt: string | null;
      lastErrorCode: string | null;
    })
  | (PracticeSessionCreateInput & {
      origin: 'built_in';
      state: 'failed-terminal';
      lastErrorCode: string;
    });

export function preferencesStorageKey(
  userId: string
): `easyMeditation.preferences.${string}`;

export function createUserPreferencesStore(
  userId: string,
  storage?: StateStorage
): UserPreferencesStore;

export async function hydrateUserPreferencesStore(
  store: UserPreferencesStore
): Promise<void>;
```

All persistent mutation actions return `Promise<void>`, including `setCustomPhase`, `setCustomCycleSeconds`, `setCustomDuration`, `setDurationOverride`, `setSoundEnabled`, `dismissBeforeStart`, `putLedgerEntry`, `updateLedgerEntry`, and `removeLedgerEntry`.

- [ ] **Step 1: Write the schema and isolation tests first**

Cover exact defaults; A/B distinct keys; no global-key read; immediate phase/duration/sound/dismiss persistence; rejection of `durationOverrides.custom`; ledger dedupe by `clientSessionId`; corrupt-one-slice recovery; filtering only invalid ledger rows; AsyncStorage read rejection; and a write that rejects once then succeeds on explicit retry.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/store/preferencesStore.test.ts
npm --prefix apps/mobile run test:native -- PreferencesStoreProvider
```

Expected: FAIL because no scoped store exists.

- [ ] **Step 3: Define the persisted schema and defaults**

Persist exactly:

```ts
export const DEFAULT_PREFERENCES = {
  customRhythm: {
    name: '自定义',
    inhaleSeconds: 4,
    holdSeconds: 2,
    exhaleSeconds: 5,
    durationMinutes: 5
  },
  durationOverrides: {},
  soundEnabled: true,
  beforeStartDismissed: false,
  localSessionLedger: []
} as const;
```

Use a Zod discriminated union for ledger state. Refine origin against `methodType`: custom/local-only has `methodType:'custom'`, `methodId:null`, `customRhythmId:null`; every built-in ledger state has `methodType:'built_in'`, a non-null `methodId`, and `customRhythmId:null`.

- [ ] **Step 4: Sanitize hydration slice by slice**

Validate custom rhythm, overrides, each boolean, and each ledger row independently. Reset only an invalid slice and retain other valid slices. Do not spread unvalidated persisted data over defaults.

- [ ] **Step 5: Add an awaitable persistence write barrier**

Wrap Zustand persist storage with a serialized promise queue. Each persistent action performs `set`, then awaits the write captured for that mutation. Recover the queue with `.catch(() => undefined)` before enqueueing the next write so a disk error does not poison all future retries. `putLedgerEntry` must trigger a fresh storage write even when retrying the same in-memory entry.

The barrier itself has this concrete behavior:

```ts
function createAwaitableStateStorage(base: StateStorage) {
  let tail: Promise<void> = Promise.resolve();
  let latest: Promise<void> = tail;

  const storage: StateStorage = {
    getItem: (name) => base.getItem(name),
    setItem(name, value) {
      latest = tail
        .catch(() => undefined)
        .then(() => base.setItem(name, value))
        .then(() => undefined);
      tail = latest;
      return latest;
    },
    removeItem(name) {
      latest = tail
        .catch(() => undefined)
        .then(() => base.removeItem(name))
        .then(() => undefined);
      tail = latest;
      return latest;
    }
  };

  return { storage, flush: () => latest };
}
```

Every action follows `set(nextState); await barrier.flush();`. On a persistence retry, clone/replace the matching ledger row before `set` so Zustand persist performs another write even if its logical payload is unchanged.

- [ ] **Step 6: Implement the dynamic provider**

Create one vanilla store per authenticated user, use `skipHydration:true`, await `persist.rehydrate()`, and verify `hasHydrated()`. The provider accepts only an already hydrated store; `usePreferencesStore(selector)` throws outside it. Dropping the provider unloads the old account store reference.

- [ ] **Step 7: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/store/preferencesStore.test.ts
npm --prefix apps/mobile run test:native -- PreferencesStoreProvider
npm --prefix apps/mobile run typecheck
git add apps/mobile/src/domain/sessionLedger.ts apps/mobile/src/store/preferencesSchema.ts apps/mobile/src/store/preferencesStore.ts apps/mobile/src/store/preferencesStore.test.ts apps/mobile/src/store/PreferencesStoreProvider.tsx apps/mobile/src/store/PreferencesStoreProvider.native.test.tsx
git commit -m "feat(mobile): persist user-scoped preferences"
```

---

## Task 6: Add The Authenticated Bootstrap And Account-Isolation Boundary

**Files:**

- Create: `apps/mobile/src/query/client.ts`
- Create: `apps/mobile/src/query/keys.ts`
- Create: `apps/mobile/src/auth/activeUserScope.ts`
- Create: `apps/mobile/src/auth/activeUserScope.test.ts`
- Create: `apps/mobile/src/auth/sessionScope.ts`
- Create: `apps/mobile/src/auth/sessionScope.test.ts`
- Create: `apps/mobile/src/auth/AuthSessionBoundary.tsx`
- Create: `apps/mobile/src/auth/AuthSessionBoundary.native.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/src/store/authStore.ts`
- Modify: `apps/mobile/src/store/authStore.test.ts`
- Modify: `apps/mobile/src/api/auth.ts`
- Modify: `apps/mobile/src/api/client.ts`
- Modify: `apps/mobile/src/api/client.test.ts`
- Modify: `apps/mobile/app/(tabs)/records.tsx`
- Modify: `apps/mobile/app/session/[methodId].tsx`

**Interfaces:**

```ts
export const publicQueryKeys = {
  methods: ['breathing-methods'] as const
};

export const authQueryKeys = {
  me: (revision: number) => ['auth-session', revision, 'me'] as const
};

export const userQueryKeys = {
  all: (userId: string) => ['user', userId] as const,
  stats: (userId: string) => ['user', userId, 'stats-summary'] as const,
  sessions: (userId: string, limit = 50) =>
    ['user', userId, 'practice-sessions', { limit }] as const
};

export type AuthSessionContextValue = {
  user: Me;
  userId: string;
  preferencesStore: UserPreferencesStore;
};

export async function retireUserScope(
  queryClient: QueryClient,
  userId: string
): Promise<void>;

export type ActiveUserScopeCoordinator = {
  getUserId(): string | null;
  activate(userId: string): Promise<void>;
  retire(): Promise<void>;
};

export function createActiveUserScopeCoordinator(
  queryClient: QueryClient
): ActiveUserScopeCoordinator;

export const activeUserScopeCoordinator: ActiveUserScopeCoordinator;

export type AuthTerminationState = {
  isTerminating: boolean;
  clearAuthenticatedSession(): Promise<void>;
  requestTerminalSessionClear(): void;
};
```

Use this serialization shape so overlapping logout/account-switch calls cannot race:

```ts
export function createActiveUserScopeCoordinator(
  queryClient: QueryClient
): ActiveUserScopeCoordinator {
  let activeUserId: string | null = null;
  let tail: Promise<void> = Promise.resolve();

  function enqueue(operation: () => Promise<void>): Promise<void> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }

  async function retireCurrent(): Promise<void> {
    if (!activeUserId) return;
    const retiringUserId = activeUserId;
    await retireUserScope(queryClient, retiringUserId);
    if (activeUserId === retiringUserId) activeUserId = null;
  }

  return {
    getUserId: () => activeUserId,
    activate: (userId) =>
      enqueue(async () => {
        if (activeUserId === userId) return;
        await retireCurrent();
        activeUserId = userId;
      }),
    retire: () => enqueue(retireCurrent)
  };
}
```

- [ ] **Step 1: Write session retirement and boundary timing tests**

Unit-test cancel-before-remove, removal limited to `['user', A]`, survival of public method cache, and the root-lived coordinator retaining A's ID even when protected route children unmount. Native tests use deferred `/me` and hydration promises to prove children are absent before each stage; logout does not clear tokens or render auth routes until A retirement resolves; A logout then B pending/offline/refetch failure never renders A data; and B mounts only after A cleanup and B hydration.

- [ ] **Step 2: Write terminal-401 and auth-generation tests**

Test that login, registration, successful cold restore, logout, and terminal clear increment an in-memory `sessionRevision`; refresh-token rotation does not. Test terminal 401 with no refresh token and a second 401 after refresh both gate protected content synchronously, let the failing query settle, retire A, and then clear auth without deadlocking on `cancelQueries`.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/auth/activeUserScope.test.ts src/auth/sessionScope.test.ts src/store/authStore.test.ts src/api/client.test.ts
npm --prefix apps/mobile run test:native -- AuthSessionBoundary
```

Expected: FAIL because query keys, revision, and boundary are not implemented.

- [ ] **Step 4: Centralize query keys and create the app QueryClient**

Keep `/me` on a revision-specific bootstrap key because user ID is not known yet. All stats/session consumers use user keys. Public methods stay global. Disable accidental previous/placeholder data for `/me`.

`query/client.ts` exports one `appQueryClient` and one `activeUserScopeCoordinator` created for it. The coordinator is a non-React root-lifetime service, so it survives redirects and boundary unmounts; it owns the currently active user ID and serializes activate/retire operations.

- [ ] **Step 5: Implement the gated bootstrap sequence**

The boundary runs `/me`, validates with `meSchema`, closes its child gate, awaits `activeUserScopeCoordinator.activate(userId)` (which first retires a different old ID), creates the new per-user store, awaits hydration, and only then mounts providers and children. `/me` or hydration failure shows `InlineState` with retry. Never mount protected screen content while a new account is unresolved.

- [ ] **Step 6: Handle logout, account change, and terminal authentication failure**

On every old-scope retirement, the coordinator awaits:

```ts
await queryClient.cancelQueries({ queryKey: userQueryKeys.all(oldUserId) });
queryClient.removeQueries({ queryKey: userQueryKeys.all(oldUserId) });
```

Then it clears its active ID. `authStore.logout()` performs best-effort server revocation, awaits coordinator retirement, removes SecureStore state, and only then clears tokens/session revision. A dedicated async `clearAuthenticatedSession()` action follows the same order for invalid refresh outside a user query.

For a final 401 raised inside a user-keyed query, do not await `cancelQueries` from that same query. The API client calls `requestTerminalSessionClear()`, which synchronously sets `isTerminating:true` so the root boundary hides protected content, schedules `setTimeout(() => void clearAuthenticatedSession(), 0)`, and immediately throws the 401. The query settles before the macrotask attempts scope cancellation/removal, avoiding self-deadlock. After cleanup, clear tokens, increment revision, and reset `isTerminating`. The API client must never mutate auth state with `setState` directly. The boundary unmount drops the old preferences-store reference. Do not call `queryClient.clear()` because built-in methods are public; the ledger remains persisted for the next authenticated mount.

- [ ] **Step 7: Keep transient cold-start failure retryable**

An invalid refresh token becomes unauthenticated. A transient refresh/network error retains the saved refresh token and exposes a retry bootstrap state instead of silently deleting the account session.

- [ ] **Step 8: Migrate current authenticated consumers**

Change records stats and session invalidation to `userQueryKeys`. Keep methods on `publicQueryKeys.methods`. Later screen rewrites must preserve these keys.

- [ ] **Step 9: Verify A-to-B isolation and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/auth/activeUserScope.test.ts src/auth/sessionScope.test.ts src/store/authStore.test.ts src/api/client.test.ts
npm --prefix apps/mobile run test:native -- AuthSessionBoundary
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
git add apps/mobile/app/_layout.tsx 'apps/mobile/app/(tabs)/records.tsx' 'apps/mobile/app/session/[methodId].tsx' apps/mobile/src/query apps/mobile/src/auth apps/mobile/src/store/authStore.ts apps/mobile/src/store/authStore.test.ts apps/mobile/src/api/auth.ts apps/mobile/src/api/client.ts apps/mobile/src/api/client.test.ts
git commit -m "feat(mobile): isolate authenticated user sessions"
```

---

## Task 7: Rebuild The Practice Home And Install The Prototype Pill Navigation

**Files:**

- Create: `apps/mobile/src/components/ModeCard.tsx`
- Create: `apps/mobile/src/components/DurationPopover.tsx`
- Create: `apps/mobile/src/components/BeforeStartCard.tsx`
- Create: `apps/mobile/src/components/BottomPillNav.tsx`
- Create: `apps/mobile/src/components/PracticeComponents.native.test.tsx`
- Create: `apps/mobile/src/test/screens/practice.native.test.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`
- Rewrite: `apps/mobile/app/(tabs)/practice.tsx`

**Interfaces:**

```ts
export type ModeCardViewModel = MethodPresentationSlot & {
  backgroundColor: string;
  durationMinutes: number;
  durationPopoverOpen: boolean;
};

export type DurationPopoverProps = {
  methodTitle: string;
  value: number;
  onChange(minutes: number): Promise<void>;
  onRequestClose(): void;
};

export type BeforeStartCardProps = {
  onOpenGuide(): void;
  onDismiss(): Promise<void>;
};
```

`BottomPillNav` consumes React Navigation `BottomTabBarProps`, emits standard `tabPress` events, and renders exactly two text labels: `冥想` and `记录`.

- [ ] **Step 1: Write component interaction tests first**

Test duration normalization `0 → 1`, `61 → 60`, and `17.6 → 18`; duration and gear presses do not bubble into session navigation; disabled slots do nothing; dismiss and guide callbacks fire; and all three custom entry points open the custom editor.

- [ ] **Step 2: Write screen behavior tests first**

Cover:

```ts
expect(router.push).toHaveBeenCalledWith({
  pathname: '/session/[methodId]',
  params: { methodId: 'box' }
});
```

Also test that custom card/duration/gear route to `/custom-rhythm`, info/before card route to `/guide`, dismiss persists, initial failure shows retry, refresh failure with cached methods keeps the full grid plus a quiet warning, a successful response missing any fixed ID keeps its disabled slot and shows a retryable quiet warning, and the tab bar activates exactly one pill.

- [ ] **Step 3: Run the new native tests and verify RED**

```bash
npm --prefix apps/mobile run test:native -- PracticeComponents practice
```

Expected: FAIL because the prototype components and layout are absent.

- [ ] **Step 4: Implement the anchored built-in duration editor**

Only built-in duration labels open `DurationPopover`. Clamp and round to integer 1-60, call `setDurationOverride`, and close on confirm/outside press. Custom card, its duration label, and its gear all route to the editor and never write `durationOverrides.custom`.

- [ ] **Step 5: Compose the fixed four-slot practice grid**

Use `buildMethodPresentationSlots`, then attach API default/override minutes for built-ins and `customRhythm.durationMinutes` for custom. Missing API methods retain their position as visibly disabled cards. Keep a cached grid during background refresh failure; initial total failure renders a centered retry state.

The visible copy is exact: header `呼吸训练`; intro `选择要进行的呼吸训练。`; before card title `在您开始前`; before card body `了解每项呼吸训练的工作原理并获取帮助您练习的提示。`. A missing fixed method also shows one quiet refresh warning without changing the 2x2 composition.

Render inside `PrototypeScreen backgroundVariant="practice"`.

- [ ] **Step 6: Replace the native tab bar with `BottomPillNav`**

Remove Ionicons and the full-width bottom bar. Keep Expo Router as the only route-state owner; the custom bar dispatches navigation events rather than maintaining its own active state.

- [ ] **Step 7: Match the Web geometry at both mobile breakpoints**

At 390x844: 24 gutter; 50 header height; title 32; intro top margin 46 and size 26; two columns, 15 gap; cards 178 high, radius 32, padding 28/22/22; title 20 and metadata 14; before card 112 high, radius 25, dandelion 82; nav 170x42, radius 24, active `#a8e8e0`, teal 108x5 underline. At 360-380 use 18 gutter, 12 gap, 162 card height, and radius 28. Port each flower's exact CSS position, rotation, size, and opacity.

- [ ] **Step 8: Verify and commit**

```bash
npm --prefix apps/mobile run test:native -- PracticeComponents practice
npm --prefix apps/mobile run typecheck
git add 'apps/mobile/app/(tabs)/_layout.tsx' 'apps/mobile/app/(tabs)/practice.tsx' apps/mobile/src/components/ModeCard.tsx apps/mobile/src/components/DurationPopover.tsx apps/mobile/src/components/BeforeStartCard.tsx apps/mobile/src/components/BottomPillNav.tsx apps/mobile/src/components/PracticeComponents.native.test.tsx apps/mobile/src/test/screens/practice.native.test.tsx
git commit -m "feat(mobile): rebuild practice home and pill navigation"
```

---

## Task 8: Add The Guide And Custom Rhythm Routes

**Files:**

- Create: `apps/mobile/app/guide.tsx`
- Create: `apps/mobile/app/custom-rhythm.tsx`
- Create: `apps/mobile/src/components/ScrollWheelPicker.tsx`
- Create: `apps/mobile/src/components/ScrollWheelPicker.native.test.tsx`
- Create: `apps/mobile/src/test/screens/guide.native.test.tsx`
- Create: `apps/mobile/src/test/screens/custom-rhythm.native.test.tsx`

**Interfaces:**

```ts
export type ScrollWheelPickerProps = {
  values: readonly number[];
  value: number;
  onValueChange(value: number): Promise<void>;
  accessibilityLabel: string;
  unit?: string;
  variant: 'phase' | 'inline';
  testID?: string;
};
```

- [ ] **Step 1: Write the guide copy/order and navigation tests**

Assert the header title `练习指南` and this exact sequence: `开始前读一小段就好`; `呼吸训练让注意力有一个温柔的落点。`; the `它为什么有用` panel; then `盒式呼吸法`, `长呼气`, `等量呼吸法`, `自定义`. Test history back and fallback replacement to `/(tabs)/practice` when no back entry exists.

The panel body is `有节奏地吸气、停留和呼气，会让身体从紧绷里慢慢退出来。你不需要“清空大脑”，只要一次次回到下一次呼吸。`. The four descriptions are `适合紧张或思绪很多的时候，用均匀节奏稳定自己。`, `呼气更长，适合睡前或需要慢慢降速的时刻。`, `吸气和呼气等长，适合工作间隙重新找回专注。`, and `按自己的舒适区调整节奏；任何不舒服都可以缩短停留。`. The test asserts the full strings, not only headings.

- [ ] **Step 2: Write wheel interaction and custom-screen tests**

Test initial values `4 / 2 / 5 / 11秒 / 5分钟`; snap-to-nearest; accessibility increment/decrement and boundaries; immediate store action calls; redistribution `11 → 14` becomes `5/3/6`; back does not roll back; no save button exists; and `开始呼吸` pushes:

```ts
router.push({
  pathname: '/session/[methodId]',
  params: { methodId: 'custom' }
});
```

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:native -- ScrollWheelPicker guide custom-rhythm
```

Expected: FAIL because both routes and the wheel are absent.

- [ ] **Step 4: Implement the accessible native wheel**

Use a fixed-item-height `FlatList`, `snapToInterval`, `getItemLayout`, `initialScrollIndex`, and `onMomentumScrollEnd`. Set `accessibilityRole="adjustable"` and implement increment/decrement actions. Commit only values from the supplied array.

- [ ] **Step 5: Implement the custom rhythm editor**

Use phase arrays `1..12`, aggregate array `3..36`, and duration `[2,3,5,10]`. Every valid wheel commit awaits its preference action; there is no save action. The new primary start button is the sole approved layout extension below the source picker panel.

Keep the source labels exact: title `设置呼吸方式`, aggregate `每个周期的时间`, phase columns `吸气 / 保持 / 呼气`, and target row `呼吸目标时间`.

- [ ] **Step 6: Implement the guide exactly from the Web source**

Use `PrototypeScreen scrollable`, the source back icon, and the Web section order/copy. Preserve the practice route and preference state on back.

Use `backgroundVariant="custom"` for the editor and `backgroundVariant="guide"` for the guide.

- [ ] **Step 7: Match the custom and guide geometry**

Custom at 390: 32/24 header padding, 46 back target with 34 asset, title 34, picker panel top 92, min-height 386, radius 30, padding 32/28/25, phase wheel height 168, normal value 36 and selected 43. Guide at 390: header 32, copy top 38, kicker 18, main heading 27, panel/list radius 28, body 17. Apply the Web `<=380` values at compact width.

- [ ] **Step 8: Verify and commit**

```bash
npm --prefix apps/mobile run test:native -- ScrollWheelPicker guide custom-rhythm
npm --prefix apps/mobile run typecheck
git add apps/mobile/app/guide.tsx apps/mobile/app/custom-rhythm.tsx apps/mobile/src/components/ScrollWheelPicker.tsx apps/mobile/src/components/ScrollWheelPicker.native.test.tsx apps/mobile/src/test/screens/guide.native.test.tsx apps/mobile/src/test/screens/custom-rhythm.native.test.tsx
git commit -m "feat(mobile): add guide and custom rhythm editor"
```

---

## Task 9: Restyle Login And Registration With Inline Field Errors

**Files:**

- Create: `apps/mobile/src/components/AuthScaffold.tsx`
- Create: `apps/mobile/src/components/AuthTextField.tsx`
- Create: `apps/mobile/src/domain/authFormErrors.ts`
- Create: `apps/mobile/src/domain/authFormErrors.test.ts`
- Create: `apps/mobile/src/components/AuthComponents.native.test.tsx`
- Create: `apps/mobile/src/test/screens/auth.native.test.tsx`
- Rewrite: `apps/mobile/app/(auth)/login.tsx`
- Rewrite: `apps/mobile/app/(auth)/register.tsx`

**Interfaces:**

```ts
export type AuthFieldName = 'email' | 'password' | 'nickname';

export type AuthFormErrors = {
  form?: string;
  fields: Partial<Record<AuthFieldName, string>>;
};

export function getAuthFormErrors(error: unknown): AuthFormErrors;
```

- [ ] **Step 1: Write form-error mapping and screen tests**

Map `ApiRequestError.fields` to field errors and every other safe message to form error. Test original login payload, trimmed optional nickname, single submit while pending, current loading copy, retained email/nickname after failure, cleared password after a failed request, success replacement to practice, and existing auth links.

- [ ] **Step 2: Write component accessibility tests**

Verify label/error association, system font in inputs, 56-point input height, keyboard return order, busy/disabled button state, and no modal alert use.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/authFormErrors.test.ts
npm --prefix apps/mobile run test:native -- AuthComponents auth
```

Expected: FAIL because the shared auth visual components do not exist.

- [ ] **Step 4: Implement the shared auth scaffold and fields**

Use the approved gradient, source dandelion, translucent white fields, LXGW for labels/descriptions, system sans for input content, and `PrototypeButton`. Keep validation, API calls, current copy, loading state, links, and success routes.

Both auth routes use `PrototypeScreen backgroundVariant="auth" keyboardAvoiding scrollable`.

- [ ] **Step 5: Render errors inline and preserve safe input state**

Show field errors immediately below their fields and form errors above the primary action. Retain email and nickname; do not retain or repopulate password after a failed request. Keyboard avoidance must keep the focused field and submit button reachable on both platforms.

- [ ] **Step 6: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/authFormErrors.test.ts
npm --prefix apps/mobile run test:native -- AuthComponents auth
npm --prefix apps/mobile run typecheck
git add 'apps/mobile/app/(auth)/login.tsx' 'apps/mobile/app/(auth)/register.tsx' apps/mobile/src/components/AuthScaffold.tsx apps/mobile/src/components/AuthTextField.tsx apps/mobile/src/components/AuthComponents.native.test.tsx apps/mobile/src/domain/authFormErrors.ts apps/mobile/src/domain/authFormErrors.test.ts apps/mobile/src/test/screens/auth.native.test.tsx
git commit -m "feat(mobile): restyle authentication screens"
```

---

## Task 10: Port The Organic Breathing Renderer To Skia

**Files:**

- Create: `apps/mobile/src/domain/breathMotion.ts`
- Create: `apps/mobile/src/domain/breathMotion.test.ts`
- Create: `apps/mobile/src/components/BreathingCanvas.tsx`
- Create: `apps/mobile/src/components/BreathingCanvas.native.test.tsx`
- Modify: `apps/mobile/jest.config.cjs`

**Interfaces:**

```ts
export type BreathVisualKind =
  | 'ready'
  | 'inhale'
  | 'hold-full'
  | 'hold-empty'
  | 'exhale'
  | 'complete';

export type BreathMotion = {
  scale: number;
  bloom: number;
  rotate: number;
  lift: number;
  orbit: number;
};

export function resolveBreathVisualKind(
  phases: BreathingPhase[],
  phaseIndex: number,
  kind: SessionSnapshot['kind']
): BreathVisualKind;

export function getBreathMotion(
  kind: BreathVisualKind,
  progress: number,
  visualTimeMs: number,
  reducedMotion?: boolean
): BreathMotion;

export type BreathingCanvasProps = {
  phases: BreathingPhase[];
  phaseIndex: number;
  phaseKind: SessionSnapshot['kind'];
  phaseProgress: number;
  phaseDurationMs: number;
  status: SessionClockSnapshot['status'];
  reducedMotion: boolean;
  fixtureVisualTimeMs?: number;
};
```

- [ ] **Step 1: Write pure motion endpoint and hold-resolution tests**

```ts
expect(getBreathMotion('inhale', 0, 0)).toMatchObject({
  scale: 0.7,
  bloom: 0.54,
  rotate: -0.13,
  lift: 12,
  orbit: 0.24
});
expect(getBreathMotion('inhale', 1, 0)).toMatchObject({
  scale: 1.08,
  bloom: 0.88,
  rotate: 0.04,
  lift: -4,
  orbit: 0.52
});
```

Test hold after exhale resolves `hold-empty`, hold after inhale resolves `hold-full`, transition mixing is deterministic, and reduced motion retains a smaller but nonzero inhale delta.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathMotion.test.ts
npm --prefix apps/mobile run test:native -- BreathingCanvas
```

Expected: FAIL because the motion port is absent.

- [ ] **Step 3: Enable the supported Skia Jest canvas mock**

Use Skia's package-provided CanvasKit test environment instead of hand-written component stubs. Add `testEnvironment: '@shopify/react-native-skia/jestEnv.js'`, put `@shopify/react-native-skia/jestSetup.js` before the local setup file in `setupFilesAfterEnv`, and add a `transformIgnorePatterns` exception for `@shopify/react-native-skia` while retaining the React Native, Expo, and React Navigation exceptions required by `jest-expo`.

- [ ] **Step 4: Port every motion and drawing constant from the Web renderer**

Use `src/ui/app.js` renderer functions as the literal reference: 640 canvas coordinate space; 42 deterministic texture particles; 260ms cross-phase transition; ready/inhale/hold-full/hold-empty/exhale/complete motion; all gradient stops, colors, blur radii, organic blob point counts, amplitudes, seeds, transforms, texture alpha, and center highlights. Do not substitute the old three-circle approximation.

Port organic geometry as a pure point generator and test its first/last points:

```ts
export function buildOrganicBlobPoints(options: {
  cx: number;
  cy: number;
  radius: number;
  points: number;
  amp: number;
  time: number;
  seed: number;
  scaleX?: number;
  scaleY?: number;
}): Array<{ x: number; y: number }> {
  return Array.from({ length: options.points }, (_, index) => {
    const angle = (index / options.points) * Math.PI * 2;
    const noise =
      Math.sin(angle * 3 + options.time + options.seed) * 0.55 +
      Math.sin(angle * 5 - options.time * 1.21 + options.seed * 1.7) * 0.32 +
      Math.sin(angle * 7 + options.time * 0.72 + options.seed * 0.8) * 0.13;
    const localRadius = options.radius * (1 + noise * options.amp);
    return {
      x: options.cx + Math.cos(angle) * localRadius * (options.scaleX ?? 1),
      y: options.cy + Math.sin(angle) * localRadius * (options.scaleY ?? 1)
    };
  });
}
```

Convert those points to a closed Skia path using the same midpoint/quadratic-curve algorithm. Render layers in strict order: blurred radial glow; 34-point halo; rotated/scaled 30-point veil; 42-point radial core plus 24-point highlight; 42 deterministic screen-blend particles; two center circles. The layer test inspects this stable order and the exact gradient-stop arrays.

- [ ] **Step 5: Keep the wall clock authoritative**

Reanimated/shared values may interpolate only Skia visual properties. The component consumes phase progress from the session clock and never derives elapsed practice time from rendered frames. Freeze visual progress while paused and loop only ready/completed ambient motion.

- [ ] **Step 6: Implement reduced motion**

Blend displacement toward the neutral midpoint at 35% amplitude and extend cross-phase transition to 520ms. Inhale/hold/exhale must remain visually distinguishable.

- [ ] **Step 7: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathMotion.test.ts
npm --prefix apps/mobile run test:native -- BreathingCanvas
npm --prefix apps/mobile run typecheck
git add apps/mobile/src/domain/breathMotion.ts apps/mobile/src/domain/breathMotion.test.ts apps/mobile/src/components/BreathingCanvas.tsx apps/mobile/src/components/BreathingCanvas.native.test.tsx apps/mobile/jest.config.cjs
git commit -m "feat(mobile): port breathing motion to Skia"
```

---

## Task 11: Generate Deterministic PCM Cues And Add Session-Local Audio Control

**Files:**

- Create: `apps/mobile/scripts/cue-waveform.mjs`
- Create: `apps/mobile/scripts/generate-session-cues.mjs`
- Create: `apps/mobile/scripts/cue-waveform.test.mjs`
- Create: `apps/mobile/assets/audio/inhale.wav`
- Create: `apps/mobile/assets/audio/hold.wav`
- Create: `apps/mobile/assets/audio/exhale.wav`
- Create: `apps/mobile/assets/audio/complete.wav`
- Create: `apps/mobile/src/audio/cuePlaybackController.ts`
- Create: `apps/mobile/src/audio/cuePlaybackController.test.ts`
- Create: `apps/mobile/src/audio/useSessionAudio.ts`
- Create: `apps/mobile/src/audio/useSessionAudio.native.test.tsx`
- Modify: `apps/mobile/package.json`

**Interfaces:**

```ts
export type SessionCueKind = 'inhale' | 'hold' | 'exhale' | 'complete';

export type CuePlayerPort = {
  seekTo(seconds: number): Promise<void>;
  play(): void;
};

export function createCuePlaybackController(
  players: Record<SessionCueKind, CuePlayerPort>
): {
  play(kind: SessionCueKind): Promise<boolean>;
};

export function useSessionAudio(options: {
  preferenceEnabled: boolean;
  setPreferenceEnabled(enabled: boolean): Promise<void>;
}): {
  enabled: boolean;
  note: string | null;
  toggle(): Promise<void>;
  play(kind: SessionCueKind): Promise<void>;
};
```

- [ ] **Step 1: Write generator reproducibility and controller tests**

The Node test regenerates every file in memory and compares it byte-for-byte with the committed asset. The controller test proves it seeks to zero before every play and converts a playback error into `false` without throwing into the session clock.

- [ ] **Step 2: Verify RED**

```bash
node --test apps/mobile/scripts/cue-waveform.test.mjs
npm --prefix apps/mobile run test:unit -- src/audio/cuePlaybackController.test.ts
npm --prefix apps/mobile run test:native -- useSessionAudio
```

Expected: FAIL because the generator, assets, controller, and native hook are absent.

- [ ] **Step 3: Implement the exact approved cue definitions**

```js
export const CUE_SHAPES = {
  inhale: { from: 392, to: 587, duration: 0.42 },
  hold: { from: 523, to: 523, duration: 0.32 },
  exhale: { from: 440, to: 294, duration: 0.5 },
  complete: { from: 440, to: 660, duration: 0.68 }
};
```

Generate mono signed 16-bit little-endian PCM at 44.1kHz. Use a sine oscillator, exponential frequency ramp, and gain `0.0001 → 0.1` over 0.04 seconds, then `0.1 → 0.0001` over the remainder.

- [ ] **Step 4: Generate and commit all four WAV files**

```bash
cd apps/mobile
node scripts/generate-session-cues.mjs
node --test scripts/cue-waveform.test.mjs
```

Expected: four reproducible RIFF/WAVE assets and a PASS. Run the generator again and use `git diff --exit-code -- assets/audio` to prove stability.

- [ ] **Step 5: Preload four Expo Audio players on focus-route mount**

Keep `cuePlaybackController.ts` free of all React Native and Expo imports so Vitest can exercise it in Node. In `useSessionAudio.ts`, create four static calls using `useAudioPlayer(require('../../assets/audio/inhale.wav'))`, and the corresponding `hold.wav`, `exhale.wav`, and `complete.wav` paths; SDK 53's hook takes the local source and an optional numeric update interval, not an options object. Mounting the four hooks loads the bundled WAV sources and releases the players on unmount. Before playback, await `seekTo(0)`, then call `play()`. Cue once per `(cycleIndex, phaseIndex, kind)` key and once for completion.

- [ ] **Step 6: Separate stored preference from session availability**

The sound button updates the per-user stored preference. A native hook test proves the toggle persists, a load/play failure disables sound only in the current hook instance, the stored preference remains unchanged after that failure, the timer-facing callback resolves, and one non-blocking note appears.

- [ ] **Step 7: Verify and commit**

Add `test:assets: "node --test scripts/cue-waveform.test.mjs"` and change the mobile `test` script to `npm run test:unit && npm run test:native && npm run test:assets`, so final workspace verification always rechecks committed WAV bytes.

```bash
node --test apps/mobile/scripts/cue-waveform.test.mjs
npm --prefix apps/mobile run test:unit -- src/audio/cuePlaybackController.test.ts
npm --prefix apps/mobile run test:native -- useSessionAudio
npm --prefix apps/mobile run typecheck
git add apps/mobile/package.json apps/mobile/scripts/cue-waveform.mjs apps/mobile/scripts/generate-session-cues.mjs apps/mobile/scripts/cue-waveform.test.mjs apps/mobile/assets/audio apps/mobile/src/audio
git commit -m "feat(mobile): add deterministic session cue audio"
```

---

## Task 12: Implement The Persisted Submission Outbox And Retry State Machine

**Files:**

- Modify: `apps/mobile/src/domain/sessionLedger.ts`
- Create: `apps/mobile/src/domain/sessionLedger.test.ts`
- Create: `apps/mobile/src/services/sessionOutbox.ts`
- Create: `apps/mobile/src/services/sessionOutbox.test.ts`
- Modify: `apps/mobile/src/store/preferencesStore.ts`
- Modify: `apps/mobile/src/store/preferencesStore.test.ts`
- Modify: `apps/mobile/src/api/client.ts`
- Modify: `apps/mobile/src/api/client.test.ts`
- Modify: `apps/mobile/src/api/sessions.ts`
- Modify: `apps/mobile/src/api/sessions.test.ts`
- Modify: `apps/mobile/src/auth/AuthSessionBoundary.tsx`

**Interfaces:**

```ts
export const RETRY_DELAYS_MS = [5_000, 30_000, 300_000, 1_800_000] as const;

export type SubmissionClassification =
  | { kind: 'retriable'; code: string; retryAfterMs?: number }
  | { kind: 'auth-required'; code: string }
  | { kind: 'terminal'; code: string };

export function classifySessionSubmissionError(
  error: unknown
): SubmissionClassification;

export function transitionAfterFailure(
  entry: Extract<LocalSessionLedgerEntry, { attemptCount: number }>,
  error: unknown,
  nowMs: number
): Extract<LocalSessionLedgerEntry, { origin: 'built_in' }>;

export function createSessionOutbox(deps: {
  getLedger(): LocalSessionLedgerEntry[];
  updateEntry(
    clientSessionId: string,
    updater: (entry: LocalSessionLedgerEntry) => LocalSessionLedgerEntry
  ): Promise<void>;
  removeEntry(clientSessionId: string): Promise<void>;
  post(input: PracticeSessionCreateInput): Promise<PracticeSession>;
  cacheAndRefreshAccepted(session: PracticeSession): Promise<void>;
  onTerminalUnauthorized(): Promise<void>;
  now(): number;
}): {
  submit(clientSessionId: string): Promise<void>;
  drainDue(options?: { resumeAuthBlocked?: boolean }): Promise<void>;
  retryNow(clientSessionId: string): Promise<void>;
};
```

- [ ] **Step 1: Write classification and transition tests first**

Cover network `TypeError`, timeout, 429 with both integer-seconds and HTTP-date `Retry-After`, 5xx, terminal 400/404/409, other non-401 4xx, and final 401. Assert failures 1-4 schedule 5s/30s/5m/30m; failure 5 becomes `retry-paused`; longer `Retry-After` wins; manual retry resets attempt zero and due-now.

- [ ] **Step 2: Write outbox ordering, dedupe, and auth tests first**

Prove an in-flight map prevents duplicate POSTs; custom/local-only never posts; a successful or idempotently returned session is cached/refetched before ledger removal; cache/refetch failure retains the ledger item; final 401 retains `pending` with `nextAttemptAt:null`, triggers auth, and resumes only after a later authenticated mount.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionLedger.test.ts src/services/sessionOutbox.test.ts src/store/preferencesStore.test.ts src/api/client.test.ts src/api/sessions.test.ts
```

Expected: FAIL because retry metadata and outbox behavior are absent.

- [ ] **Step 4: Preserve `Retry-After` in `ApiRequestError`**

Add `retryAfterMs?: number` to the constructor and parse both formats from the response header. Persist only safe codes, never response messages, headers, or bodies.

- [ ] **Step 5: Add the existing GET sessions endpoint to the mobile client**

```ts
export function fetchPracticeSessions(): Promise<PracticeSession[]> {
  return apiRequest<PracticeSession[]>('/practice-sessions');
}
```

Use the shared `practiceSessionSchema.array()` to validate the response before returning it.

- [ ] **Step 6: Implement retry classification and state transitions**

Automatic retry is limited to network/timeouts, 429, and 5xx. All non-401/non-429 4xx are terminal. After a post-refresh 401, keep the item pending and auth-blocked rather than incrementing attempts. `retryNow` is exposed only for `retry-paused`; `failed-terminal` remains visible but has no retry action.

`classifySessionSubmissionError` maps `TypeError` and errors named `AbortError` to `{kind:'retriable', code:'NETWORK_ERROR'|'TIMEOUT'}`; `ApiRequestError` 401 to `auth-required`; 429 and 500-599 to `retriable` while preserving `retryAfterMs`; every other `ApiRequestError` and unknown programming error to `terminal`. It never matches on localized error messages.

Implement the transition core explicitly:

```ts
export function transitionAfterFailure(
  entry: Extract<LocalSessionLedgerEntry, { attemptCount: number }>,
  error: unknown,
  nowMs: number
) {
  const classification = classifySessionSubmissionError(error);
  const base = {
    ...practiceSessionCreateSchema.parse(entry),
    origin: 'built_in' as const
  };
  if (classification.kind === 'terminal') {
    return {
      ...base,
      state: 'failed-terminal' as const,
      lastErrorCode: classification.code
    };
  }
  if (classification.kind === 'auth-required') {
    return {
      ...base,
      state: 'pending' as const,
      attemptCount: entry.attemptCount,
      nextAttemptAt: null,
      lastErrorCode: classification.code
    };
  }

  const attemptCount = Math.min(5, entry.attemptCount + 1);
  if (attemptCount === 5) {
    return {
      ...base,
      state: 'retry-paused' as const,
      attemptCount,
      nextAttemptAt: null,
      lastErrorCode: classification.code
    };
  }

  const baseDelay = RETRY_DELAYS_MS[attemptCount - 1] ?? RETRY_DELAYS_MS[3];
  const delay = Math.max(baseDelay, classification.retryAfterMs ?? 0);
  return {
    ...base,
    state: 'pending' as const,
    attemptCount,
    nextAttemptAt: new Date(nowMs + delay).toISOString(),
    lastErrorCode: classification.code
  };
}
```

Before POST, call `practiceSessionCreateSchema.parse(entry)` and pass that parsed value. Zod strips `origin`, `state`, and retry metadata, preventing local-only fields from leaking into the API payload.

- [ ] **Step 7: Implement cache-before-remove success handling**

Upsert the returned server session into `userQueryKeys.sessions(userId)` immediately, then await fresh sessions and stats queries. Only after those cache operations succeed may the store remove the ledger item. If the refresh fails, retain the item; the next idempotent POST safely returns the same server record and dedupe prevents double display.

The outbox execution core is:

```ts
const inFlight = new Map<string, Promise<void>>();

async function runSubmission(clientSessionId: string): Promise<void> {
  const entry = deps.getLedger().find(
    (item) =>
      item.clientSessionId === clientSessionId &&
      item.origin === 'built_in' &&
      item.state === 'pending'
  );
  if (!entry) return;

  try {
    const input = practiceSessionCreateSchema.parse(entry);
    const accepted = await deps.post(input);
    await deps.cacheAndRefreshAccepted(accepted);
    await deps.removeEntry(clientSessionId);
  } catch (error) {
    const classification = classifySessionSubmissionError(error);
    await deps.updateEntry(clientSessionId, (current) => {
      if (!('attemptCount' in current)) return current;
      return transitionAfterFailure(current, error, deps.now());
    });
    if (classification.kind === 'auth-required') {
      await deps.onTerminalUnauthorized();
    }
  }
}

function submit(clientSessionId: string): Promise<void> {
  const current = inFlight.get(clientSessionId);
  if (current) return current;
  const work = runSubmission(clientSessionId);
  inFlight.set(clientSessionId, work);
  const cleanup = () => {
    if (inFlight.get(clientSessionId) === work) inFlight.delete(clientSessionId);
  };
  void work.then(cleanup, cleanup);
  return work;
}
```

`drainDue` selects only pending rows whose `nextAttemptAt` is due; a null timestamp is selected only when `resumeAuthBlocked:true`. `retryNow` first rewrites a paused row to pending/attempt zero/due-now, awaits persistence, then calls `submit`.

- [ ] **Step 8: Drain on authenticated mount and before records derivation**

After the preferences store hydrates, call `drainDue({ resumeAuthBlocked: true })`. Records calls `drainDue()` before calculating its view model. Both calls share the same in-flight map.

- [ ] **Step 9: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionLedger.test.ts src/services/sessionOutbox.test.ts src/store/preferencesStore.test.ts src/api/client.test.ts src/api/sessions.test.ts
npm --prefix apps/mobile run typecheck
git add apps/mobile/src/domain/sessionLedger.ts apps/mobile/src/domain/sessionLedger.test.ts apps/mobile/src/services/sessionOutbox.ts apps/mobile/src/services/sessionOutbox.test.ts apps/mobile/src/store/preferencesStore.ts apps/mobile/src/store/preferencesStore.test.ts apps/mobile/src/api/client.ts apps/mobile/src/api/client.test.ts apps/mobile/src/api/sessions.ts apps/mobile/src/api/sessions.test.ts apps/mobile/src/auth/AuthSessionBoundary.tsx
git commit -m "feat(mobile): persist and retry session ledger"
```

---

## Task 13: Rebuild The Focus Session, Persistence Barrier, And Exit Guard

**Files:**

- Create: `apps/mobile/src/domain/sessionRecord.ts`
- Create: `apps/mobile/src/domain/sessionRecord.test.ts`
- Create: `apps/mobile/src/hooks/useFocusSession.ts`
- Create: `apps/mobile/src/hooks/useFocusSession.native.test.tsx`
- Create: `apps/mobile/src/hooks/useSessionExitGuard.ts`
- Create: `apps/mobile/src/hooks/useSessionExitGuard.native.test.tsx`
- Create: `apps/mobile/src/components/SessionExitDialog.tsx`
- Create: `apps/mobile/src/test/screens/session.native.test.tsx`
- Modify: `apps/mobile/src/domain/sessionClock.ts`
- Modify: `apps/mobile/src/domain/sessionClock.test.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Rewrite: `apps/mobile/app/session/[methodId].tsx`
- Delete: `apps/mobile/src/components/BreathingOrb.tsx`

**Interfaces:**

```ts
export type ResolvedSessionMethod = {
  id: BuiltInMethodId | 'custom';
  title: string;
  phases: BreathingPhase[];
  plannedDurationSeconds: number;
  origin: 'built_in' | 'custom';
};

export function buildSessionLedgerEntry(options: {
  clientSessionId: string;
  method: ResolvedSessionMethod;
  actualDurationSeconds: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}): LocalSessionLedgerEntry | null;

export type FocusSessionController = {
  snapshot: SessionClockSnapshot;
  clientSessionId: string;
  isPersisting: boolean;
  persistenceError: string | null;
  controlsUnlocked: boolean;
  start(): void;
  pause(): void;
  resume(): void;
  persistIntentionalEnd(): Promise<void>;
  retryPersistence(): Promise<void>;
  replay(): Promise<void>;
};
```

- [ ] **Step 1: Write record-construction and lifecycle tests first**

Test `<1s → null`; built-in intentional end `completed:false`; natural completion true; custom local-only with null IDs; display-title snapshot; ledger write before first POST; custom never posts; cue once per phase key; fresh UUID/clock/timestamps on replay; and wall-clock accuracy after pause/background/resume.

- [ ] **Step 2: Write every exit-guard path first**

Use deferred persistence to prove blocked navigation is not dispatched early. Cover idle direct removal; header back; Android navigation back; a `navigate('records')` tab action; `replace` and generic programmatic/deep-link actions; system exit confirmation; `继续练习`; `结束并离开`; explicit end at 0 and 1 second; completed controls locked until write; write failure staying on route; and retry success dispatching the original action. A root-layout test also inspects the registered session screen options and asserts `gestureEnabled:false` and `headerShown:false`.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionClock.test.ts src/domain/sessionRecord.test.ts
npm --prefix apps/mobile run test:native -- useFocusSession useSessionExitGuard session
```

Expected: FAIL because the controller, guard, and completed UI are absent.

- [ ] **Step 4: Resolve methods and durations from the approved owners**

Built-ins come from the public methods query and use `durationOverrides[id] ?? method.defaultDurationSeconds / 60`. Custom comes from `toCustomBreathingMethod(customRhythm)` and always uses `customRhythm.durationMinutes`. Missing methods show a direct return-to-practice state.

- [ ] **Step 5: Build one persistence-first finalization pipeline**

For practiced time below one second, return without a ledger entry. Otherwise build the entry and await `putLedgerEntry`; for built-ins, then trigger outbox submission without blocking the UI on the network. Natural completion and explicit end both use this pipeline. Any local write failure leaves controls locked and exposes retry.

The initial built-in entry is `state:'pending'`, `attemptCount:0`, `nextAttemptAt:endedAt`, and `lastErrorCode:null`. The initial custom entry is `state:'local-only'` and contains no retry metadata.

The hook keeps `entryToPersistRef` and uses one idempotent write function:

```ts
async function persistCurrentRun(completed: boolean): Promise<void> {
  if (persistedClientSessionIdRef.current === clientSessionIdRef.current) return;
  setIsPersisting(true);
  setPersistenceError(null);

  const endedAt = new Date(now()).toISOString();
  entryToPersistRef.current ??= buildSessionLedgerEntry({
    clientSessionId: clientSessionIdRef.current,
    method,
    actualDurationSeconds: clock.snapshot().elapsedSeconds,
    completed,
    startedAt: startedAtRef.current ?? endedAt,
    endedAt
  });

  try {
    const entry = entryToPersistRef.current;
    if (entry) {
      await putLedgerEntry(entry);
      if (entry.origin === 'built_in') void outbox.submit(entry.clientSessionId);
    }
    persistedClientSessionIdRef.current = clientSessionIdRef.current;
    setControlsUnlocked(true);
  } catch {
    setPersistenceError('无法在本机保存本次练习，请重试。');
    throw new Error('LOCAL_SESSION_PERSIST_FAILED');
  } finally {
    setIsPersisting(false);
  }
}
```

`retryPersistence()` calls the same function without replacing `entryToPersistRef`, so the same client ID and timestamps are retried. Replay is unavailable until `persistedClientSessionIdRef` matches the current run.

- [ ] **Step 6: Implement the wall-clock controller and replay**

Keep `createSessionClock` authoritative. Refresh snapshots on a 250ms UI interval and on `AppState` activation. Replay constructs a new clock, UUID, `startedAt`, cue key set, and persistence flags while preserving selected method, chosen duration, and current stored sound preference.

- [ ] **Step 7: Implement one route-removal guard with `usePreventRemove`**

Store `data.action`; show the prototype dialog with `继续练习` and `结束并离开`; dispatch only after awaited persistence. Explicit end creates a go-back action and enters the same pipeline. Configure the stack route:

```tsx
<Stack.Screen
  name="session/[methodId]"
  options={{
    headerShown: false,
    gestureEnabled: false,
    headerBackButtonMenuEnabled: false
  }}
/>
```

Disabling native swipe is mandatory so iOS cannot complete removal before the JavaScript write barrier.

- [ ] **Step 8: Rebuild the ready, running, paused, and completed layouts**

Use exact Web copy and hierarchy: ready `准备`, rhythm, breathing canvas, chosen minutes/title, `开始`; active phase label/count, canvas, remaining timer/title, `暂停` or `继续`, `结束训练`; completed `完成`, canvas, title, `再来一次`, and return/end action. Add the source sound SVG toggle and non-blocking audio note. Use system tabular digits for timers and polite accessibility announcements for phase/completion only.

The route uses `PrototypeScreen backgroundVariant="focus"`.

- [ ] **Step 9: Remove the old three-circle component and verify**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionClock.test.ts src/domain/sessionRecord.test.ts
npm --prefix apps/mobile run test:native -- useFocusSession useSessionExitGuard session
npm --prefix apps/mobile run typecheck
```

Expected: all lifecycle/guard tests PASS and no import of `BreathingOrb` remains.

- [ ] **Step 10: Commit the focus-session rebuild**

```bash
git add apps/mobile/app/_layout.tsx 'apps/mobile/app/session/[methodId].tsx' apps/mobile/src/domain/sessionClock.ts apps/mobile/src/domain/sessionClock.test.ts apps/mobile/src/domain/sessionRecord.ts apps/mobile/src/domain/sessionRecord.test.ts apps/mobile/src/hooks apps/mobile/src/components/SessionExitDialog.tsx apps/mobile/src/test/screens/session.native.test.tsx apps/mobile/src/components/BreathingOrb.tsx
git commit -m "feat(mobile): guard and persist focus sessions"
```

---

## Task 14: Merge Server And Ledger Records Into The Prototype Records Screen

**Files:**

- Create: `apps/mobile/src/domain/records.ts`
- Create: `apps/mobile/src/domain/records.test.ts`
- Rewrite: `apps/mobile/src/components/Heatmap.tsx`
- Create: `apps/mobile/src/components/Heatmap.native.test.tsx`
- Rewrite: `apps/mobile/app/(tabs)/records.tsx`
- Create: `apps/mobile/src/test/screens/records.native.test.tsx`

**Interfaces:**

```ts
export type HeatmapDay = {
  key: string;
  day: number;
  label: string;
  durationSeconds: number;
  minutes: number;
  sessions: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type MergedRecordsViewModel = {
  sessions: Array<PracticeSessionCreateInput & {
    id: string;
    source: 'server' | 'ledger';
    ledgerState?: LocalSessionLedgerEntry['state'];
  }>;
  totalSessions: number;
  totalPracticeSeconds: number;
  weeklyPracticeSeconds: number;
  streak: { value: number; label: string; isLowerBound: boolean };
  calendarDays: HeatmapDay[];
  recentSessions: MergedRecordsViewModel['sessions'];
  serverListTruncated: boolean;
};

export function deriveMergedRecords(options: {
  summary: StatsSummary | null;
  serverSessions: PracticeSession[];
  ledger: LocalSessionLedgerEntry[];
  now: Date;
}): MergedRecordsViewModel;
```

- [ ] **Step 1: Write pure merge, dedupe, local-day, and truncation tests**

Test server preference by `clientSessionId`; each ledger state counted once; server totals plus only ledger rows absent from the fetched list; `endedAt` local-day buckets at 00:30 and 23:30; a DST transition; 28 days; minute levels 0, >0, >=3, >=6, >=10; recent sorting; exactly 50 rows qualifier; and a current streak reaching the oldest returned day rendered with `+`.

- [ ] **Step 2: Write records-screen state tests**

Cover full loading; both server queries success; server failure with local ledger data still visible plus retry; total failure with no local data; empty copy; populated hierarchy; pending `正在同步`; paused `可重试` with manual action; terminal `记录仅保存在本机` without retry; and BottomPillNav route state.

- [ ] **Step 3: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/records.test.ts
npm --prefix apps/mobile run test:native -- Heatmap records
```

Expected: FAIL because GET sessions, merge logic, and prototype records UI are not wired.

- [ ] **Step 4: Implement pure merged record derivation**

Prefer server entries on duplicate IDs, sort by `endedAt`, and add ledger totals only when the fetched session list lacks that ID. Match the server summary's rolling window exactly for ledger increments: `endedAt >= now.getTime() - 6 * 24 * 60 * 60 * 1000` and `endedAt <= now`; device-local calendar construction applies only to heatmap/streak. Construct local days with `new Date(year, month, day - offset)`; derive both heatmap and streak from the same day map. Mark `serverListTruncated` only when server length is exactly 50.

- [ ] **Step 5: Build the 28-day practiced-minute heatmap**

Render weekday labels, day numbers, practiced-days summary, best-day footer, and the quiet `基于最近 50 条记录` qualifier when truncated. Provide an accessibility label per day containing date, duration, and session count.

- [ ] **Step 6: Compose both user-keyed server queries and local fallback**

Use `userQueryKeys.stats(userId)` and `userQueryKeys.sessions(userId)`. Drain due outbox work before deriving. If either server query fails, keep any cached server data and all ledger data, show a quiet warning, and expose retry without dropping local records.

- [ ] **Step 7: Match Web hierarchy and record states**

Render `练习记录`, `轻轻记住坚持`, accumulated duration, three stats, heat calendar, and recent rows in the exact source order. Keep empty copy `完成一次练习后会出现在这里`. Visually distinguish sync status without changing the core card hierarchy.

The route uses `PrototypeScreen backgroundVariant="records"`.

- [ ] **Step 8: Verify and commit**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/records.test.ts
npm --prefix apps/mobile run test:native -- Heatmap records
npm --prefix apps/mobile run typecheck
git add apps/mobile/src/domain/records.ts apps/mobile/src/domain/records.test.ts apps/mobile/src/components/Heatmap.tsx apps/mobile/src/components/Heatmap.native.test.tsx 'apps/mobile/app/(tabs)/records.tsx' apps/mobile/src/test/screens/records.native.test.tsx
git commit -m "feat(mobile): merge ledger records into local heatmap"
```

---

## Task 15: Add Deterministic Visual QA, Device Performance Gates, And Final Verification

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `qa/fixtures/mobile-prototype.json`
- Create: `apps/mobile/src/qa/visualQa.ts`
- Create: `apps/mobile/src/qa/visualQa.test.ts`
- Create: `apps/mobile/src/qa/VisualQaReporter.tsx`
- Create: `src/ui/visual-qa-fixture.js`
- Modify: `src/main.js`
- Create: `scripts/visual-qa/states.mjs`
- Create: `scripts/visual-qa/capture-web.mjs`
- Create: `scripts/visual-qa/capture-native.mjs`
- Create: `scripts/visual-qa/compare.mjs`
- Create: `scripts/visual-qa/compare.test.mjs`
- Create: `scripts/perf/analyze-frames.mjs`
- Create: `scripts/perf/analyze-frames.test.mjs`
- Create: `scripts/perf/extract-ios-core-animation.mjs`
- Create: `scripts/perf/extract-ios-core-animation.test.mjs`
- Create: `docs/mobile-visual-performance-qa.md`
- Create: `docs/visual-qa/accepted/`

**Interfaces:**

```ts
export type VisualQaState =
  | 'practice'
  | 'guide'
  | 'custom'
  | 'session-ready'
  | 'session-inhale'
  | 'session-hold'
  | 'session-exhale'
  | 'session-paused'
  | 'session-completed'
  | 'records-empty'
  | 'records-populated'
  | 'login'
  | 'register';

export function resolveVisualQaFixture(options: {
  dev: boolean;
  requested: boolean;
  state: VisualQaState;
}): VisualQaFixture | null;

export function analyzeFrameDurations(frameDurationsMs: number[]): {
  averageFps: number;
  maxConsecutiveOver50Ms: number;
};
```

- [ ] **Step 1: Write fixture-production exclusion and performance-analyzer tests**

Prove `dev:false` always returns `null`; fixture time is exactly `2026-07-10T12:00:00+08:00`; session phases/progress are explicit; and the analyzer rejects average FPS below 55 or three consecutive frames above 50ms.

- [ ] **Step 2: Verify RED**

```bash
npm --prefix apps/mobile run test:unit -- src/qa/visualQa.test.ts
node --test scripts/visual-qa/compare.test.mjs scripts/perf/analyze-frames.test.mjs scripts/perf/extract-ios-core-animation.test.mjs
```

Expected: FAIL because the QA runtime and scripts do not exist.

- [ ] **Step 3: Install host-side visual comparison tools**

```bash
npm install --save-dev @playwright/test sharp pixelmatch pngjs
npx playwright install chromium
```

These remain root development dependencies and do not enter the mobile bundle.

- [ ] **Step 4: Add one shared deterministic fixture payload**

The JSON fixture supplies a fixed `/me`, three API methods, stats, 50-or-fewer sessions as needed, user-scoped preferences/ledger, clock time, and explicit visual time/phase progress. Login and registration states explicitly select an unauthenticated fixture scope; every protected state selects the fixed authenticated user. Web and native adapters read the same fixture. Native fixture behavior is reachable only when both `__DEV__` and `EXPO_PUBLIC_VISUAL_QA === '1'`; production always ignores the request.

- [ ] **Step 5: Add Web and native capture state drivers**

Web capture runs Chromium at device scale factor 1 for 390x844 and 412x915. `states.mjs` maps each fixture to a concrete public route, including `easy-meditation:///practice?visualQaState=practice`, `easy-meditation:///guide?visualQaState=guide`, `easy-meditation:///custom-rhythm?visualQaState=custom`, `easy-meditation:///session/box?visualQaState=session-inhale`, `easy-meditation:///records?visualQaState=records-populated`, `easy-meditation:///login?visualQaState=login`, and `easy-meditation:///register?visualQaState=register`. Native capture waits for a per-state ready marker, captures iPhone 14 and Pixel 7/API 34, normalizes device-density screenshots to logical 1x, masks status/gesture regions, and aligns safe-area content origin plus horizontal center.

`states.mjs` exports records with this exact host-side shape:

```js
{
  id: 'practice',
  webUrl: 'http://127.0.0.1:60323/?visualQaState=practice',
  nativeUrl: 'easy-meditation:///practice?visualQaState=practice',
  primaryElementIds: ['training-header', 'training-intro', 'mode-grid', 'before-card', 'bottom-nav'],
  textElementIds: ['training-title', 'training-intro-copy']
}
```

`VisualQaReporter` uses `measureInWindow` for registered test IDs after two animation frames, then logs one line:

```json
{
  "marker": "VISUAL_QA_READY",
  "state": "practice",
  "pixelRatio": 3,
  "safeArea": { "top": 47, "right": 0, "bottom": 34, "left": 0 },
  "elements": {
    "mode-grid": { "x": 24, "y": 180, "width": 342, "height": 371 },
    "training-title": {
      "x": 119,
      "y": 58,
      "width": 152,
      "height": 38,
      "fontFamily": "LXGWWenKai-Medium",
      "fontSize": 32,
      "lineHeight": 38,
      "lines": 1
    }
  }
}
```

Only the protocol keys are fixed here; measured values come from the running fixture and are never hard-coded as acceptance evidence.

Implement the polling and normalization core in `capture-native.mjs`:

```js
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import sharp from 'sharp';

const execFile = promisify(execFileCallback);

async function waitForReady(readLog, state) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const output = await readLog();
    for (const line of output.split('\n')) {
      const jsonStart = line.indexOf('{"marker":"VISUAL_QA_READY"');
      if (jsonStart < 0) continue;
      const payload = JSON.parse(line.slice(jsonStart));
      if (payload.state === state) return payload;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`VISUAL_QA_READY timeout for ${state}`);
}

async function normalizeNative(rawPath, outputPath, metrics) {
  const metadata = await sharp(rawPath).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Screenshot dimensions unavailable');
  }
  const logicalWidth = Math.round(metadata.width / metrics.pixelRatio);
  const logicalHeight = Math.round(metadata.height / metrics.pixelRatio);
  const left = Math.round(metrics.safeArea.left);
  const top = Math.round(metrics.safeArea.top);
  const right = Math.round(metrics.safeArea.right);
  const bottom = Math.round(metrics.safeArea.bottom);
  await sharp(rawPath)
    .resize(logicalWidth, logicalHeight, { fit: 'fill' })
    .extract({
      left,
      top,
      width: logicalWidth - left - right,
      height: logicalHeight - top - bottom
    })
    .png()
    .toFile(outputPath);
}

async function captureAndroid(state, nativeUrl, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  await execFile('adb', ['logcat', '-c']);
  await execFile('adb', [
    'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
    '-d', nativeUrl, 'com.easymeditation.app'
  ]);
  const metrics = await waitForReady(async () => {
    const { stdout } = await execFile('adb', [
      'logcat', '-d', '-s', 'ReactNativeJS:I'
    ]);
    return stdout;
  }, state);
  const rawPath = path.join(outputDirectory, 'native-raw.png');
  const { stdout } = await execFile(
    'adb',
    ['exec-out', 'screencap', '-p'],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }
  );
  await writeFile(rawPath, stdout);
  await normalizeNative(rawPath, path.join(outputDirectory, 'native.png'), metrics);
  await writeFile(
    path.join(outputDirectory, 'native-metrics.json'),
    `${JSON.stringify(metrics, null, 2)}\n`
  );
}
```

Implement `captureIos` with the same `waitForReady`/`normalizeNative` functions, `simctl openurl`, `simctl log show`, and `simctl io booted screenshot`. `main()` validates `process.argv[2]` as `ios|android`, iterates the exported state records, and exits nonzero on the first missing marker or malformed payload.

- [ ] **Step 6: Generate overlays, diffs, and measurable acceptance output**

For every state/platform/viewport pair, write `reference.png`, `native.png`, `overlay-50.png`, `diff.png`, and `measurements.json` under `docs/visual-qa/accepted/<platform>/<viewport>/<state>/`. Web metrics come from matching `data-od-id` bounding boxes and computed styles; native metrics come from the ready payload. Mask text rectangles from pixel scoring, then separately compare font class, weight, declared size, line height, wrapping, and text-block bounds. Fail exact token/copy/asset checks, primary-element bound deltas over 4 logical pixels, or declared type-size deltas over 2 pixels.

`compare.mjs` writes this fixed measurement result shape:

```js
{
  state: 'practice',
  platform: 'ios',
  viewport: '390x844',
  pixelDiff: { differingPixels: 0, scoredPixels: 0, ratio: 0 },
  elements: {
    'mode-grid': {
      reference: { x: 24, y: 180, width: 342, height: 371 },
      native: { x: 24, y: 180, width: 342, height: 371 },
      maxDelta: 0,
      pass: true
    }
  },
  typography: {
    'training-title': {
      familyClassMatches: true,
      weightMatches: true,
      fontSizeDelta: 0,
      lineHeightDelta: 0,
      linesMatch: true,
      pass: true
    }
  },
  exactChecks: { colors: true, copy: true, assets: true },
  pass: true
}
```

Read both PNGs with `PNG.sync.read`, translate native element coordinates by negative safe-area left/top, and center-crop the wider normalized image. Blank every configured text rectangle in cloned reference/native pixel buffers, call `pixelmatch`, and write `diff.png` with `PNG.sync.write`. Create `overlay-50.png` by compositing native at opacity 0.5 over reference with Sharp. For each primary element, compute the maximum absolute x/y/width/height difference; for each text element, compare family class, weight, point size, line height, line count, and block bounds. Write the result as `measurements.json` and set `process.exitCode = 1` if a primary delta exceeds 4, a declared type-size delta exceeds 2, or any exact check is false.

The Android driver runs:

```bash
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d "$NATIVE_URL" com.easymeditation.app
adb logcat -d -s ReactNativeJS:I | rg 'VISUAL_QA_READY'
adb exec-out screencap -p > "$RAW_SCREENSHOT"
```

The iOS simulator driver runs:

```bash
xcrun simctl spawn booted log erase
xcrun simctl openurl booted "$NATIVE_URL"
xcrun simctl spawn booted log show --last 30s --predicate 'eventMessage CONTAINS "VISUAL_QA_READY"'
xcrun simctl io booted screenshot "$RAW_SCREENSHOT"
```

The script polls the ready marker with a 30-second deadline, parses `pixelRatio` and `safeArea`, crops OS-only regions, resizes by `1 / pixelRatio` with Sharp, and translates both images so safe-area content origin and horizontal center match.

- [ ] **Step 7: Add root QA scripts**

```json
{
  "test:tooling": "node --test scripts/visual-qa/compare.test.mjs scripts/perf/analyze-frames.test.mjs scripts/perf/extract-ios-core-animation.test.mjs",
  "qa:visual:web": "node scripts/visual-qa/capture-web.mjs",
  "qa:visual:ios": "node scripts/visual-qa/capture-native.mjs ios",
  "qa:visual:android": "node scripts/visual-qa/capture-native.mjs android",
  "qa:visual:compare": "node scripts/visual-qa/compare.mjs",
  "qa:perf:android": "node scripts/perf/analyze-frames.mjs qa/perf/android-framestats.txt",
  "qa:perf:ios": "node scripts/perf/extract-ios-core-animation.mjs qa/perf/ios-core-animation.trace qa/perf/ios-frame-durations.json && node scripts/perf/analyze-frames.mjs qa/perf/ios-frame-durations.json"
}
```

Append `&& npm run test:tooling` to the root `test` script so final workspace verification includes the visual/performance parsers.

- [ ] **Step 8: Capture every approved visual state**

Run:

```bash
npm run qa:visual:web
npm run qa:visual:ios
npm run qa:visual:android
npm run qa:visual:compare
```

Expected: accepted evidence for practice; guide; custom; ready/inhale/hold/exhale/paused/completed session; records empty/populated; login; registration. Treat only the new custom start-button area as an approved source deviation. Iterate implementation and recapture until no high/medium mismatch remains.

- [ ] **Step 9: Run release-mode Android performance evidence**

```bash
cd apps/mobile
npx expo run:android --variant release --device
adb shell dumpsys gfxinfo com.easymeditation.app reset
# Warm up the box session for 10 seconds, then record 60 seconds.
adb shell dumpsys gfxinfo com.easymeditation.app framestats > ../../qa/perf/android-framestats.txt
cd ../..
npm run qa:perf:android
```

Expected: average rendered FPS at least 55 and no run of three frames over 50ms.

- [ ] **Step 10: Run release-mode iOS performance evidence**

```bash
cd apps/mobile
npx expo run:ios --configuration Release --device "iPhone 14"
cd ../..
xcrun xctrace record --template "Core Animation" --time-limit 60s --device "iPhone 14" --attach com.easymeditation.app --output qa/perf/ios-core-animation.trace
npm run qa:perf:ios
```

Launch the box session and warm it for 10 seconds before running `xctrace`. The extractor first calls `xcrun xctrace export --input qa/perf/ios-core-animation.trace --toc`, selects the Core Animation table containing frame-duration samples, exports that table, and writes a normalized millisecond array. Its fixture test pins the supported TOC/table shapes and fails with a concrete unsupported-schema error instead of guessing. Capture 60 seconds and apply the same 55-FPS/no-three-over-50ms gate.

- [ ] **Step 11: Run device behavior checks during the same release pass**

Verify 360-430 widths, 1.2 font scale, pause/background/resume accuracy, sound toggle and phase cues, offline completion retention and later retry, persistence-write failure staying on route, and A → logout → B account isolation while offline and after failed refetch.

- [ ] **Step 12: Run the complete automated suite and production fixture exclusion**

```bash
npm test
npm run typecheck
cd apps/mobile
EXPO_PUBLIC_VISUAL_QA=1 npx expo export --platform ios --output-dir /tmp/easy-meditation-ios-production-smoke
cd ../..
```

Expected: all workspace tests and typechecks PASS; the production export succeeds, and the production-exclusion unit test proves the fixture resolver returns `null` even when the environment request is set.

- [ ] **Step 13: Write the evidence report and commit QA tooling/results**

Document tested device/OS/build, fixture commit, screenshots, overlay/diff paths, numeric deltas, raw performance evidence, pass/fail gates, and any explicitly excluded glyph/shadow/status-area differences.

```bash
git add package.json package-lock.json qa apps/mobile/src/qa src/ui/visual-qa-fixture.js src/main.js scripts/visual-qa scripts/perf docs/mobile-visual-performance-qa.md docs/visual-qa
git commit -m "test: add deterministic visual and performance QA"
```

---

## Final Completion Gate

- [ ] Every task's focused RED test was observed before its GREEN implementation.
- [ ] `npm test` and `npm run typecheck` pass from the repository root.
- [ ] No post-bootstrap authenticated query uses a global non-user key; revision-scoped `/me` is the only pre-identity exception and public methods are the only global data query.
- [ ] No preference code reads or migrates from a global fallback key.
- [ ] `durationOverrides` has no custom entry in schema, defaults, fixtures, or runtime writes.
- [ ] Every built-in finalization order is local ledger write → POST → cache/refetch → ledger removal.
- [ ] Custom records are local-only and can never enter the outbox.
- [ ] All exit paths are covered by tests, and native swipe-back is disabled on the focus route.
- [ ] Every required visual state has accepted iOS and Android evidence at both baseline viewports.
- [ ] Pixel/geometry, typography, accessibility, timer, audio, retry, performance, and account-isolation gates pass.
- [ ] `git status --short` contains no accidental generated files, unrelated edits, or untracked secrets.
