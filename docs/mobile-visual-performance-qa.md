# Mobile Visual And Performance QA

Status: **host foundation and deterministic Web/native fixture runtimes wired;
authorized Web reference capture complete; Android Expo Go dynamic smoke
attempted but blocked before a session rendered; installed-app native visual
and performance acceptance not run**.

This document describes the deterministic tooling currently present in the
repository and the work still required before any screenshot or frame-rate
result can be called acceptance evidence.

## What Exists Now

- `qa/fixtures/mobile-prototype.json` is one synthetic payload read by both the
  Web driver and the development-only native runtime. It fixes time at
  `2026-07-10T12:00:00+08:00`, contains a `.invalid` user, the three built-in
  methods, empty/populated records, user-scoped preferences, one local custom
  ledger row, and explicit auth/session state for all 13 capture states.
- The fixture validator applies the shared API schemas, checks empty/populated
  stats against their session rows, enforces the native preference/ledger
  invariants, and rejects normalized token, password, authorization, cookie,
  API-key, private-key, and client-secret key families.
- `scripts/visual-qa/states.mjs` defines the exact Web/native URLs and element
  manifests for the 13 states.
- `src/ui/visual-qa-fixture.js` accepts only an explicit loopback
  `visualQaState` query, drives the 11 states with approved Web references from
  fixed clocks, storage, methods, session progress, and records, and leaves the
  normal application path unchanged. Static fixture rendering uses injected
  scheduling and cue ports, so it starts no live timer or audio runtime.
- The Web driver measures every required `data-od-id` exactly once after two
  animation frames and emits `VISUAL_QA_READY` with element rectangles and
  typography metadata. Missing or duplicate IDs fail closed with
  `VISUAL_QA_ERROR`. `login` and `register` are deliberately native-only: their
  Web URLs show and emit an explicit unsupported diagnostic and never emit
  READY.
- The native fixture runtime has a double activation gate: `__DEV__` must be
  true and `EXPO_PUBLIC_VISUAL_QA` must equal `1`. It then accepts only one
  recognized `visualQaState` on its matching route. Production, disabled,
  unknown, duplicate, and route-mismatched requests stay on the normal runtime;
  production does not load or activate the fixture boundary.
- Each authenticated native fixture gets a state-keyed, isolated synthetic
  scope: its own seeded query client, in-memory user-scoped preferences,
  synthetic auth session, and no-op session outbox. It does not read or write
  application `AsyncStorage`, use the outer query client, or submit fixture
  sessions. Native `login` and `register` remain unauthenticated and do not
  create a synthetic account scope.
- Native session states use fixed validated snapshots, no-op controls/audio,
  and a fixed canvas time that bypasses the live Skia clock. Records states use
  seeded empty/populated sessions and stats, a fixed local ledger and fixture
  clock, with automatic retries and refetches disabled. State changes rebuild
  the isolated scope instead of carrying fixture records forward.
- The native reporter waits two animation frames, requires the complete state
  manifest, and emits one single-line `VISUAL_QA_READY` payload containing the
  state, pixel ratio, safe-area insets, every required element rectangle, and
  font family, weight, size, line height, and line count for text. Missing text
  metadata/elements, invalid measurements, stale state work, and unmounted work
  fail closed without a READY payload.
- The comparison engine normalizes safe-area coordinates, aligns horizontal
  centers, masks the union of Web/native text rectangles, writes a 50% overlay
  and pixel diff, and evaluates geometry, typography, and exact-check gates.
- Native and Web capture modules expose validated plans and adapter-injected
  orchestration. Tests use fake adapters. Native command builders require an
  explicit Android serial or iOS UDID. Immediately before Android launch, the
  adapter reads the device-local `MM-DD HH:MM:SS.mmm` timestamp and supplies it
  to `logcat -T`; iOS retains the explicit host ISO timestamp. Raw, normalized,
  and metrics parent directories are created before capture. The plans never
  construct `logcat -c`, `log erase`, or `booted` calls. The Web planner rejects
  `login` and `register` synchronously before any adapter can open or wait for
  READY.
- Android framestats/JSON duration analysis and fixed-schema iOS Core Animation
  XML extraction have deterministic Node tests and nonzero gate exit codes.
- `docs/visual-qa/reference-web/` contains the authorized DPR-1 Chrome
  reference set for all 11 approved Web states at `390x844` and `412x915`,
  including `VISUAL_QA_READY` metrics and the historical practice comparison.
  Login and registration remain native-only.

Run the completed host checks with:

```bash
npm run qa:fixture:validate
npm run test:web
npm run test:tooling
```

Analyze already-collected Android data with:

```bash
npm run qa:perf:android -- /absolute/path/to/android-framestats.txt
```

Android framestats FPS is derived from deltas between consecutive
`IntendedVsync` scheduling timestamps for usable rows (`Flags=0` with a finite
`FrameCompleted`). `FrameCompleted - IntendedVsync` is render latency and is
not treated as frame cadence. The same cadence intervals feed the strictly
over-50ms consecutive-frame gate.

The iOS extractor requires an existing trace plus explicit paths and device
identity. It only exports an already-collected trace; it does not record one:

```bash
IOS_DEVICE_UDID=<IOS_UDID> \
IOS_TRACE_PATH=/absolute/path/core-animation.trace \
npm run qa:perf:ios
```

The script exports to `qa/perf/ios-frame-durations.json` and immediately feeds
that exact file to the shared frame gate. Extractor failure or a failed 55-FPS /
long-frame gate therefore makes the full command fail.

## Coordinate And Evidence Contract

Native screenshot normalization changes physical pixels to logical 1x but
preserves the complete safe-area coordinate frame. The comparison engine then
performs the only safe-area crop and translates native metrics by negative
safe-area left/top exactly once. Wider images are center-cropped horizontally;
vertical content origins remain aligned.

Text pixels are excluded by applying the union of the Web and native text
rectangles to clones of both images. Text is still evaluated separately by
font family class, weight, declared size and line height, line count, and text
block bounds. Primary element bounds allow at most four logical pixels;
declared type size and line height allow at most two.

`docs/visual-qa/accepted/` still contains only `.gitkeep`: no native pair,
overlay, pixel diff, trace, or performance result has been accepted.
`docs/visual-qa/reference-web/` is source-side evidence only. Do not treat it
as proof of native fidelity or add fabricated/simulator-only data as passing
device evidence.

## Deliberately Not Run

The completed Web reference pass still did **not**:

- boot a simulator/emulator, install an app, open a deep link, or take a
  native screenshot;
- generate or accept a Web-to-native visual overlay or pixel diff;
- invoke `adb`, `xcrun`, `simctl`, or `xctrace`;
- clear or collect device logs;
- generate iOS/Android native projects or run release builds;
- measure device FPS or run audio, lifecycle, offline retry, or account
  isolation checks on a device.

Direct `qa:visual:web` and `qa:visual:compare` execution currently exits
nonzero rather than pretending a capture occurred. Native capture commands
also require all explicit selectors and paths before they can execute.

## Remaining Blockers And Required Follow-up

1. Install and select full Xcode with an iPhone 14 runtime, `simctl`,
   `xctrace`, and CocoaPods. Validate the installed Xcode's exported Core
   Animation TOC schema against the pinned parser before using it.
2. Use JDK 17 and install the matching Android platform/build tools and NDK.
   Create an API 34 Pixel 7 target with GPU acceleration for visual checks.
3. Always pass an explicit Android serial or iOS UDID. Keep timestamped,
   filtered logs; never erase shared or physical-device logs.
4. Treat simulator frame data as diagnostic only. Final 60-second release-mode
   performance, lifecycle, audio, and offline evidence requires physical Pixel
   7 and iPhone 14 hardware after a 10-second warmup.
5. Login and registration have no Web reference. Validate them against the
   approved native tokens/components instead of manufacturing Web overlays.
6. Decide on a controlled QA release profile for performance fixtures. A
   `__DEV__`-only fixture correctly protects production, but cannot drive a
   release performance run.

Only after those steps should an authorized orchestrator call the injected
capture adapters, produce bounded sanitized evidence, and populate the
accepted directory.

## Organic Breath Motion — 2026-07-11

Execution date: 2026-07-12 CST. Overall status: **blocked**.

### Revision And Automated Gate

- Final `git rev-parse HEAD` for the automated gate returned
  `0bdcea042810ca4b7caaaa669cb319495ab6a233`.
- The Android smoke artifacts were captured at
  `0cfbd322e6c99a4fdc5f280601eda3ce47fa34b6`; the subsequent lifecycle-only
  fix handles initial mount while already inactive and does not alter the
  renderer geometry or unblock the failed Expo Go surface.
- All 8 requested non-device commands exited 0: mobile typecheck; 218 mobile
  unit tests; 223 native component tests; 3 asset tests; 41 Web tests; 69
  tooling tests; the valid 13-state fixture; and `git diff --check`. The five
  test commands ran 554 tests in total.

### Selected Android Target

- Explicit serial: `emulator-5554` from `adb devices -l`.
- Google `sdk_gphone64_arm64` emulator; Android 14 / API 34.
- `1080x2400` physical pixels at `420 dpi`, yielding a measured normalized
  width of `411.42857142857144` logical pixels.
- No installed `com.easymeditation.app` package was present. Package
  `host.exp.exponent` was used for an Expo Go smoke attempt only.
- Runtime: Expo SDK 53 development bundle under Expo Go, Hermes and Fabric/new
  architecture, served from the clean worktree on Metro port 8082. A local QA
  API on port 4000 was used only after both ports were explicitly reversed.

### Measurements And Files

Evidence is ignored at
`/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/`.

At the measured viewport, the production width rule resolved a
`320.9142857142857 px` Canvas. Fresh 60 Hz production-function sampling measured
the following maximum per-frame logical core-radius deltas:

| Phase duration | Inhale maximum | Exhale maximum | Host numeric gate |
| --- | ---: | ---: | --- |
| 4,000 ms | `0.3048544574369316 px` | `0.3048544574369174 px` | passed (`<= 1.0 px`) |
| 1,000 ms | `1.2185712725333389 px` | `1.2185712725333389 px` | passed (`<= 1.5 px`) |

The source data is at
`/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/radius-metrics.json`.
This proves the deterministic host radius calculation only; no device frames
were available for visual inspection.

Required recording targets and their literal status:

- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/breath-default.mp4`
  — absent / blocked before session start.
- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/breath-custom-1s.mp4`
  — absent / blocked before custom configuration.
- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/breath-lifecycle.mp4`
  — absent / blocked before lifecycle or reduced-motion exercise.

Because no default session could be displayed and warmed, the package graphics
statistics were not reset or sampled. `android-breath-framestats.txt` and
`android-breath-frame-gate.json` are absent; analyzer `averageFps` and
`maxConsecutiveOver50Ms` are unavailable rather than zero.

The requested filtered error command produced an empty, preserved file:
`/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/react-native-errors.log`
(`ReactNativeJS:E` count 0 lines / 0 bytes). The broader native log is not clean:
the authenticated practice render reproducibly failed with
`RetryableMountingLayerException: Unable to find viewState for tag 10. Surface stopped: false`
after repeated concurrent-render recovery warnings.

### Blocked Rationale

The initial auth recovery network block was resolved by starting the local API
and adding only the explicit port-4000 reverse. A clean adb force-stop/relaunch
without clearing Expo Go data then reproduced the same Fabric failure while the
manifest identified the expected clean worktree and port 8082. Evidence:

- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-clean-relaunch.log`
- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-fabric-failure.png`
- `/Users/didi/local-dev/any/easy-meditation/.superpowers/breath-motion-acceptance-2026-07-11/expo-go-fabric-failure-ui.xml`

Dynamic emulator/Expo Go smoke, Android frame performance, installed-app
acceptance, and physical-device acceptance remain blocked. No metrics or
recordings were manufactured from the error screen.
