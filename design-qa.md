# Easy Meditation Design QA

Date: 2026-07-11

## Result

- Web reference capture: passed.
- Native implementation comparison: not run; the Android Expo Go motion-smoke
  attempt below was blocked before a session could render.
- Overall build design QA: blocked until equivalent installed-app native
  screenshots and dynamic motion evidence exist.

## Comparison Target

- Source visual truth:
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/index.html`
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/src/ui/app.js`
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/src/ui/app-state.js`
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/src/styles.css`
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/src/assets/reference-style/`
- Historical practice-only source image:
  - `/Users/didi/local-dev/any/easy-meditation/.superpowers/brainstorm/83649-1783647097/content/prototype-home.png`
- Web reference screenshots:
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/docs/visual-qa/reference-web/390x844/`
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/docs/visual-qa/reference-web/412x915/`
- Implementation screenshot path: unavailable; no native simulator or device capture was authorized for this run.
- Full-view comparison evidence:
  - `/Users/didi/local-dev/any/easy-meditation/.worktrees/mobile-prototype-fidelity/docs/visual-qa/reference-web/practice-source-vs-web.png`
- Focused region comparison evidence: not needed for the Web-reference-only pass. The practice full-view comparison renders at native 390x844 resolution and keeps card copy, icons, and typography readable. Focused native regions remain required after native capture.

## Viewports And States

- Primary viewport: `390x844`, DPR 1.
- Android companion viewport: `412x915`, DPR 1.
- Responsive spot checks: `360x800` and `430x932`.
- Captured reference states:
  1. `practice`
  2. `guide`
  3. `custom`
  4. `session-ready`
  5. `session-inhale`
  6. `session-hold`
  7. `session-exhale`
  8. `session-paused`
  9. `session-completed`
  10. `records-empty`
  11. `records-populated`

Each primary and companion state has a committed true PNG screenshot and a `VISUAL_QA_READY` metrics payload. The exact raw Chrome JPEG bytes remain in the ignored QA scratch directory. `login` and `register` remain native-only by the approved contract.

## Findings

- No actionable P0, P1, or P2 Web-reference finding remains.
- [P3] Session reference content reaches the bottom edge at the approved viewport.
  - Location: all six session states.
  - Evidence: the action group ends at the viewport boundary. Reported document width is 419 at 390px and 424 at 412px, while the visible sound control and action buttons stay fully inside the screenshot.
  - Impact: there is no visible horizontal crop or unusable control in the accepted screenshots, but the extra document width could confuse automated overflow checks.
  - Follow-up: consider constraining the focus container or decorative canvas overflow after native comparison, without changing the approved visible geometry prematurely.
- [P3] The 390px custom reference reports `scrollWidth=406` although every visible control remains inside the viewport; 360px and 412px checks report no custom-page overflow.
  - Follow-up: treat this as an instrumentation/overflow polish item unless a native overlay exposes a real mismatch.

## Required Fidelity Surfaces

- Fonts and typography: the Web reference consistently resolves the approved Kai-style stack. Headings, timer digits, weight hierarchy, line height, wrapping, and truncation are stable across both baseline viewports. Native must later be checked by font class, size, line height, line count, and text-block position rather than glyph pixels.
- Spacing and layout rhythm: practice, guide, custom, session, and records states preserve their approved hierarchy and card geometry at 390x844 and 412x915. Guide content remains intentionally scrollable. Session controls are visible but bottom-aligned.
- Colors and visual tokens: the pale lilac, mint, white-glass, teal, and lavender system is consistent across the reference set. Selected navigation and records heatmap states remain legible.
- Image quality and asset fidelity: the approved bitmap and SVG source assets render sharply, with no placeholder art, broken image, stretching, or transparency halo observed.
- Copy and content: fixed titles, phase copy, timers, custom rhythm values, empty-state copy, and populated record copy match the deterministic fixture. The historical practice image shows `3 分钟`; the approved fixture intentionally shows `5 分钟` for box breathing.
- Icons: back, information, gear, sound, petals, and dandelion imagery are present and aligned. No source asset is replaced by emoji or CSS art.
- Accessibility evidence: screenshot-visible contrast, hierarchy, and target sizes look sound. DOM snapshots expose named buttons, headings, navigation, spinbuttons, and regions. Full keyboard, screen-reader, zoom, and reduced-motion compliance still require dedicated testing.

## Practice Source Comparison

The historical 390x844 practice screenshot and the captured deterministic Web reference are visually aligned. Pixelmatch at threshold `0.1` found 12 differing pixels out of 329,160 (`0.00365%`). The visible intended content difference is the approved box duration change from `3 分钟` to `5 分钟`.

## Interaction And Console Checks

Normal Web mode was tested in Chrome at 390x844:

1. Open guide and return to practice.
2. Open custom rhythm.
3. Start a custom session.
4. Pause, continue, and end the session.

All state transitions produced the expected DOM state. No new console errors were emitted in normal mode. Static visual-QA routes deliberately reject live timers and are capture fixtures, not the interaction-test surface.

## Comparison History

- Pass 1: captured and inspected all 11 Web reference states at 390x844 and 412x915.
- Evidence repair: Chrome returned JPEG bytes; raw files were retained as `.jpg` and decoded into pixel-preserving true `.png` derivatives for the PNG comparison pipeline. The missing 390x844 practice metrics and 11-state summary were added.
- Responsive pass: inspected practice, custom, active session, and populated records at 360px and 430px widths. No visible control overlap, crop, or broken text wrapping was found.
- No P0/P1/P2 visual fix was made, so no post-fix capture iteration was required.

## Remaining Blocker

The Web source-of-truth set is now captured and usable. The original product question is whether the native app faithfully restores that source. That claim cannot pass until the same fixture states are captured from an authorized iOS or Android runtime and compared with overlays, pixel diffs, geometry, typography, and exact checks.

final result: blocked

## Organic Breath Motion — 2026-07-11

Execution date: 2026-07-12 CST.

### Result

- Status: **blocked**.
- Final automated-verification revision (`git rev-parse HEAD`):
  `0bdcea042810ca4b7caaaa669cb319495ab6a233`.
- The Android smoke attempt itself was captured at
  `0cfbd322e6c99a4fdc5f280601eda3ce47fa34b6`. The later commit fixes initial
  mount while already inactive and adds two lifecycle tests; it does not change
  renderer geometry or make the blocked Expo Go session reachable.
- The complete host gate passed: 8 of 8 commands exited 0. This covered
  TypeScript, 218 mobile unit tests, 223 native component tests, 3 asset tests,
  41 Web tests, 69 tooling tests, the 13-state fixture validator, and
  `git diff --check` (554 tests total).
- Installed-app or physical-device acceptance did not pass. The selected target
  had no `com.easymeditation.app`; the only available runtime was Expo Go on an
  emulator, which could provide smoke evidence only.

### Android Target And Runtime

- Serial: `emulator-5554` (selected explicitly from `adb devices -l`).
- Device profile: Google `sdk_gphone64_arm64` emulator, Android 14 / API 34.
- Physical display: `1080x2400` at `420 dpi`.
- Measured logical viewport width: `411.42857142857144 px`
  (`1080 / (420 / 160)`), within the approved 411–412 px band.
- Package: `host.exp.exponent`; `adb shell pm list packages
  com.easymeditation.app` returned no package.
- Runtime: Expo Go, Expo SDK 53 development bundle, Hermes, Fabric/new
  architecture; clean-worktree Metro at `127.0.0.1:8082` and a local-only API
  at `127.0.0.1:4000`, both reached through explicit adb reverse rules. This is
  emulator/Expo Go smoke only.

### Motion And Performance Evidence

The ignored evidence root is
`/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/`.

- Default recording target:
  `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/breath-default.mp4`
  — not created because the runtime failed before the session screen was
  reachable.
- One-second custom recording target:
  `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/breath-custom-1s.mp4`
  — not created for the same reason.
- Lifecycle/reduced-motion recording target:
  `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/breath-lifecycle.mp4`
  — not created for the same reason.
- The production motion/geometry functions were sampled freshly at 60 Hz using
  the measured `411.42857142857144 px` width and resulting
  `320.9142857142857 px` Canvas size. Maximum logical core-radius deltas were
  `0.3048544574369316 px` inhale / `0.3048544574369174 px` exhale for four-second
  phases, and `1.2185712725333389 px` for both one-second phases. These host
  numeric gates passed their 1.0 px and 1.5 px thresholds; they are not a
  substitute for a native recording.
- Android framestats were not collected because a default session could not be
  shown and warmed for ten seconds. Analyzer `averageFps` and
  `maxConsecutiveOver50Ms` are therefore unavailable, and neither
  `android-breath-framestats.txt` nor `android-breath-frame-gate.json` exists.
- The exact filtered `ReactNativeJS:E` collection contains 0 lines / 0 bytes at
  `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/react-native-errors.log`.
  This narrow JS-tag result does not erase the native Fabric failure described
  below.

### Concrete Blocker

The first clean-worktree launch initially stopped at login restoration because
no API was listening. After the local API was started and reversed on port
4000, restoration succeeded and the authenticated practice route began to
render. Expo Go then emitted repeated concurrent-render recovery warnings and
failed in Fabric with
`RetryableMountingLayerException: Unable to find viewState for tag 10. Surface stopped: false`.
An adb force-stop/relaunch without clearing data, followed by an explicit 8082
deep link, reproduced the same failure before any session could start.

The clean relaunch log, redbox screenshot, and UI hierarchy are at:

- `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-clean-relaunch.log`
- `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-fabric-failure.png`
- `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-fabric-failure-ui.xml`
- `/Users/didi/local-dev/any/easy-meditation/.worktrees/organic-breath-motion/.superpowers/breath-motion-acceptance-2026-07-11/radius-metrics.json`

No staircase, phase-boundary, pause/resume, foreground, completion/replay,
reduced-motion, or performance claim can be made from this failed launch.
Trustworthy dynamic acceptance requires a runnable installed
`com.easymeditation.app` build (and final performance still requires the
specified physical device).

final result: blocked
