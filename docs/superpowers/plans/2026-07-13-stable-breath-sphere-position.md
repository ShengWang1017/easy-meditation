# Stable Breath Sphere Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the mobile breathing sphere at one screen position when the focus session changes from ready to running.

**Architecture:** Stabilize the vertical layout rather than changing Skia motion. The existing action container will always reserve the natural height of the running two-button stack, while the ready button stays bottom-aligned inside that slot; the flexible breathing stage will therefore keep identical bounds across the state transition.

**Tech Stack:** React Native 0.79, Expo 53, TypeScript, Jest, Testing Library React Native

## Global Constraints

- The sphere center remains at the same screen position when a session changes from `idle` to `running`.
- The sphere continues directly from its ready appearance into the inhale animation without a separate position transition.
- The ready, running, paused, and completed controls remain usable at the existing supported screen sizes.
- The breathing motion and renderer algorithms remain unchanged.
- Only the mobile focus-session layout and its regression coverage are in scope.

---

### Task 1: Reserve a Stable Focus Action Slot

**Files:**
- Modify: `apps/mobile/src/test/screens/session.native.test.tsx:13,289-336`
- Modify: `apps/mobile/app/session/[methodId].tsx:521-664`

**Interfaces:**
- Consumes: `layout.touchTarget` (`44`), `spacing.sm` (`10`), and the existing large action minimum height (`58`).
- Produces: an `actions` style whose `minHeight` is `112` and whose children are bottom-aligned with `justifyContent: 'flex-end'`.

- [ ] **Step 1: Write the failing ready-layout regression test**

Change the theme-token import in `apps/mobile/src/test/screens/session.native.test.tsx` to include the layout values:

```ts
import { colors, layout, spacing } from '../../theme/tokens';
```

Then add these assertions after the native-ID loop in the existing test named `resolves a built-in display snapshot and renders exact ready-state copy`:

```ts
const startButton = view.getByTestId('focus-start');
const readyActionSlotStyle = StyleSheet.flatten(startButton.parent?.props.style);
expect(readyActionSlotStyle).toMatchObject({
  justifyContent: 'flex-end',
  minHeight: layout.touchTarget + spacing.sm + 58
});
```

The test exercises the real rendered parent of the ready button. The calculated `112` px minimum exactly matches the natural running stack: `44 + 10 + 58`.

- [ ] **Step 2: Run the focused test and verify the regression is red**

Run:

```bash
npm --workspace apps/mobile run test:native -- --runTestsByPath src/test/screens/session.native.test.tsx
```

Expected: the existing session tests run, and the ready-layout test fails because the flattened action style does not yet contain `justifyContent: 'flex-end'` or `minHeight: 112`.

- [ ] **Step 3: Implement the stable action slot**

Add a named layout constant immediately before `const styles = StyleSheet.create({` in `apps/mobile/app/session/[methodId].tsx`:

```ts
const FOCUS_ACTION_SLOT_MIN_HEIGHT = layout.touchTarget + spacing.sm + 58;
```

Update the existing `actions` style to reserve that height and bottom-align the ready button:

```ts
actions: {
  alignItems: 'stretch',
  gap: spacing.sm,
  justifyContent: 'flex-end',
  maxWidth: 300,
  minHeight: FOCUS_ACTION_SLOT_MIN_HEIGHT,
  width: '100%'
},
```

Do not change `stage`, `BreathingCanvas`, `BreathingCanvasRenderer`, `breathMotion`, or `breathVisualTimeline`; the matching ready and inhale-start motion values already provide visual continuity once layout reflow is removed.

- [ ] **Step 4: Run the focused test and verify it is green**

Run:

```bash
npm --workspace apps/mobile run test:native -- --runTestsByPath src/test/screens/session.native.test.tsx
```

Expected: `PASS src/test/screens/session.native.test.tsx` with zero failed tests.

- [ ] **Step 5: Run the complete mobile verification gate**

Run:

```bash
npm --workspace apps/mobile run test
npm --workspace apps/mobile run typecheck
git diff --check
```

Expected: all mobile unit, native, and asset tests pass; TypeScript exits `0`; `git diff --check` prints no errors. If a device or simulator is available, perform a non-blocking manual smoke check at one compact and one tall viewport by entering a focus session and pressing **开始**; the sphere center must stay fixed while the inhale shape begins.

- [ ] **Step 6: Review the scoped diff and commit the fix**

Run:

```bash
git diff -- apps/mobile/app/session/'[methodId].tsx' apps/mobile/src/test/screens/session.native.test.tsx
git status --short
git add -- apps/mobile/app/session/'[methodId].tsx' apps/mobile/src/test/screens/session.native.test.tsx
git commit -m "fix(mobile): keep breath sphere position stable on start"
```

Expected: the diff contains only the regression assertions and the stable action-slot style; the pre-existing `apps/mobile/expo-env.d.ts` deletion and `.DS_Store` remain unstaged.
