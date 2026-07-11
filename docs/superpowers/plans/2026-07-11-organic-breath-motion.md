# Organic Breath Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native breathing blob's whole-second size steps with a continuous, calm, organic UI-thread motion that remains synchronized with the authoritative session clock.

**Architecture:** The business clock exposes an exact millisecond visual timing record while retaining its existing integer display and persistence fields. A pure visual-timeline domain projects that record from the monotonic Skia frame clock, and a small Reanimated adapter reconciles phase, lifecycle, and clock discontinuities without React state updates per frame. The Skia renderer receives only shared motion and ambient-time values; it does not own business time.

**Tech Stack:** React Native 0.79, Expo 53, TypeScript, React Native Reanimated 3.17, React Native Skia 2.0 next, Vitest, Jest, Android `adb`/`dumpsys gfxinfo`.

## Global Constraints

- Preserve the business clock as the sole authority for phase, copy, audio cues, completion, persistence, and planned/actual duration.
- Keep `elapsedSeconds`, `remainingSeconds`, `remainingInPhase`, and persistence values integer-based exactly as they are today.
- Do not change the 250 ms `useFocusSession` business refresh into a frame-rate timer.
- Use one `smootherstep(t) = 6t^5 - 15t^4 + 10t^3` envelope; the main breath timeline must not overshoot.
- Preserve inhale scale `0.70 -> 1.08` and exhale scale `1.08 -> 0.70` exactly at every ambient time.
- Full-hold micro-swell must be at most `1.5%`; empty-hold micro-swell must be at most `1%`.
- Organic deformation must keep deterministic seeds and stable point topology, with no per-frame random values.
- Preserve colors, gradients, approved size endpoints, layer order, and the existing `usePathValue` path-reuse model.
- Freeze ambient edge drift for reduced motion while retaining the reduced-amplitude breath envelope.
- Use a `100 ms` same-phase reconciliation tolerance and a fixed `300 ms` non-overshooting correction.
- Do not add Rive, Lottie, RuntimeEffect, Perlin shaders, physics engines, springs, or any runtime dependency.
- Static visual-QA fixtures must stay deterministic and must not mount a live frame clock.
- Android acceptance uses the actual Canvas width: `321.36` logical pixels at a `412`-pixel viewport and `320.58` at `411`; the `342` cap is not reached there.
- Android performance must average at least `55 FPS` and must not contain three consecutive frames over `50 ms`.
- The authoring worktree contains unrelated uncommitted prototype-fidelity changes. Execute this plan only in a clean isolated worktree created with `superpowers:using-git-worktrees`; this plan does not authorize committing or copying those prior changes.
- Never use broad `git add`; stage only the paths or hunks named by the current task and inspect the full staged patch before every commit.

## File Map

- Modify `apps/mobile/src/domain/sessionClock.ts`: emit authoritative millisecond visual timing without changing display/persistence counters.
- Modify `apps/mobile/src/domain/sessionClock.test.ts`: cover exact phase keys, elapsed milliseconds, boundaries, pause, resume, completion, and later cycles.
- Modify `apps/mobile/src/qa/visualQaSession.tsx` and its test: construct deterministic visual timing for fixed fixture snapshots.
- Modify `apps/mobile/src/hooks/useSessionExitGuard.native.test.tsx` and `apps/mobile/src/test/screens/session.native.test.tsx`: keep typed snapshot fixtures aligned with the new required field.
- Create `apps/mobile/src/domain/breathVisualTimeline.ts`: pure worklet-compatible anchor projection, reconciliation, correction, and clock-reset behavior.
- Create `apps/mobile/src/domain/breathVisualTimeline.test.ts`: domain tests for continuous motion and all lifecycle transitions.
- Modify `apps/mobile/src/domain/breathMotion.ts` and its test: use smootherstep, exact endpoints, bounded holds, and slower coherent deformation.
- Create `apps/mobile/src/domain/breathRenderGeometry.ts` and its test: centralize Canvas sizing and logical core-radius acceptance calculations.
- Create `apps/mobile/src/components/BreathingCanvasRenderer.tsx`: own only the Skia render specification, reusable paths, gradients, particles, and draw tree.
- Create `apps/mobile/src/components/BreathingCanvasRenderer.native.test.tsx`: preserve visual, allocation, accessibility, and worklet contracts after extraction.
- Create `apps/mobile/src/components/useBreathVisualTimeline.ts`: bridge React inputs to UI-thread shared values without per-frame React renders.
- Create `apps/mobile/src/components/useBreathVisualTimeline.native.test.tsx`: exercise live projection, background freeze, foreground reconciliation, and fixture isolation at the adapter boundary.
- Rewrite `apps/mobile/src/components/BreathingCanvas.tsx`: keep the public adapter, hold-kind resolution, live/fixed clock selection, and timeline-to-renderer wiring.
- Modify the two existing Canvas native tests: replace the discrete-progress contract with continuous projection while preserving fixture isolation.
- Modify `apps/mobile/app/session/[methodId].tsx`: pass the authoritative visual timing object to the Canvas.
- Modify `apps/mobile/src/hooks/useFocusSession.native.test.tsx`: prove the 250 ms business refresh carries exact timing and freezes it correctly.
- Update `design-qa.md` and `docs/mobile-visual-performance-qa.md` only with evidence actually produced during Android acceptance.

---

## Execution Precondition

Before Task 1, invoke `superpowers:using-git-worktrees` and create a clean worktree from the branch commit containing this plan and the approved specification. Do not execute inside `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity` while its unrelated edits remain unstaged.

Run this preflight in the execution worktree:

```bash
git status --short
git diff --cached --exit-code
```

Expected: both commands print nothing and exit `0`. If a prior Android fidelity change is required, stop and have that change reviewed and committed as its own baseline before creating the execution worktree. Copying an uncommitted `BreathingCanvas`, `breathMotion`, renderer test, or screen-test hunk into a new feature file is not an acceptable shortcut.

At every task commit, run both `git diff --cached --name-only` and `git diff --cached --` followed by that task's explicit staged path list. Read the complete staged patch before committing.

---

### Task 1: Expose Authoritative Millisecond Visual Timing

**Files:**
- Modify: `apps/mobile/src/domain/sessionClock.ts:4-104`
- Modify: `apps/mobile/src/domain/sessionClock.test.ts:12-210`
- Modify: `apps/mobile/src/qa/visualQaSession.tsx:34-90`
- Modify: `apps/mobile/src/qa/visualQaSession.test.ts:13-161`
- Modify: `apps/mobile/src/hooks/useSessionExitGuard.native.test.tsx:37-54`
- Modify: `apps/mobile/src/test/screens/session.native.test.tsx:192-211`

**Interfaces:**
- Consumes: `BreathingMethod.phases`, the exact `elapsedMilliseconds` already retained inside `createSessionClock`, and `SessionStatus`.
- Produces: `SessionVisualTiming` and the required `SessionClockSnapshot.visual` record consumed by every subsequent task.

- [ ] **Step 1: Write failing clock tests for exact visual timing**

Add tests that keep the existing integer assertions and add these exact visual assertions:

```ts
test('emits an exact visual phase anchor without changing integer counters', () => {
  let time = 0;
  const clock = createSessionClock(getSeedMethod(0), 120, () => time);

  clock.start();
  time = 250;
  expect(clock.snapshot()).toMatchObject({
    elapsedSeconds: 0,
    remainingSeconds: 120,
    visual: {
      phaseKey: '0:0',
      phaseElapsedMs: 250,
      phaseDurationMs: 4_000,
      ambientElapsedMs: 250
    }
  });

  time = 3_999;
  expect(clock.snapshot().visual).toEqual({
    phaseKey: '0:0',
    phaseElapsedMs: 3_999,
    phaseDurationMs: 4_000,
    ambientElapsedMs: 3_999
  });

  time = 4_000;
  expect(clock.snapshot().visual).toEqual({
    phaseKey: '0:1',
    phaseElapsedMs: 0,
    phaseDurationMs: 4_000,
    ambientElapsedMs: 4_000
  });

  time = 16_250;
  expect(clock.snapshot().visual.phaseKey).toBe('1:0');
  expect(clock.snapshot().visual.phaseElapsedMs).toBe(250);
});

test('freezes exact phase and ambient milliseconds across pause', () => {
  let time = 0;
  const clock = createSessionClock(getSeedMethod(0), 120, () => time);
  clock.start();
  time = 1_375;
  clock.pause();
  const frozen = clock.snapshot().visual;

  time = 31_375;
  expect(clock.snapshot().visual).toEqual(frozen);

  clock.resume();
  time = 31_625;
  expect(clock.snapshot().visual).toMatchObject({
    phaseKey: '0:0',
    phaseElapsedMs: 1_625,
    ambientElapsedMs: 1_625
  });
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionClock.test.ts
```

Expected: FAIL because `SessionClockSnapshot.visual` does not exist.

- [ ] **Step 3: Add the exact visual timing contract and resolver**

Add the type and pure resolver before `createSessionClock`, then call it from `buildSnapshot` using the already-clamped millisecond value:

```ts
export type SessionVisualTiming = {
  phaseKey: string;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  ambientElapsedMs: number;
};

export type SessionClockSnapshot = {
  status: SessionStatus;
  elapsedSeconds: number;
  remainingSeconds: number;
  phase: SessionSnapshot;
  visual: SessionVisualTiming;
};

export function resolveSessionVisualTiming(
  method: BreathingMethod,
  elapsedMilliseconds: number,
  status: SessionStatus
): SessionVisualTiming {
  const ambientElapsedMs = Math.max(0, elapsedMilliseconds);
  const phaseDurationsMs = method.phases.map((phase) =>
    Math.max(1_000, phase.durationSeconds * 1_000)
  );
  const fallbackDurationMs = phaseDurationsMs[0] ?? 1_000;

  if (status === 'idle') {
    return {
      phaseKey: 'idle',
      phaseElapsedMs: 0,
      phaseDurationMs: fallbackDurationMs,
      ambientElapsedMs: 0
    };
  }

  if (status === 'completed') {
    return {
      phaseKey: 'completed',
      phaseElapsedMs: 0,
      phaseDurationMs: phaseDurationsMs.at(-1) ?? fallbackDurationMs,
      ambientElapsedMs
    };
  }

  const cycleDurationMs = Math.max(
    1_000,
    phaseDurationsMs.reduce((total, durationMs) => total + durationMs, 0)
  );
  const cycleIndex = Math.floor(ambientElapsedMs / cycleDurationMs);
  let cycleElapsedMs = ambientElapsedMs - cycleIndex * cycleDurationMs;
  let phaseIndex = 0;

  for (let index = 0; index < phaseDurationsMs.length; index += 1) {
    const durationMs = phaseDurationsMs[index] ?? fallbackDurationMs;
    if (cycleElapsedMs < durationMs) {
      phaseIndex = index;
      break;
    }
    cycleElapsedMs -= durationMs;
  }

  return {
    phaseKey: `${cycleIndex}:${phaseIndex}`,
    phaseElapsedMs: cycleElapsedMs,
    phaseDurationMs: phaseDurationsMs[phaseIndex] ?? fallbackDurationMs,
    ambientElapsedMs
  };
}
```

Update `buildSnapshot` without changing its integer call to `getSessionSnapshot`:

```ts
function buildSnapshot(elapsedMilliseconds: number): SessionClockSnapshot {
  const elapsedSeconds = Math.floor(elapsedMilliseconds / 1_000);
  const phase = getSessionSnapshot(method, elapsedSeconds, durationSeconds);

  return {
    status,
    elapsedSeconds,
    remainingSeconds: phase.remainingInSession,
    phase,
    visual: resolveSessionVisualTiming(method, elapsedMilliseconds, status)
  };
}
```

- [ ] **Step 4: Update deterministic and typed snapshot fixtures**

In `createVisualQaSessionOverride`, construct the exact fixed record from fixture progress:

```ts
const phaseDurationMs = Math.max(1_000, (phase?.durationSeconds ?? 1) * 1_000);
const fixtureVisualTimeMs =
  snapshot.status === 'idle' || snapshot.status === 'completed'
    ? 0
    : Math.round(snapshot.phaseProgress * phaseDurationMs);
const visual = {
  phaseKey:
    snapshot.status === 'idle'
      ? 'idle'
      : snapshot.status === 'completed'
        ? 'completed'
        : `0:${phaseIndex}`,
  phaseElapsedMs:
    snapshot.status === 'completed'
      ? 0
      : Math.round(snapshot.phaseProgress * phaseDurationMs),
  phaseDurationMs,
  ambientElapsedMs: fixtureVisualTimeMs
} as const;

const fixedSnapshot = {
  status: snapshot.status,
  elapsedSeconds: snapshot.elapsedSeconds,
  remainingSeconds: snapshot.remainingSeconds,
  phase: {
    kind: snapshot.phaseKind,
    label: isComplete ? '完成' : (phase?.label ?? snapshot.phaseKind),
    phaseIndex,
    phaseProgress: snapshot.phaseProgress,
    remainingInPhase,
    remainingInSession: snapshot.remainingSeconds,
    elapsedSeconds: snapshot.elapsedSeconds,
    isComplete
  },
  visual
} as const;
```

Return that same fixed clock value instead of recomputing it from session elapsed:

```ts
return {
  fixtureVisualTimeMs,
  controller: {
    snapshot: fixedSnapshot,
    clientSessionId: 'visual-qa-session',
    isPersisting: false,
    persistenceError: null,
    controlsUnlocked: true,
    start: noOp,
    pause: noOp,
    resume: noOp,
    persistIntentionalEnd: noOpAsync,
    retryPersistence: noOpAsync,
    replay: noOpAsync
  }
};
```

This fixed-fixture exception is deliberate: live anchors use global ambient time, while static QA retains its approved `fixtureVisualTimeMs` silhouette for deterministic reference comparisons.

Add the same `visual` shape to the snapshot helpers in `useSessionExitGuard.native.test.tsx` and `session.native.test.tsx`. Extend the exact snapshot in `visualQaSession.test.ts` with:

```ts
visual: {
  phaseKey:
    snapshot.status === 'idle'
      ? 'idle'
      : snapshot.status === 'completed'
        ? 'completed'
        : `0:${phaseIndex}`,
  phaseElapsedMs: isComplete ? 0 : expectedVisualTimeMs,
  phaseDurationMs: phases[phaseIndex]!.durationSeconds * 1_000,
  ambientElapsedMs: expectedVisualTimeMs
}
```

Keep the full `.toEqual(...)` assertion; do not weaken it to a partial match.

- [ ] **Step 5: Verify the clock and all typed fixture consumers**

Run:

```bash
npm --prefix apps/mobile run test:unit -- src/domain/sessionClock.test.ts src/qa/visualQaSession.test.ts
npm --prefix apps/mobile run test:native -- src/hooks/useSessionExitGuard.native.test.tsx src/test/screens/session.native.test.tsx
npm --prefix apps/mobile run typecheck
```

Expected: all commands PASS; existing integer countdown and persistence assertions remain unchanged.

- [ ] **Step 6: Commit only the visual timing contract**

```bash
git add -p -- apps/mobile/src/domain/sessionClock.ts apps/mobile/src/domain/sessionClock.test.ts apps/mobile/src/qa/visualQaSession.tsx apps/mobile/src/qa/visualQaSession.test.ts apps/mobile/src/hooks/useSessionExitGuard.native.test.tsx apps/mobile/src/test/screens/session.native.test.tsx
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "feat(mobile): expose precise breath visual timing"
```

---

### Task 2: Build the Pure Continuous Visual Timeline

**Files:**
- Create: `apps/mobile/src/domain/breathVisualTimeline.ts`
- Create: `apps/mobile/src/domain/breathVisualTimeline.test.ts`

**Interfaces:**
- Consumes: `SessionVisualTiming`, `SessionStatus`, and `BreathVisualKind`.
- Produces: `BreathVisualInput`, `BreathVisualAnchor`, `BreathVisualProjection`, `createBreathVisualAnchor`, `projectBreathVisualAnchor`, `freezeBreathVisualClock`, `reconcileBreathVisualAnchor`, `reanchorBreathVisualClock`, and `getBreathCorrectionAmount`.

- [ ] **Step 1: Write failing projection and reconciliation tests**

Create the test file with focused cases for every approved transition:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getBreathMotion, mixBreathMotion } from './breathMotion';
import {
  BREATH_CORRECTION_MS,
  createBreathVisualAnchor,
  freezeBreathVisualClock,
  getBreathCorrectionAmount,
  projectBreathVisualAnchor,
  reanchorBreathVisualClock,
  reconcileBreathVisualAnchor,
  type BreathVisualInput
} from './breathVisualTimeline';

const inhale: BreathVisualInput = {
  phaseKey: '0:0',
  kind: 'inhale',
  phaseElapsedMs: 0,
  phaseDurationMs: 4_000,
  ambientElapsedMs: 0,
  status: 'running',
  reducedMotion: false
};

describe('breath visual timeline', () => {
  it('projects continuous monotonic progress from absolute frame time', () => {
    const anchor = createBreathVisualAnchor(inhale, 1_000)!;
    const samples = Array.from({ length: 241 }, (_, index) =>
      projectBreathVisualAnchor(anchor, 1_000 + index * (1_000 / 60))
    );

    expect(samples[0]?.phaseProgress).toBe(0);
    expect(samples.at(-1)?.phaseProgress).toBe(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!.phaseProgress).toBeGreaterThan(
        samples[index - 1]!.phaseProgress
      );
    }
  });

  it('keeps a same-phase refresh inside 100ms without resetting the anchor', () => {
    const anchor = createBreathVisualAnchor(inhale, 0)!;
    const result = reconcileBreathVisualAnchor(
      anchor,
      { ...inhale, phaseElapsedMs: 250 },
      250
    );
    expect(result.directive).toBe('retain');
    expect(result.anchor).toBe(anchor);
  });

  it('corrects a late new phase from the authoritative non-zero elapsed time', () => {
    const anchor = createBreathVisualAnchor(inhale, 0)!;
    const result = reconcileBreathVisualAnchor(
      anchor,
      {
        ...inhale,
        phaseKey: '0:1',
        kind: 'hold-full',
        phaseElapsedMs: 180,
        ambientElapsedMs: 4_180
      },
      4_180
    );
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(180);
    expect(result.anchor.ambientElapsedMs).toBe(4_180);
  });

  it('freezes pause and resumes from the exact visible phase and outline', () => {
    const running = createBreathVisualAnchor(inhale, 0)!;
    const paused = reconcileBreathVisualAnchor(
      running,
      { ...inhale, status: 'paused', phaseElapsedMs: 1_500 },
      1_500
    );
    expect(paused.directive).toBe('freeze');
    expect(projectBreathVisualAnchor(paused.anchor, 90_000)).toEqual(
      projectBreathVisualAnchor(paused.anchor, 1_500)
    );

    const resumed = reconcileBreathVisualAnchor(
      paused.anchor,
      { ...inhale, phaseElapsedMs: 1_500 },
      90_000
    );
    expect(resumed.directive).toBe('correct');
    expect(projectBreathVisualAnchor(resumed.anchor, 90_000)).toMatchObject({
      phaseElapsedMs: 1_500,
      ambientTimeMs: 1_500
    });
  });

  it('uses authoritative foreground phase time without catching ambient time up', () => {
    const beforeBackground = createBreathVisualAnchor(
      { ...inhale, phaseElapsedMs: 1_250, ambientElapsedMs: 1_250 },
      1_250
    )!;
    const inactive = freezeBreathVisualClock(beforeBackground, 1_250);
    expect(projectBreathVisualAnchor(inactive, 10_000).ambientTimeMs).toBe(1_250);
    const result = reconcileBreathVisualAnchor(
      inactive,
      { ...inhale, phaseElapsedMs: 2_000, ambientElapsedMs: 10_000 },
      10_000
    );
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(2_000);
    expect(result.anchor.ambientElapsedMs).toBe(1_250);
  });

  it('resets replay phase timing while preserving completed ambient time', () => {
    const completed = createBreathVisualAnchor(
      {
        ...inhale,
        phaseKey: 'completed',
        kind: 'complete',
        phaseElapsedMs: 0,
        ambientElapsedMs: 60_000,
        status: 'completed'
      },
      0
    )!;
    const result = reconcileBreathVisualAnchor(completed, inhale, 500);
    expect(result.directive).toBe('correct');
    expect(result.anchor.phaseElapsedMs).toBe(0);
    expect(result.anchor.ambientElapsedMs).toBe(60_500);
  });

  it('freezes only ambient drift for reduced motion', () => {
    const reduced = createBreathVisualAnchor(
      { ...inhale, reducedMotion: true, ambientElapsedMs: 900 },
      100
    )!;
    expect(projectBreathVisualAnchor(reduced, 1_100)).toMatchObject({
      phaseElapsedMs: 1_000,
      phaseProgress: 0.25,
      ambientTimeMs: 900
    });
  });

  it('rejects invalid anchors and safely rebases a backwards clock', () => {
    expect(createBreathVisualAnchor({ ...inhale, phaseElapsedMs: Number.NaN }, 0)).toBeNull();
    const anchor = createBreathVisualAnchor(inhale, 100)!;
    const rebased = reanchorBreathVisualClock(anchor, 600, 50);
    expect(projectBreathVisualAnchor(rebased, 50)).toEqual(
      projectBreathVisualAnchor(anchor, 600)
    );
  });

  it('uses a fixed non-overshooting 300ms correction envelope', () => {
    expect(BREATH_CORRECTION_MS).toBe(300);
    expect(getBreathCorrectionAmount(1_000, 1_000)).toBe(0);
    expect(getBreathCorrectionAmount(1_150, 1_000)).toBe(0.875);
    expect(getBreathCorrectionAmount(1_300, 1_000)).toBe(1);
    expect(getBreathCorrectionAmount(2_000, 1_000)).toBe(1);
  });

  it('keeps timeline projection deterministic and worklet-safe', () => {
    const source = readFileSync(
      `${process.cwd()}/src/domain/breathVisualTimeline.ts`,
      'utf8'
    );
    expect(source).not.toMatch(/Date\.now|Math\.random/);
    for (const name of [
      'createBreathVisualAnchor',
      'projectBreathVisualAnchor',
      'freezeBreathVisualClock',
      'reconcileBreathVisualAnchor',
      'reanchorBreathVisualClock',
      'getBreathCorrectionAmount'
    ]) {
      expect(source).toMatch(
        new RegExp(`export function ${name}\\([\\s\\S]*?'worklet';`)
      );
    }
  });

  it('blends toward the advancing phase target without overshoot', () => {
    const from = getBreathMotion('inhale', 1, 4_000);
    const targetAt150 = getBreathMotion('hold-full', 330 / 4_000, 4_330);
    const at150 = mixBreathMotion(
      from,
      targetAt150,
      getBreathCorrectionAmount(4_330, 4_180)
    );
    for (const key of ['scale', 'bloom', 'rotate', 'lift', 'orbit'] as const) {
      expect(at150[key]).toBeGreaterThanOrEqual(
        Math.min(from[key], targetAt150[key])
      );
      expect(at150[key]).toBeLessThanOrEqual(
        Math.max(from[key], targetAt150[key])
      );
    }

    const targetAt300 = getBreathMotion('hold-full', 480 / 4_000, 4_480);
    expect(
      mixBreathMotion(
        from,
        targetAt300,
        getBreathCorrectionAmount(4_480, 4_180)
      )
    ).toEqual(targetAt300);
  });
});
```

- [ ] **Step 2: Run the new test and verify the red state**

Run:

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathVisualTimeline.test.ts
```

Expected: FAIL because `breathVisualTimeline.ts` does not exist.

- [ ] **Step 3: Implement the worklet-compatible absolute-time timeline**

Create `breathVisualTimeline.ts` with these exported contracts and algorithms:

```ts
import type { SessionStatus, SessionVisualTiming } from './sessionClock';
import type { BreathVisualKind } from './breathMotion';

export const BREATH_REANCHOR_TOLERANCE_MS = 100;
export const BREATH_CORRECTION_MS = 300;

export type BreathVisualInput = SessionVisualTiming & {
  kind: BreathVisualKind;
  status: SessionStatus;
  reducedMotion: boolean;
};

export type BreathVisualAnchor = BreathVisualInput & {
  visualCapturedAtMs: number;
  frameActive: boolean;
};

export type BreathVisualProjection = {
  kind: BreathVisualKind;
  phaseElapsedMs: number;
  phaseProgress: number;
  ambientTimeMs: number;
};

export type BreathVisualReconciliation = {
  directive: 'retain' | 'freeze' | 'correct' | 'reject';
  anchor: BreathVisualAnchor;
};

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function positiveModulo(value: number, divisor: number): number {
  'worklet';
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

export function easeOutCubic(value: number): number {
  'worklet';
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function createBreathVisualAnchor(
  input: BreathVisualInput,
  visualCapturedAtMs: number
): BreathVisualAnchor | null {
  'worklet';
  if (
    input.phaseKey.length === 0 ||
    !Number.isFinite(visualCapturedAtMs) ||
    !Number.isFinite(input.phaseElapsedMs) ||
    !Number.isFinite(input.phaseDurationMs) ||
    !Number.isFinite(input.ambientElapsedMs)
  ) {
    return null;
  }
  const phaseDurationMs = Math.max(1_000, input.phaseDurationMs);
  return {
    ...input,
    phaseElapsedMs: Math.max(0, Math.min(phaseDurationMs, input.phaseElapsedMs)),
    phaseDurationMs,
    ambientElapsedMs: Math.max(0, input.ambientElapsedMs),
    visualCapturedAtMs,
    frameActive: true
  };
}

export function projectBreathVisualAnchor(
  anchor: BreathVisualAnchor,
  frameTimeMs: number
): BreathVisualProjection {
  'worklet';
  const safeFrameTimeMs = Number.isFinite(frameTimeMs)
    ? Math.max(anchor.visualCapturedAtMs, frameTimeMs)
    : anchor.visualCapturedAtMs;
  const activeElapsedMs = safeFrameTimeMs - anchor.visualCapturedAtMs;
  const loop = anchor.status === 'idle' || anchor.status === 'completed';
  const phaseAdvances =
    anchor.frameActive && (anchor.status === 'running' || loop);
  const rawPhaseElapsedMs =
    anchor.phaseElapsedMs + (phaseAdvances ? activeElapsedMs : 0);
  const phaseElapsedMs = loop
    ? positiveModulo(rawPhaseElapsedMs, anchor.phaseDurationMs)
    : Math.max(0, Math.min(anchor.phaseDurationMs, rawPhaseElapsedMs));
  const ambientAdvances =
    anchor.frameActive && anchor.status !== 'paused' && !anchor.reducedMotion;

  return {
    kind: anchor.kind,
    phaseElapsedMs,
    phaseProgress: clamp01(phaseElapsedMs / anchor.phaseDurationMs),
    ambientTimeMs:
      anchor.ambientElapsedMs + (ambientAdvances ? activeElapsedMs : 0)
  };
}

export function reconcileBreathVisualAnchor(
  current: BreathVisualAnchor,
  next: BreathVisualInput,
  frameTimeMs: number
): BreathVisualReconciliation {
  'worklet';
  const projected = projectBreathVisualAnchor(current, frameTimeMs);
  const candidate = createBreathVisualAnchor(next, frameTimeMs);
  if (!candidate) return { directive: 'reject', anchor: current };

  const sameIdentity =
    current.frameActive &&
    current.phaseKey === next.phaseKey &&
    current.kind === next.kind &&
    current.status === next.status &&
    current.reducedMotion === next.reducedMotion;
  const timingErrorMs = Math.abs(next.phaseElapsedMs - projected.phaseElapsedMs);
  if (sameIdentity && timingErrorMs <= BREATH_REANCHOR_TOLERANCE_MS) {
    return { directive: 'retain', anchor: current };
  }

  if (next.status === 'paused') {
    return {
      directive: 'freeze',
      anchor: {
        ...candidate,
        phaseElapsedMs: projected.phaseElapsedMs,
        ambientElapsedMs: projected.ambientTimeMs
      }
    };
  }

  return {
    directive: 'correct',
    anchor: {
      ...candidate,
      ambientElapsedMs: projected.ambientTimeMs
    }
  };
}

export function freezeBreathVisualClock(
  anchor: BreathVisualAnchor,
  frameTimeMs: number
): BreathVisualAnchor {
  'worklet';
  const visible = projectBreathVisualAnchor(anchor, frameTimeMs);
  return {
    ...anchor,
    phaseElapsedMs: visible.phaseElapsedMs,
    ambientElapsedMs: visible.ambientTimeMs,
    visualCapturedAtMs: frameTimeMs,
    frameActive: false
  };
}

export function reanchorBreathVisualClock(
  anchor: BreathVisualAnchor,
  previousFrameTimeMs: number,
  nextFrameTimeMs: number
): BreathVisualAnchor {
  'worklet';
  const visible = projectBreathVisualAnchor(anchor, previousFrameTimeMs);
  return {
    ...anchor,
    phaseElapsedMs: visible.phaseElapsedMs,
    ambientElapsedMs: visible.ambientTimeMs,
    visualCapturedAtMs: nextFrameTimeMs
  };
}

export function getBreathCorrectionAmount(
  frameTimeMs: number,
  correctionStartedAtMs: number
): number {
  'worklet';
  return easeOutCubic(
    (frameTimeMs - correctionStartedAtMs) / BREATH_CORRECTION_MS
  );
}
```

- [ ] **Step 4: Add boundary cases for one-second duration, late refresh, and loop behavior**

Add these separate boundary cases without weakening the main lifecycle tests:

```ts
it('clamps duration and corrects timing errors above the tolerance', () => {
  const clamped = createBreathVisualAnchor(
    { ...inhale, phaseDurationMs: 0 },
    0
  )!;
  expect(clamped.phaseDurationMs).toBe(1_000);

  const current = createBreathVisualAnchor(inhale, 0)!;
  expect(
    reconcileBreathVisualAnchor(
      current,
      { ...inhale, phaseElapsedMs: 351 },
      250
    ).directive
  ).toBe('correct');
});

it.each([
  { status: 'idle' as const, kind: 'ready' as const },
  { status: 'completed' as const, kind: 'complete' as const }
])('loops $status progress inside zero and one', ({ status, kind }) => {
  const anchor = createBreathVisualAnchor(
    { ...inhale, phaseKey: status, status, kind },
    1_000
  )!;
  expect(projectBreathVisualAnchor(anchor, 5_500).phaseProgress).toBe(0.125);
  expect(projectBreathVisualAnchor(anchor, -10).phaseProgress).toBe(0);
});

it('corrects start and completion state changes', () => {
  const ready = createBreathVisualAnchor(
    { ...inhale, phaseKey: 'idle', kind: 'ready', status: 'idle' },
    0
  )!;
  const started = reconcileBreathVisualAnchor(ready, inhale, 100);
  expect(started.directive).toBe('correct');
  expect(started.anchor.ambientElapsedMs).toBe(100);
  const running = createBreathVisualAnchor(inhale, 0)!;
  const completed = reconcileBreathVisualAnchor(
    running,
    {
      ...inhale,
      phaseKey: 'completed',
      kind: 'complete',
      status: 'completed'
    },
    4_000
  );
  expect(completed.directive).toBe('correct');
  expect(completed.anchor.ambientElapsedMs).toBe(4_000);
});
```

- [ ] **Step 5: Run the domain test and typecheck**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathVisualTimeline.test.ts
npm --prefix apps/mobile run typecheck
```

Expected: PASS with continuous samples, exact freezes, preserved ambient time, and a 300 ms correction envelope.

- [ ] **Step 6: Commit the pure timeline**

```bash
git add apps/mobile/src/domain/breathVisualTimeline.ts apps/mobile/src/domain/breathVisualTimeline.test.ts
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "feat(mobile): add continuous breath visual timeline"
```

---

### Task 3: Implement the Calm Motion Envelope and Radius Gates

**Files:**
- Modify: `apps/mobile/src/domain/breathMotion.ts:68-220`
- Modify: `apps/mobile/src/domain/breathMotion.test.ts:37-185`
- Create: `apps/mobile/src/domain/breathRenderGeometry.ts`
- Create: `apps/mobile/src/domain/breathRenderGeometry.test.ts`

**Interfaces:**
- Consumes: continuous `phaseProgress` and `ambientTimeMs` from Task 2.
- Produces: `smootherstep`, bounded `getBreathMotion`, calmer stable-topology points, `resolveBreathingCanvasSize`, and `resolveLogicalCoreRadius`.

- [ ] **Step 1: Write failing envelope, endpoint, hold, and radius tests**

Add these exact motion assertions:

```ts
it('uses the exact smootherstep envelope', () => {
  expect(smootherstep(-1)).toBe(0);
  expect(smootherstep(0.25)).toBe(0.103515625);
  expect(smootherstep(0.5)).toBe(0.5);
  expect(smootherstep(0.75)).toBe(0.896484375);
  expect(smootherstep(2)).toBe(1);
});

it.each([0, 1_234, 9_876])(
  'keeps inhale and exhale endpoints exact at ambient time %s',
  (ambientTimeMs) => {
    expect(getBreathMotion('inhale', 0, ambientTimeMs).scale).toBe(0.7);
    expect(getBreathMotion('inhale', 1, ambientTimeMs).scale).toBe(1.08);
    expect(getBreathMotion('exhale', 0, ambientTimeMs).scale).toBe(1.08);
    expect(getBreathMotion('exhale', 1, ambientTimeMs).scale).toBe(0.7);
  }
);

it('keeps hold micro-swell inside the approved percentages', () => {
  const full = Array.from({ length: 121 }, (_, index) =>
    getBreathMotion('hold-full', index / 120, index * 16.67).scale
  );
  const empty = Array.from({ length: 121 }, (_, index) =>
    getBreathMotion('hold-empty', index / 120, index * 16.67).scale
  );
  expect(Math.max(...full)).toBeLessThanOrEqual(1.08 * 1.015);
  expect(Math.max(...empty)).toBeLessThanOrEqual(0.7 * 1.01);
});
```

Create `breathRenderGeometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getBreathMotion } from './breathMotion';
import {
  resolveBreathingCanvasSize,
  resolveLogicalCoreRadius
} from './breathRenderGeometry';

function maximumRadiusDelta(durationMs: number, kind: 'inhale' | 'exhale') {
  const canvasSize = resolveBreathingCanvasSize(412);
  const samples = Array.from(
    { length: Math.ceil(durationMs / (1_000 / 60)) + 1 },
    (_, index) => {
      const elapsedMs = Math.min(durationMs, index * (1_000 / 60));
      const scale = getBreathMotion(kind, elapsedMs / durationMs, elapsedMs).scale;
      return resolveLogicalCoreRadius(canvasSize, scale);
    }
  );
  return Math.max(
    ...samples.slice(1).map((radius, index) =>
      Math.abs(radius - samples[index]!)
    )
  );
}

describe('breath render geometry', () => {
  it('resolves the approved viewport Canvas sizes and cap', () => {
    expect(resolveBreathingCanvasSize(411)).toBeCloseTo(320.58, 8);
    expect(resolveBreathingCanvasSize(412)).toBeCloseTo(321.36, 8);
    expect(resolveBreathingCanvasSize(500)).toBe(342);
  });

  it('meets default and one-second 60Hz logical-radius gates', () => {
    expect(maximumRadiusDelta(4_000, 'inhale')).toBeLessThanOrEqual(1);
    expect(maximumRadiusDelta(4_000, 'exhale')).toBeLessThanOrEqual(1);
    expect(maximumRadiusDelta(1_000, 'inhale')).toBeLessThanOrEqual(1.5);
    expect(maximumRadiusDelta(1_000, 'exhale')).toBeLessThanOrEqual(1.5);
  });
});
```

- [ ] **Step 2: Run the tests and verify the red state**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathMotion.test.ts src/domain/breathRenderGeometry.test.ts
```

Expected: FAIL because `smootherstep` and geometry helpers do not exist, and the current hold swell exceeds both limits.

- [ ] **Step 3: Replace the main envelope and remove ambient noise from breath scale**

Replace `easeInOutCubic` with an exported smootherstep and use it for every inhale/exhale field. Keep ambient motion in the outline and secondary hold motion, not in the authoritative inhale/exhale radius:

```ts
export function smootherstep(value: number): number {
  'worklet';
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// inside getBreathMotion
const envelope = smootherstep(progress);

if (kind === 'inhale') {
  motion = {
    scale: lerp(0.7, 1.08, envelope),
    bloom: lerp(0.54, 0.88, envelope),
    rotate: lerp(-0.13, 0.04, envelope),
    lift: lerp(12, -4, envelope),
    orbit: lerp(0.24, 0.52, envelope)
  };
} else if (kind === 'hold-full') {
  const pulse = Math.sin(smootherstep(progress) * Math.PI) ** 2;
  motion = {
    scale: 1.08 * (1 + 0.015 * pulse),
    bloom: 0.88 + pulse * 0.02,
    rotate: 0.04 + slowWave * 0.024 * pulse,
    lift: -4 + wave * 3.2 * pulse,
    orbit: 0.52 + pulse * 0.16
  };
} else if (kind === 'hold-empty') {
  const pulse = Math.sin(smootherstep(progress) * Math.PI) ** 2;
  motion = {
    scale: 0.7 * (1 + 0.01 * pulse),
    bloom: 0.54 + pulse * 0.02,
    rotate: -0.13 + slowWave * 0.018 * pulse,
    lift: 12 + wave * 2 * pulse,
    orbit: 0.24 + pulse * 0.06
  };
} else if (kind === 'exhale') {
  motion = {
    scale: lerp(1.08, 0.7, envelope),
    bloom: lerp(0.88, 0.54, envelope),
    rotate: lerp(0.04, -0.13, envelope),
    lift: lerp(-4, 12, envelope),
    orbit: lerp(0.52, 0.24, envelope)
  };
}
```

Keep the ready and complete branches, deterministic texture, reduced-motion `0.35` displacement mix, and exact endpoint tests.

Update the worklet-order assertion so it requires `clamp01`, `lerp`, `smootherstep`, and `mixBreathMotion` to be declared before `getBreathMotion`, and remove the obsolete `easeInOutCubic` expectation:

```ts
for (const dependency of [
  'function clamp01(',
  'function lerp(',
  'export function smootherstep(',
  'export function mixBreathMotion('
]) {
  const dependencyIndex = source.indexOf(dependency);
  expect(dependencyIndex).toBeGreaterThanOrEqual(0);
  expect(dependencyIndex).toBeLessThan(motionWorklet);
}
```

- [ ] **Step 4: Slow the coherent deformation without changing topology**

Retain the same point count, angles, and deterministic seeds. Replace only the temporal coefficients so the primary core wave remains perceptible at approximately 12–18 seconds and secondary waves move more slowly:

```ts
const noise =
  Math.sin(angle * 3 + options.time + options.seed) * 0.52 +
  Math.sin(angle * 5 - options.time * 0.68 + options.seed * 1.7) * 0.31 +
  Math.sin(angle * 7 + options.time * 0.37 + options.seed * 0.8) * 0.17;
```

Update the existing four-point exact geometry assertion for the new normalized coefficients while retaining its first-point check:

```ts
expect(points[3]?.x).toBeCloseTo(320, 8);
expect(points[3]?.y).toBeCloseTo(236.96, 8);
```

Extend `breathMotion.test.ts` with an adjacent-frame and 15-second comparison:

```ts
it('keeps coherent topology calm frame-to-frame while evolving over 15 seconds', () => {
  const options = {
    cx: 0,
    cy: 0,
    radius: 100,
    points: 42,
    amp: 0.075,
    seed: 1.2
  };
  const first = buildOrganicBlobPoints({ ...options, time: 0 });
  const nextFrame = buildOrganicBlobPoints({
    ...options,
    time: (1 / 60) * 0.4
  });
  const after15Seconds = buildOrganicBlobPoints({
    ...options,
    time: 15 * 0.4
  });
  const maximumAdjacentDelta = Math.max(
    ...first.map((point, index) =>
      Math.hypot(
        point.x - nextFrame[index]!.x,
        point.y - nextFrame[index]!.y
      )
    )
  );

  expect(first).toHaveLength(42);
  expect(nextFrame).toHaveLength(42);
  expect(after15Seconds).toHaveLength(42);
  expect(maximumAdjacentDelta).toBeLessThan(0.5);
  expect(after15Seconds).not.toEqual(first);
});
```

- [ ] **Step 5: Add the shared logical geometry helpers**

Create `breathRenderGeometry.ts`:

```ts
export const BREATH_BASE_RADIUS_FRACTION = 0.32;

export function resolveBreathingCanvasSize(width: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  return safeWidth <= 380
    ? Math.min(safeWidth * 0.86, 340)
    : Math.min(safeWidth * 0.78, 342);
}

export function resolveLogicalCoreRadius(
  canvasSize: number,
  scale: number
): number {
  return canvasSize * BREATH_BASE_RADIUS_FRACTION * scale;
}
```

- [ ] **Step 6: Run motion, geometry, and worklet-order tests**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathMotion.test.ts src/domain/breathRenderGeometry.test.ts
npm --prefix apps/mobile run typecheck
```

Expected: PASS; four-second maximum core-radius delta is approximately `0.3053 px`, and one-second maximum is approximately `1.2203 px` at a 412-wide viewport.

- [ ] **Step 7: Commit the calm envelope and geometry**

```bash
git add apps/mobile/src/domain/breathRenderGeometry.ts apps/mobile/src/domain/breathRenderGeometry.test.ts
git add -p -- apps/mobile/src/domain/breathMotion.ts apps/mobile/src/domain/breathMotion.test.ts
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "feat(mobile): shape calm organic breath motion"
```

---

### Task 4: Extract a Timing-Agnostic Skia Renderer

**Files:**
- Create: `apps/mobile/src/components/BreathingCanvasRenderer.tsx`
- Create: `apps/mobile/src/components/BreathingCanvasRenderer.native.test.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvas.tsx:62-255,326-348,397-834`
- Modify: `apps/mobile/src/components/BreathingCanvas.native.test.tsx:30-172,299-495`

**Interfaces:**
- Consumes: `SharedValue<BreathMotion>` and `SharedValue<number>` ambient time.
- Produces: `BreathingCanvasRenderer`, `BREATH_RENDER_SPEC`, the existing layer/gradient helpers, `createOrganicBlobPath`, and `BreathParticle` without any session-clock imports.

- [ ] **Step 1: Add a renderer-boundary test before moving code**

Create `BreathingCanvasRenderer.native.test.tsx`, import `makeMutable` from `react-native-reanimated`, and move the current renderer-contract assertions into it. Add these source-level boundary assertions:

```ts
it('owns drawing but no business timing', () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/BreathingCanvasRenderer.tsx`,
    'utf8'
  );
  expect(source).not.toMatch(/SessionClockSnapshot|phaseKey|phaseElapsedMs|phaseProgress|status/);
  expect(source).toContain('usePathValue');
  expect(source).not.toMatch(/useDerivedValue\(\(\) =>\s*createOrganicBlobPath/);
});

it('accepts only shared motion and ambient time', () => {
  const motion = makeMutable(getBreathMotion('inhale', 0.5, 2_000));
  const ambientTimeMs = makeMutable(2_000);
  const view = render(
    <BreathingCanvasRenderer
      motion={motion}
      ambientTimeMs={ambientTimeMs}
    />
  );
  expect(view.getByTestId('breathing-canvas')).toBeTruthy();
});
```

Retain the exact existing assertions for layer order, gradients, 42 particles, closed quadratic paths, stable `Skia.Path.Make` call count, Canvas accessibility, and CanvasKit path reuse.

- [ ] **Step 2: Run the renderer test and verify the red state**

```bash
npm --prefix apps/mobile run test:native -- src/components/BreathingCanvasRenderer.native.test.tsx
```

Expected: FAIL because the renderer module does not exist.

- [ ] **Step 3: Move drawing-only symbols into the renderer module**

Move `BREATH_LAYER_ORDER`, `BreathLayer`, all three gradient prop types, `BreathGradient`, `BREATH_RENDER_SPEC`, `appendOrganicBlobPath`, `createOrganicBlobPath`, the current renderer draw tree, `BreathParticleProps`, and `BreathParticle` out of `BreathingCanvas.tsx`. The public renderer prop contract is exactly:

```ts
export type BreathingCanvasRendererProps = {
  motion: SharedValue<BreathMotion>;
  ambientTimeMs: SharedValue<number>;
};
```

At the top of `BreathingCanvasRenderer`, replace the old width, radius, and visual-time calculations with these exact statements; the existing four `usePathValue` callbacks and the draw tree then consume `motion`, `radius`, and `timeSeconds` without any business-timing value:

```ts
const { width } = useWindowDimensions();
const canvasSize = resolveBreathingCanvasSize(width);
const coordinateScale = canvasSize / BREATH_RENDER_SPEC.canvasSize;
const radius = useDerivedValue(
  () =>
    BREATH_RENDER_SPEC.canvasSize *
    BREATH_BASE_RADIUS_FRACTION *
    motion.value.scale
);
const timeSeconds = useDerivedValue(() => ambientTimeMs.value / 1_000);
```

Keep every `BREATH_RENDER_SPEC` value unchanged in this refactor task so the existing exact visual assertions remain green.

Leave the current timing block in `BreathingCanvas.tsx` under the temporary name `LegacyBreathingCanvasAdapter`. After its existing `motion` derived value, adapt the old target frame into the new draw-only props:

```tsx
const ambientTimeMs = useDerivedValue(() => targetFrame.value.visualTimeMs);

return (
  <BreathingCanvasRenderer
    motion={motion}
    ambientTimeMs={ambientTimeMs}
  />
);
```

`LiveBreathingCanvas` and `FixtureBreathingCanvas` continue calling this compatibility adapter during Task 4. Task 5 replaces it with `useBreathVisualTimeline`, so Task 4 remains independently type-correct and testable.

- [ ] **Step 4: Re-export drawing contracts from the public Canvas module**

Keep existing internal consumers stable while the tests move:

```ts
import {
  BREATH_RENDER_SPEC,
  BreathingCanvasRenderer
} from './BreathingCanvasRenderer';

export {
  BREATH_LAYER_ORDER,
  BREATH_RENDER_SPEC,
  BreathGradient,
  BreathLayer,
  BreathParticle,
  BreathingCanvasRenderer,
  createOrganicBlobPath
} from './BreathingCanvasRenderer';
```

The explicit import supplies the two local bindings used by `LegacyBreathingCanvasAdapter`; the re-export preserves the existing test/import surface.

- [ ] **Step 5: Run renderer and retained Canvas contracts**

```bash
npm --prefix apps/mobile run test:native -- src/components/BreathingCanvasRenderer.native.test.tsx src/components/BreathingCanvas.native.test.tsx
npm --prefix apps/mobile run typecheck
```

Expected: PASS with the same visual layer contract and no additional path allocations.

- [ ] **Step 6: Commit the renderer extraction**

```bash
git add apps/mobile/src/components/BreathingCanvasRenderer.tsx apps/mobile/src/components/BreathingCanvasRenderer.native.test.tsx
git add -p -- apps/mobile/src/components/BreathingCanvas.tsx apps/mobile/src/components/BreathingCanvas.native.test.tsx
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "refactor(mobile): isolate breathing canvas renderer"
```

---

### Task 5: Wire the UI-Thread Timeline Through the Canvas and Session Screen

**Files:**
- Create: `apps/mobile/src/components/useBreathVisualTimeline.ts`
- Create: `apps/mobile/src/components/useBreathVisualTimeline.native.test.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvas.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvasRenderer.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvasRenderer.native.test.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvas.native.test.tsx`
- Modify: `apps/mobile/src/components/BreathingCanvasFixtureClock.native.test.tsx`
- Modify: `apps/mobile/src/domain/breathMotion.ts`
- Modify: `apps/mobile/src/domain/breathMotion.test.ts`
- Modify: `apps/mobile/app/session/[methodId].tsx:313-421`
- Modify: `apps/mobile/src/test/screens/session.native.test.tsx:192-211,319-336,400-463`
- Modify: `apps/mobile/src/hooks/useFocusSession.native.test.tsx:21-70,190-219,419-489`

**Interfaces:**
- Consumes: `BreathVisualInput`, the pure timeline functions, `getBreathMotion`, `mixBreathMotion`, `snapshot.visual`, and Skia `useClock()`.
- Produces: `useBreathVisualTimeline(input, visualTime, isFixture)`, a slim public `BreathingCanvas`, and continuously projected `motion`/`ambientTimeMs` shared values for the renderer.

- [ ] **Step 1: Replace the old discrete Canvas tests with continuous contracts**

Remove the assertion that running progress stays fixed while `visualTimeMs` advances and replace it with:

```ts
const base = {
  phases,
  phaseIndex: 0,
  phaseKind: 'inhale' as const,
  status: 'running' as const,
  reducedMotion: false,
  visualTiming: {
    phaseKey: '0:0',
    phaseElapsedMs: 1_000,
    phaseDurationMs: 4_000,
    ambientElapsedMs: 1_000
  }
};

it('projects running motion continuously from frame time', () => {
  expect(resolveBreathingCanvasFrame(base, 0).progress).toBe(0.25);
  expect(resolveBreathingCanvasFrame(base, 250).progress).toBe(0.3125);
  expect(resolveBreathingCanvasFrame(base, 500).progress).toBe(0.375);
});

it('keeps paused progress and ambient outline identical', () => {
  const paused = { ...base, status: 'paused' as const };
  expect(resolveBreathingCanvasFrame(paused, 250)).toEqual(
    resolveBreathingCanvasFrame(paused, 30_000)
  );
});

it('does not use spring or timing animations for the authoritative clock', () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/useBreathVisualTimeline.ts`,
    'utf8'
  );
  expect(source).not.toMatch(/withSpring|withTiming/);
});
```

Extend `BreathingCanvasFixtureClock.native.test.tsx` with this deterministic isolation assertion, retaining its existing live-clock assertion:

```ts
it('keeps a fixed fixture deterministic without mounting the live clock', () => {
  const appStateSpy = jest.spyOn(AppState, 'addEventListener');
  const frameA = resolveBreathingCanvasFrame(commonProps, 2_000, 2_000);
  const frameB = resolveBreathingCanvasFrame(commonProps, 2_000, 2_000);
  expect(frameB).toEqual(frameA);

  render(
    <BreathingCanvas
      {...commonProps}
      fixtureVisualTimeMs={2_000}
    />
  );
  expect(mockUseClock).not.toHaveBeenCalled();
  expect(appStateSpy).not.toHaveBeenCalled();
  appStateSpy.mockRestore();
});
```

Create `useBreathVisualTimeline.native.test.tsx` with a probe that serializes derived values through the legal string-valued `accessibilityLabel` prop. Import `makeMutable` from `react-native-reanimated`, and capture the AppState listener:

```tsx
let appStateListener: ((state: AppStateStatus) => void) | null = null;

function TimelineProbe({
  clock,
  input,
  isFixture = false
}: {
  clock: SharedValue<number>;
  input: BreathVisualInput;
  isFixture?: boolean;
}) {
  const timeline = useBreathVisualTimeline(input, clock, isFixture);
  const snapshot = {
    progress: timeline.projection.value.phaseProgress,
    ambientTimeMs: timeline.ambientTimeMs.value,
    scale: timeline.motion.value.scale
  };
  return (
    <View
      testID="timeline-probe"
      accessibilityLabel={JSON.stringify(snapshot)}
    />
  );
}

function readTimeline(view: ReturnType<typeof render>) {
  return JSON.parse(
    view.getByTestId('timeline-probe').props.accessibilityLabel
  ) as { progress: number; ambientTimeMs: number; scale: number };
}

it('projects live frames and preserves ambient time across background recovery', () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  });
  const clock = makeMutable(0);
  const view = render(<TimelineProbe clock={clock} input={inhaleInput} />);

  act(() => {
    clock.value = 250;
  });
  view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
  expect(readTimeline(view)).toMatchObject({
    progress: 0.0625,
    ambientTimeMs: 250
  });

  act(() => appStateListener?.('background'));
  act(() => {
    clock.value = 10_000;
  });
  view.rerender(<TimelineProbe clock={clock} input={inhaleInput} />);
  expect(readTimeline(view).ambientTimeMs).toBe(250);

  const foregroundInput = {
    ...inhaleInput,
    phaseElapsedMs: 2_000,
    ambientElapsedMs: 10_000
  };
  act(() => appStateListener?.('active'));
  view.rerender(<TimelineProbe clock={clock} input={foregroundInput} />);
  expect(readTimeline(view).ambientTimeMs).toBe(250);
});
```

Add the fixture-side assertion:

```tsx
it('does not subscribe to AppState for a fixed fixture', () => {
  const appStateSpy = jest.spyOn(AppState, 'addEventListener');
  const clock = makeMutable(2_000);
  render(
    <TimelineProbe
      clock={clock}
      input={{
        ...inhaleInput,
        phaseElapsedMs: 2_000,
        ambientElapsedMs: 2_000
      }}
      isFixture
    />
  );
  expect(appStateSpy).not.toHaveBeenCalled();
  appStateSpy.mockRestore();
});
```

- [ ] **Step 2: Run the Canvas tests and verify the red state**

```bash
npm --prefix apps/mobile run test:native -- src/components/useBreathVisualTimeline.native.test.tsx src/components/BreathingCanvas.native.test.tsx src/components/BreathingCanvasFixtureClock.native.test.tsx
```

Expected: FAIL because the public props and frame resolver still use `phaseProgress`.

- [ ] **Step 3: Implement the shared-value timeline adapter**

Create `useBreathVisualTimeline.ts`. Use the absolute Skia clock for both projection and correction; do not chase each 250 ms update with `withTiming`:

```ts
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue
} from 'react-native-reanimated';
import { getBreathMotion, mixBreathMotion, type BreathMotion } from '../domain/breathMotion';
import {
  BREATH_CORRECTION_MS,
  createBreathVisualAnchor,
  freezeBreathVisualClock,
  getBreathCorrectionAmount,
  projectBreathVisualAnchor,
  reanchorBreathVisualClock,
  reconcileBreathVisualAnchor,
  type BreathVisualInput,
  type BreathVisualProjection
} from '../domain/breathVisualTimeline';

export type BreathVisualTimelineValues = {
  projection: DerivedValue<BreathVisualProjection>;
  motion: DerivedValue<BreathMotion>;
  ambientTimeMs: DerivedValue<number>;
};

export function useBreathVisualTimeline(
  input: BreathVisualInput,
  visualTime: SharedValue<number>,
  isFixture: boolean
): BreathVisualTimelineValues {
  const initialTimeMs = visualTime.value;
  const initialAnchor =
    createBreathVisualAnchor(input, initialTimeMs) ??
    createBreathVisualAnchor(
      {
        ...input,
        phaseKey: 'invalid-fallback',
        kind: 'ready',
        phaseElapsedMs: 0,
        phaseDurationMs: 1_000,
        ambientElapsedMs: 0,
        status: 'idle'
      },
      initialTimeMs
    )!;
  const anchor = useSharedValue(initialAnchor);
  const initialProjection = projectBreathVisualAnchor(initialAnchor, initialTimeMs);
  const correctionFrom = useSharedValue(
    getBreathMotion(
      initialProjection.kind,
      initialProjection.phaseProgress,
      initialProjection.ambientTimeMs,
      initialAnchor.reducedMotion
    )
  );
  const correctionStartedAtMs = useSharedValue(
    initialTimeMs - BREATH_CORRECTION_MS
  );
  const latestInput = useRef(input);
  latestInput.current = input;

  const projection = useDerivedValue(() =>
    projectBreathVisualAnchor(anchor.value, visualTime.value)
  );
  const targetMotion = useDerivedValue(() =>
    getBreathMotion(
      projection.value.kind,
      projection.value.phaseProgress,
      projection.value.ambientTimeMs,
      anchor.value.reducedMotion
    )
  );
  const motion = useDerivedValue(() =>
    mixBreathMotion(
      correctionFrom.value,
      targetMotion.value,
      getBreathCorrectionAmount(visualTime.value, correctionStartedAtMs.value)
    )
  );
  const ambientTimeMs = useDerivedValue(() => projection.value.ambientTimeMs);

  useAnimatedReaction(
    () => visualTime.value,
    (nowMs, previousFrameTimeMs) => {
      if (
        !isFixture &&
        previousFrameTimeMs !== null &&
        nowMs < previousFrameTimeMs
      ) {
        const correctionElapsedMs = Math.max(
          0,
          Math.min(
            BREATH_CORRECTION_MS,
            previousFrameTimeMs - correctionStartedAtMs.value
          )
        );
        anchor.value = reanchorBreathVisualClock(
          anchor.value,
          previousFrameTimeMs,
          nowMs
        );
        correctionStartedAtMs.value = nowMs - correctionElapsedMs;
      }
    },
    [isFixture]
  );

  useEffect(() => {
    if (isFixture) return;
    const subscription = AppState.addEventListener('change', (state) => {
      const nowMs = visualTime.value;
      if (state !== 'active') {
        anchor.value = freezeBreathVisualClock(anchor.value, nowMs);
        correctionFrom.value = motion.value;
        correctionStartedAtMs.value = nowMs - BREATH_CORRECTION_MS;
        return;
      }

      const reconciliation = reconcileBreathVisualAnchor(
        anchor.value,
        latestInput.current,
        nowMs
      );
      if (
        reconciliation.directive === 'correct' ||
        reconciliation.directive === 'freeze'
      ) {
        correctionFrom.value = motion.value;
        anchor.value = reconciliation.anchor;
        correctionStartedAtMs.value =
          reconciliation.directive === 'freeze'
            ? nowMs - BREATH_CORRECTION_MS
            : nowMs;
      }
    });
    return () => subscription.remove();
  }, [
    anchor,
    correctionFrom,
    correctionStartedAtMs,
    isFixture,
    motion,
    visualTime
  ]);

  useEffect(() => {
    const nowMs = visualTime.value;
    if (isFixture) {
      const fixed = createBreathVisualAnchor(input, nowMs);
      if (!fixed) return;
      anchor.value = fixed;
      const fixedProjection = projectBreathVisualAnchor(fixed, nowMs);
      correctionFrom.value = getBreathMotion(
        fixedProjection.kind,
        fixedProjection.phaseProgress,
        fixedProjection.ambientTimeMs,
        fixed.reducedMotion
      );
      correctionStartedAtMs.value = nowMs - BREATH_CORRECTION_MS;
      latestInput.current = input;
      return;
    }

    const reconciliation = reconcileBreathVisualAnchor(
      anchor.value,
      input,
      nowMs
    );
    if (reconciliation.directive === 'reject') {
      if (__DEV__) console.warn('Invalid breath visual anchor; retaining last frame.');
      return;
    }
    if (reconciliation.directive === 'retain') {
      latestInput.current = input;
      return;
    }

    const visibleMotion = motion.value;
    anchor.value = reconciliation.anchor;
    correctionFrom.value = visibleMotion;
    correctionStartedAtMs.value =
      reconciliation.directive === 'freeze'
        ? nowMs - BREATH_CORRECTION_MS
        : nowMs;
    latestInput.current = input;
  }, [
    anchor,
    correctionFrom,
    correctionStartedAtMs,
    input.ambientElapsedMs,
    input.kind,
    input.phaseDurationMs,
    input.phaseElapsedMs,
    input.phaseKey,
    input.reducedMotion,
    input.status,
    isFixture,
    motion,
    visualTime
  ]);

  return { projection, motion, ambientTimeMs };
}
```

The `latestInput` ref supplies the latest authoritative business input to the foreground callback; the pure domain reconciliation remains the decision-maker. Do not update React state from the frame clock.

- [ ] **Step 4: Rewrite the public Canvas as a clock adapter**

Replace `phaseProgress` and standalone `phaseDurationMs` with `visualTiming`:

```ts
export type BreathingCanvasProps = {
  phases: BreathingPhase[];
  phaseIndex: number;
  phaseKind: SessionSnapshot['kind'];
  visualTiming: SessionVisualTiming;
  status: SessionStatus;
  reducedMotion: boolean;
  fixtureVisualTimeMs?: number;
};
```

Keep the existing live/fixed component split. Both pass one shared clock to one inner adapter:

```tsx
function BreathingCanvasAdapter({
  visualTime,
  ...props
}: BreathingCanvasProps & { visualTime: SharedValue<number> }) {
  const kind = resolveKind(props);
  const phaseDurationMs =
    props.status === 'idle'
      ? BREATH_RENDER_SPEC.readyDurationMs
      : props.visualTiming.phaseDurationMs;
  const timeline = useBreathVisualTimeline(
    {
      ...props.visualTiming,
      phaseDurationMs,
      kind,
      status: props.status,
      reducedMotion: props.reducedMotion
    },
    visualTime,
    props.fixtureVisualTimeMs !== undefined
  );

  return (
    <BreathingCanvasRenderer
      motion={timeline.motion}
      ambientTimeMs={timeline.ambientTimeMs}
    />
  );
}
```

Delete `LegacyBreathingCanvasAdapter`, `BreathingVisualFrameInput`, `loopProgress`, the Canvas-local `clamp01`/`easeOutCubic`, `resolveBreathingVisualFrame`, `BreathTransitionSnapshot`, `BreathTransitionDirective`, and `resolveBreathTransitionDirective`. Remove their Reanimated animation imports. Also delete the now-replaced `BreathTimeline`, `getBreathTimelineProgress`, and `getBreathTransitionMs` exports and their obsolete tests from `breathMotion.ts`/`breathMotion.test.ts`.

Apply the approved calm renderer timing values in `BreathingCanvasRenderer.tsx` and update its exact render-spec assertions to these same values:

- `BREATH_RENDER_SPEC.halo.timeScale = 0.28`
- `BREATH_RENDER_SPEC.veil.timeScale = 0.34`
- `BREATH_RENDER_SPEC.core.timeScale = 0.4`
- `BREATH_RENDER_SPEC.highlight.timeScale = 0.36`
- add `BREATH_RENDER_SPEC.texture.timeScale = 0.22`
- `BREATH_RENDER_SPEC.center.pulseTimeScale = 0.4`
- `BREATH_RENDER_SPEC.center.pulseAmplitude = 0.02`

Use the new texture time scale in the particle worklet:

```ts
const driftAngle =
  particle.angle +
  Math.sin(
    timeSeconds.value * BREATH_RENDER_SPEC.texture.timeScale * particle.drift +
      particle.angle
  ) * BREATH_RENDER_SPEC.texture.driftAngle;
```

Reimplement `resolveBreathingCanvasFrame` with an optional captured time. Continuous unit samples use the default `0`; fixed fixtures pass the same value for frame and capture time so their explicit `visualTiming` is not advanced twice:

```ts
export function resolveBreathingCanvasFrame(
  props: BreathingCanvasProps,
  visualTimeMs: number,
  visualCapturedAtMs = 0
): BreathingCanvasFrame {
  const kind = resolveKind(props);
  const phaseDurationMs =
    props.status === 'idle'
      ? BREATH_RENDER_SPEC.readyDurationMs
      : props.visualTiming.phaseDurationMs;
  const input: BreathVisualInput = {
    ...props.visualTiming,
    phaseDurationMs,
    kind,
    status: props.status,
    reducedMotion: props.reducedMotion
  };
  const anchor = createBreathVisualAnchor(input, visualCapturedAtMs);
  if (!anchor) {
    const motion = getBreathMotion('ready', 0, 0, props.reducedMotion);
    return { kind: 'ready', progress: 0, visualTimeMs: 0, motion };
  }
  const projection = projectBreathVisualAnchor(anchor, visualTimeMs);
  return {
    kind,
    progress: projection.phaseProgress,
    visualTimeMs: projection.ambientTimeMs,
    motion: getBreathMotion(
      kind,
      projection.phaseProgress,
      projection.ambientTimeMs,
      props.reducedMotion
    )
  };
}
```

- [ ] **Step 5: Wire `snapshot.visual` through the focus screen**

Remove the local phase-duration derivation and pass the authoritative record:

```tsx
<BreathingCanvas
  fixtureVisualTimeMs={fixtureVisualTimeMs}
  phaseIndex={snapshot.phase.phaseIndex}
  phaseKind={snapshot.phase.kind}
  phases={runBundle.resolved.phases}
  reducedMotion={reducedMotion}
  status={snapshot.status}
  visualTiming={snapshot.visual}
/>
```

Update the session native test to assert `visualTiming.phaseKey`, `phaseElapsedMs`, `phaseDurationMs`, and `ambientElapsedMs`, and to assert that the Canvas no longer receives `phaseProgress`.

- [ ] **Step 6: Prove the 250 ms controller refresh carries exact timing and freezes it**

Add a `useFocusSession.native.test.tsx` case using the existing fake `nowMs` harness:

```ts
it('publishes exact visual timing at 250ms without changing integer counters', () => {
  const view = harness();
  act(() => latest.start());
  view.elapse(250);
  expect(latest.snapshot).toMatchObject({
    status: 'running',
    elapsedSeconds: 0,
    visual: {
      phaseKey: '0:0',
      phaseElapsedMs: 250,
      phaseDurationMs: 1_000,
      ambientElapsedMs: 250
    }
  });

  act(() => latest.pause());
  const frozen = latest.snapshot.visual;
  view.elapse(5_000);
  expect(latest.snapshot.visual).toEqual(frozen);
});
```

Do not change the interval at `useFocusSession.ts:243-247`. The continuous projection belongs entirely to the UI-thread adapter.

- [ ] **Step 7: Run focused UI, lifecycle, fixture, and screen tests**

```bash
npm --prefix apps/mobile run test:unit -- src/domain/breathVisualTimeline.test.ts src/domain/breathMotion.test.ts src/domain/breathRenderGeometry.test.ts
npm --prefix apps/mobile run test:native -- src/components/BreathingCanvasRenderer.native.test.tsx src/components/useBreathVisualTimeline.native.test.tsx src/components/BreathingCanvas.native.test.tsx src/components/BreathingCanvasFixtureClock.native.test.tsx src/hooks/useFocusSession.native.test.tsx src/test/screens/session.native.test.tsx
npm --prefix apps/mobile run typecheck
```

Expected: PASS; running samples advance continuously, pause is bit-for-bit stable in pure-frame tests, fixtures do not mount `useClock`, and screen/controller tests carry exact timing.

- [ ] **Step 8: Commit the UI-thread integration**

```bash
git add apps/mobile/src/components/useBreathVisualTimeline.ts apps/mobile/src/components/useBreathVisualTimeline.native.test.tsx
git add -p -- apps/mobile/src/components/BreathingCanvas.tsx apps/mobile/src/components/BreathingCanvasRenderer.tsx apps/mobile/src/components/BreathingCanvasRenderer.native.test.tsx apps/mobile/src/components/BreathingCanvas.native.test.tsx apps/mobile/src/components/BreathingCanvasFixtureClock.native.test.tsx apps/mobile/src/domain/breathMotion.ts apps/mobile/src/domain/breathMotion.test.ts apps/mobile/app/session/'[methodId].tsx' apps/mobile/src/test/screens/session.native.test.tsx apps/mobile/src/hooks/useFocusSession.native.test.tsx
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "feat(mobile): render breath phases continuously"
```

---

### Task 6: Verify the Full Feature and Capture Android Motion Evidence

**Files:**
- Modify: `design-qa.md`
- Modify: `docs/mobile-visual-performance-qa.md`
- Evidence only, ignored by Git: `.superpowers/breath-motion-acceptance-2026-07-11/`

**Interfaces:**
- Consumes: the completed feature, existing visual fixtures, `scripts/perf/analyze-frames.mjs`, an explicit Android serial, and either `com.easymeditation.app` or the clearly labeled Expo Go smoke package.
- Produces: fresh automated verification output, native recordings, frame statistics, filtered runtime errors, and an honest pass/blocked QA record.

- [ ] **Step 1: Run the complete non-device verification gate**

```bash
npm --prefix apps/mobile run typecheck
npm --prefix apps/mobile run test:unit
npm --prefix apps/mobile run test:native
npm --prefix apps/mobile run test:assets
npm run test:web
npm run test:tooling
npm run qa:fixture:validate
git diff --check
```

Expected: every command exits `0`. If the workspace-wide API suite is also run, report a missing `DATABASE_URL` as an environment block rather than attributing it to this feature.

- [ ] **Step 2: Record the exact Android target and viewport**

Use an explicit serial and package; do not clear device logs:

```bash
export ANDROID_SERIAL=emulator-5554
export ANDROID_PACKAGE=com.easymeditation.app
export EVIDENCE_DIR="$PWD/.superpowers/breath-motion-acceptance-2026-07-11"
mkdir -p "$EVIDENCE_DIR"
adb -s "$ANDROID_SERIAL" shell wm size > "$EVIDENCE_DIR/device.txt"
adb -s "$ANDROID_SERIAL" shell wm density >> "$EVIDENCE_DIR/device.txt"
adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.release >> "$EVIDENCE_DIR/device.txt"
adb -s "$ANDROID_SERIAL" shell getprop ro.build.version.sdk >> "$EVIDENCE_DIR/device.txt"
adb -s "$ANDROID_SERIAL" shell date '+%m-%d %H:%M:%S.000' > "$EVIDENCE_DIR/log-since.txt"
```

Expected: the normalized viewport is recorded as `411` or `412` logical pixels wide. If only Expo Go is available, set `ANDROID_PACKAGE=host.exp.exponent` and label every result as smoke evidence.

- [ ] **Step 3: Capture default and one-second custom motion recordings**

Record two native sequences:

```bash
adb -s "$ANDROID_SERIAL" shell screenrecord --bit-rate 12000000 --time-limit 25 /sdcard/breath-default.mp4
adb -s "$ANDROID_SERIAL" pull /sdcard/breath-default.mp4 "$EVIDENCE_DIR/breath-default.mp4"
adb -s "$ANDROID_SERIAL" shell rm /sdcard/breath-default.mp4

adb -s "$ANDROID_SERIAL" shell screenrecord --bit-rate 12000000 --time-limit 140 /sdcard/breath-custom-1s.mp4
adb -s "$ANDROID_SERIAL" pull /sdcard/breath-custom-1s.mp4 "$EVIDENCE_DIR/breath-custom-1s.mp4"
adb -s "$ANDROID_SERIAL" shell rm /sdcard/breath-custom-1s.mp4
```

During `breath-default.mp4`, start box breathing immediately and capture at least one inhale, full hold, exhale, and empty hold. Before the custom recording, configure all four phases to one second and select the shortest supported session duration, two minutes. Start the session immediately after `screenrecord`; the 140-second recording covers the 120-second completion and at least 20 seconds after replay. Inspect both recordings at normal speed and frame-by-frame for whole-second plateaus, single-frame shape replacement, endpoint overshoot, and outline reseeding.

- [ ] **Step 4: Capture lifecycle and accessibility motion states**

Create one additional recording:

```bash
adb -s "$ANDROID_SERIAL" shell screenrecord --bit-rate 12000000 --time-limit 35 /sdcard/breath-lifecycle.mp4
adb -s "$ANDROID_SERIAL" pull /sdcard/breath-lifecycle.mp4 "$EVIDENCE_DIR/breath-lifecycle.mp4"
adb -s "$ANDROID_SERIAL" shell rm /sdcard/breath-lifecycle.mp4
```

During the recording, perform start, pause, resume, background/foreground, and reduced-motion activation. Completion and replay are covered by the 140-second custom recording. The pause frame and first resumed frame must retain the same outline; foreground must not fast-forward the organic edge; reduced motion must freeze edge drift while scale continues with reduced amplitude.

- [ ] **Step 5: Collect and evaluate Android frame statistics**

Warm the default box session for ten seconds, reset only the package's graphics statistics, then capture sixty seconds:

```bash
adb -s "$ANDROID_SERIAL" shell dumpsys gfxinfo "$ANDROID_PACKAGE" reset
# Keep the default box session visible for 60 seconds after the 10-second warmup.
adb -s "$ANDROID_SERIAL" shell dumpsys gfxinfo "$ANDROID_PACKAGE" framestats > "$EVIDENCE_DIR/android-breath-framestats.txt"
npm run qa:perf:android -- "$EVIDENCE_DIR/android-breath-framestats.txt" | tee "$EVIDENCE_DIR/android-breath-frame-gate.json"
```

Expected JSON: `pass:true`, `averageFps >= 55`, and `maxConsecutiveOver50Ms <= 2`.

- [ ] **Step 6: Verify no new native runtime errors**

```bash
adb -s "$ANDROID_SERIAL" logcat -d -v raw -T "$(cat "$EVIDENCE_DIR/log-since.txt")" 'ReactNativeJS:E' '*:S' > "$EVIDENCE_DIR/react-native-errors.log"
test ! -s "$EVIDENCE_DIR/react-native-errors.log"
```

Expected: the filtered error file is empty. Preserve nonempty output and record a failed gate instead of deleting it.

- [ ] **Step 7: Update QA documentation from the actual evidence**

Add a dated `Organic Breath Motion — 2026-07-11` section to both QA documents. Record the literal output of `git rev-parse HEAD`; device profile; Android version and API; package name; build/runtime type; measured logical viewport; absolute paths to all three ignored recordings; measured four-second and one-second radius maxima; analyzer `averageFps` and `maxConsecutiveOver50Ms`; filtered error count; and the resulting passed, failed, or blocked status with its concrete reason.

Do not mark installed-app or physical-device acceptance as passed from Expo Go or emulator evidence.

- [ ] **Step 8: Commit the verified QA record**

```bash
git add -p -- design-qa.md docs/mobile-visual-performance-qa.md
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "docs: record organic breath motion acceptance"
```

If device evidence is blocked, commit the accurate blocked result and the exact missing prerequisite; do not fabricate numeric values.

---

## Final Review Checklist

- [ ] `SessionClockSnapshot.visual` is precise to milliseconds while all existing countdown/persistence seconds remain integer-based.
- [ ] Normal 250 ms business refreshes inside `100 ms` tolerance do not reset the UI anchor.
- [ ] The visual timeline projects from one absolute UI clock and never integrates per-frame deltas.
- [ ] Late phase changes start at authoritative non-zero elapsed time and correct from the last visible motion over `300 ms`.
- [ ] Pause, resume, foreground, completion, replay, reduced motion, invalid data, and backwards clock behavior match the approved design.
- [ ] Smootherstep is the only main breath envelope; inhale/exhale endpoints are exact and never include ambient radius noise.
- [ ] Full and empty holds remain within `1.5%` and `1%` swell limits.
- [ ] The renderer has no business timing imports, allocates no path per frame, and preserves layer/color/gradient contracts.
- [ ] Static visual-QA fixtures remain deterministic and do not mount `useClock`.
- [ ] Four-second and one-second logical-radius tests pass at the actual `411–412` viewport Canvas size.
- [ ] Android recordings show no staircase, plateau, single-frame replacement, reseed, or overshoot.
- [ ] Android frame output passes `>=55 FPS` and no three consecutive frames over `50 ms`.
- [ ] QA documents distinguish emulator/Expo Go smoke evidence from installed-app or physical-device acceptance.
