# Organic Breath Motion Design

Date: 2026-07-11

Status: approved in conversation

Selected direction: calm, slowly flowing organic motion

## Problem

The native breathing blob currently changes size in visible steps instead of growing and shrinking continuously.

The business clock retains accurate elapsed milliseconds internally, but `SessionClockSnapshot` floors them to integer seconds before deriving `phaseProgress`. A four-second phase therefore exposes only `0`, `0.25`, `0.5`, and `0.75`. The session hook refreshes every 250 ms, but it republishes the same value four times before the next whole-second jump. `BreathingCanvas` copies those discrete values directly into a shared value; it only animates when the visual kind changes, not when progress changes inside the same phase.

The Web reference avoids the problem by using the business snapshot only to establish a phase anchor. It then projects progress from the current animation-frame time on every frame.

There is a related discontinuity during pause and resume: live rendering uses global visual time, while paused rendering substitutes phase-local time. Switching between those time coordinate systems can abruptly change the organic outline.

## Goals

- Make inhale, holds, and exhale visually continuous on Android and iOS.
- Preserve the business clock as the sole authority for phase, copy, audio cues, completion, and persisted duration.
- Produce a calm suspended-cloud effect: slowly flowing, organic, and non-elastic.
- Preserve the approved blob size endpoints, colors, gradients, layer order, and general silhouette.
- Keep animation work on the UI thread and retain the existing path-reuse performance model.
- Make pause, resume, replay, foreground recovery, completion, and reduced-motion behavior explicit and testable.

## Non-goals

- No Rive, Lottie, physics engine, or new animation dependency.
- No RuntimeEffect, SDF, metaball, or fluid simulation in the first implementation.
- No redesign of the focus screen, typography, controls, colors, or audio behavior.
- No change to business countdown rounding, persistence semantics, or cue timing.
- No per-frame random values and no spring-driven authoritative breath clock.

## Considered Approaches

### 1. Smooth the existing discrete progress updates

Animate each new `phaseProgress` value with a short timing or spring animation.

This is small, but it continually chases stale quarter-step targets. The visual can lag behind the actual phase, and a one-second target cadence remains visible in velocity. It also makes pause and foreground recovery harder to reason about.

### 2. Continuous UI-thread timeline with the existing procedural blob

Treat the business snapshot as an anchor and derive continuous progress from absolute frame time. Continue using the existing procedural Skia paths, but feed them a continuous breath envelope and one stable ambient-time coordinate system.

This is the selected approach. It directly removes the quantization root cause, matches the Web reference architecture, needs no new dependency, and preserves the existing renderer.

### 3. Shader or authored animation asset

Use RuntimeEffect/SDF, Rive, or a pre-authored animation.

These can produce richer liquid motion, but they add asset or GPU complexity and do not solve synchronization by themselves. They remain optional future work only if the selected approach is visually insufficient after native profiling.

## Architecture

```text
Business session clock
  -> authoritative visual anchor
  -> UI-thread frame clock
  -> continuous linear phase progress
  -> one motion envelope
  -> scale, bloom, rotation, lift, orbit
  -> stable-topology organic paths
  -> Skia renderer
```

### Business clock and visual anchor

The business clock remains authoritative. It must expose precise timing for the visual layer without changing the existing integer values used by copy, persistence, audio, and completion logic.

The visual layer receives an anchor with these semantics:

```ts
type BreathVisualAnchor = {
  phaseKey: string;
  kind: BreathVisualKind;
  visualCapturedAtMs: number;
  phaseElapsedMs: number;
  phaseDurationMs: number;
  ambientElapsedMs: number;
  status: SessionStatus;
};
```

`phaseKey` changes only when the breathing phase instance changes. It must distinguish repeated holds and later cycles, not merely use the phase kind.

`visualCapturedAtMs` uses the same monotonic UI-clock domain as the frame time consumed by the renderer. Business epoch time and Skia mount-relative time must never be subtracted from one another. The business clock supplies precise `phaseElapsedMs`; the renderer records `visualCapturedAtMs` when it ingests that authoritative value.

Integer `elapsedSeconds`, `remainingSeconds`, and `remainingInPhase` remain unchanged for UI and persistence consumers.

### UI-thread timeline

While running, the UI thread projects progress from absolute frame time:

```text
activeElapsedMs = max(0, frameTimeMs - visualCapturedAtMs)
phaseProgress = clamp01((phaseElapsedMs + activeElapsedMs) / phaseDurationMs)
ambientTimeMs = ambientElapsedMs + activeElapsedMs
```

Using absolute time prevents cumulative drift after dropped frames. The timeline must not integrate frame deltas.

The native code should reuse the existing `BreathTimeline` and `getBreathTimelineProgress` domain concepts, extending or replacing them only where needed to represent the approved anchor semantics.

Same-phase 250 ms business refreshes must not reset the visual anchor. Re-anchoring occurs only for:

- a new `phaseKey`;
- start, pause, resume, replay, or completion;
- foreground recovery;
- a same-phase timing difference greater than 100 ms between the projected and newly authoritative `phaseElapsedMs`.

When a new `phaseKey` arrives after its true boundary, the new anchor keeps its authoritative non-zero `phaseElapsedMs`. The renderer simultaneously captures the last visible motion and blends it into the continuously moving new-phase target over 300 ms with the existing non-overshooting ease-out interpolation. This correction prevents an instantaneous visual jump without rewinding or delaying the business clock.

### Component boundaries

`BreathVisualTimeline` owns anchor creation, frame-time projection, freeze/resume behavior, and correction transitions. It does not choose colors or draw paths.

`getBreathMotion` remains a pure worklet that maps kind, continuous progress, ambient time, and reduced-motion state into `scale`, `bloom`, `rotate`, `lift`, and `orbit`.

`buildOrganicBlobPoints` remains a pure stable-topology worklet. It maps radius, angle, seed, amplitude, and ambient time to path points. It does not read React state or business time.

`BreathingCanvasRenderer` consumes derived values and draws the existing Skia layers. It does not own business timing and must not allocate new `SkPath` objects per frame.

## Motion Design

### Breath envelope

Use one `smootherstep` envelope:

```text
smootherstep(t) = 6t^5 - 15t^4 + 10t^3
```

It has zero first and second derivative at both endpoints, producing a quiet start and finish without bounce. Progress is linear before this mapping; no second easing layer is applied.

Preserve the existing approved endpoints:

- inhale: scale `0.70 -> 1.08`;
- exhale: scale `1.08 -> 0.70`;
- full hold: base scale `1.08` with no more than `1.5%` micro-swell;
- empty hold: base scale `0.70` with no more than `1%` micro-swell.

Bloom, rotation, lift, and orbit use the same continuous envelope and keep their current visual endpoints unless native review identifies a specific mismatch.

The main timeline never overshoots. The first implementation does not use `withSpring`. Foreground and clock-discontinuity reconciliation reuse the existing motion interpolation with a fixed 300 ms non-overshooting ease-out timing.

### Organic outline

Retain the current stable path topology and deterministic seeds. The edge deformation remains coherent across frames:

```text
localRadius = baseRadius * breathScale *
  (1 + amplitude * coherentNoise(angle, ambientTime, seed))
```

Rules:

- no random values inside a frame callback;
- breath scale and ambient edge drift use different frequencies;
- the core outline changes slowly enough that one clearly perceptible deformation takes approximately 12–18 seconds;
- halo and veil may drift at related but non-identical rates;
- core deformation remains restrained; the blob should read as a soft cloud, not boiling liquid;
- no path interpolation or Perlin shader is added initially. Same-topology path morphing is a second-stage option only if continuous timing still looks too repetitive.

### Reduced motion

When the system requests reduced motion:

- freeze ambient edge drift;
- keep deterministic static topology;
- retain only the existing reduced-amplitude breath envelope and subtle color/opacity variation;
- do not introduce correction overshoot or rebound.

## State Transitions

### Ready and start

The ready loop uses its existing slow duration. Starting a session reuses the visible ready motion as the transition source and enters inhale without an instantaneous radius change.

### Phase change

Adjacent phase endpoints must share the same size and compatible motion values. If the business update arrives slightly after the projected endpoint, the previous phase clamps at its endpoint until the new anchor arrives. The new anchor starts at its authoritative `phaseElapsedMs`; a 300 ms moving-target correction blends from the last visible endpoint to that live new-phase motion. The business phase is never rewound to zero, and the renderer never applies the new shape in a single frame.

### Pause

Pause freezes both `phaseProgress` and `ambientTimeMs` from the same timeline. The renderer must not switch from global time to phase-local time.

### Resume

Resume creates a new anchor from the frozen phase and ambient values. It continues from the exact visible shape. No phase restart or outline reseed is allowed.

### Foreground recovery and clock discontinuity

Business labels, cues, and completion state update immediately. The renderer captures its last visible motion and reconciles to the newly projected authoritative motion over 300 ms using a non-overshooting ease-out correction.

This correction applies only when the authoritative phase or timing moved while the app was inactive, or when a same-phase timing difference exceeds 100 ms. Normal same-phase refreshes inside that tolerance do not trigger it.

Foreground recovery also captures the last visible `ambientTimeMs`. The new anchor resumes ambient time from that captured value; it does not fast-forward the organic edge drift by the time spent in the background. Only the breath motion reconciles to the authoritative phase target. The deterministic seeds, path topology, and ambient-time value remain continuous, preventing the outline from being replaced in a single frame.

### Completion and replay

Completion transitions from the current visible motion into the existing completed ambient loop. Replay captures the currently visible completed motion, creates a fresh inhale phase anchor at progress zero, and blends into the inhale-start motion over 300 ms without overshoot. Replay resets phase timing but preserves the current ambient-time value and deterministic seeds so the outline does not reseed or change in a single frame.

## Invalid Data and Fallbacks

- Clamp progress to `[0, 1]`.
- Clamp phase duration to at least 1,000 ms.
- Reject non-finite anchor timestamps in domain helpers.
- If the new anchor is invalid, retain the last valid visual frame and emit a development-only diagnostic instead of crashing the Canvas.
- If time moves backwards, re-anchor from the last visible frame; never feed negative elapsed time to the motion functions.
- Static QA fixtures retain their deterministic fixed `visualTimeMs` path and do not mount live frame-clock side effects.

## Performance Constraints

- All live progress, envelope, and path calculations run as UI-thread worklets.
- React state is not updated per frame.
- Existing Skia paths remain reused through `usePathValue`; there are no per-frame `SkPath` allocations.
- No new runtime dependency is introduced.
- Android performance acceptance remains at least 55 average FPS with no three consecutive frames over 50 ms.
- RuntimeEffect or additional noise layers require a separate proposal and native profiling before adoption.

## Testing Strategy

### Domain tests

- Sample continuous progress at approximately 16.67 ms intervals and prove monotonic progression, exact endpoints, and clamping.
- Prove same-phase business refreshes do not reset the anchor.
- Prove phase-key changes create a new anchor.
- Prove a late new `phaseKey` retains its authoritative non-zero elapsed time while its 300 ms moving-target correction begins at the last visible motion, tracks the advancing target, and never applies that target in a single frame.
- Prove pause freezes both phase and ambient time.
- Prove resume continues from the exact frozen values.
- Prove foreground correction starts from the last visible motion and ends at authoritative motion without overshoot, while ambient time resumes from the last visible value without background-time catch-up.
- Prove replay resets phase timing, preserves ambient time and deterministic seeds, and transitions from the completed visible motion without a single-frame replacement.
- Prove invalid duration, non-finite time, and backwards time use the documented fallbacks.

### Renderer tests

- Preserve existing layer order, gradients, path reuse, fixture determinism, and worklet-serialization tests.
- Replace the current assumption that running motion cannot advance from `visualTimeMs`. The new contract is: the business anchor is authoritative, while live visual progress is projected continuously on the UI thread.
- Verify reduced motion freezes edge drift while retaining a smaller breath envelope.

### Dynamic native acceptance

Static screenshots cannot prove temporal smoothness. Add a dynamic acceptance pass covering at least one complete inhale, full hold, exhale, and empty hold on Android. Numeric radius checks use the derived core breathing radius before organic edge noise at the actual resolved Canvas size: `321.36` logical pixels for the approved `412`-pixel-wide viewport (`320.58` at `411` wide), from the native `width * 0.78` layout rule. The `342`-pixel cap is not reached at this viewport. The final rendered outline is assessed separately in the native recording.

Acceptance criteria at the approved logical viewport:

- no whole-second staircase or repeated one-second plateaus;
- during ordinary default box breathing outside correction windows, logical core radius change is no greater than 1.0 px per rendered 60 Hz frame;
- supported one-second custom phases outside correction windows allow no more than 1.5 px logical core-radius change per rendered 60 Hz frame;
- fixed 300 ms correction windows for phase changes, replay, and foreground recovery are excluded from the numeric radius threshold because their authoritative gaps vary; each must be recorded and show no single-frame shape replacement or overshoot;
- no visible size jump at phase boundaries;
- pause and resume reproduce the same visible outline at the transition frame;
- start, foreground recovery, completion, replay, and reduced motion are recorded and inspected;
- the final sequence emits no new React Native errors;
- average FPS is at least 55 and there are not three consecutive frames over 50 ms.

The acceptance evidence consists of a native screen recording or deterministic frame sequence plus frame-timing output. Static visual QA remains responsible for geometry, colors, copy, and fixed-state appearance.

## References

- Existing Web timeline: `src/ui/app.js`
- Native session clock: `apps/mobile/src/domain/sessionClock.ts`
- Native session controller: `apps/mobile/src/hooks/useFocusSession.ts`
- Native renderer: `apps/mobile/src/components/BreathingCanvas.tsx`
- Motion worklets: `apps/mobile/src/domain/breathMotion.ts`
- Reanimated 3 `useFrameCallback`: <https://docs.swmansion.com/react-native-reanimated/docs/3.x/advanced/useFrameCallback/>
- Reanimated 3 `withTiming`: <https://docs.swmansion.com/react-native-reanimated/docs/3.x/animations/withTiming/>
- Skia animation hooks: <https://shopify.github.io/react-native-skia/docs/animations/hooks/>
- Skia animation integration: <https://shopify.github.io/react-native-skia/docs/animations/animations/>
