# Mobile Visual And Performance QA

Status: **host-only foundation complete; visual and performance acceptance not run**.

This document describes the deterministic tooling currently present in the
repository and the work still required before any screenshot or frame-rate
result can be called acceptance evidence.

## What Exists Now

- `qa/fixtures/mobile-prototype.json` is one synthetic payload shared by the
  future Web and native adapters. It fixes time at
  `2026-07-10T12:00:00+08:00`, contains a `.invalid` user, the three built-in
  methods, empty/populated records, user-scoped preferences, one local custom
  ledger row, and explicit auth/session state for all 13 capture states.
- The fixture validator applies the shared API schemas, checks empty/populated
  stats against their session rows, enforces the native preference/ledger
  invariants, and rejects normalized token, password, authorization, cookie,
  API-key, private-key, and client-secret key families.
- `scripts/visual-qa/states.mjs` defines the exact Web/native URLs and element
  manifests for the 13 states.
- The comparison engine normalizes safe-area coordinates, aligns horizontal
  centers, masks the union of Web/native text rectangles, writes a 50% overlay
  and pixel diff, and evaluates geometry, typography, and exact-check gates.
- Native and Web capture modules expose validated plans and adapter-injected
  orchestration. Tests use fake adapters. Native command builders require an
  explicit Android serial or iOS UDID. Immediately before Android launch, the
  adapter reads the device-local `MM-DD HH:MM:SS.mmm` timestamp and supplies it
  to `logcat -T`; iOS retains the explicit host ISO timestamp. Raw, normalized,
  and metrics parent directories are created before capture. The plans never
  construct `logcat -c`, `log erase`, or `booted` calls.
- Android framestats/JSON duration analysis and fixed-schema iOS Core Animation
  XML extraction have deterministic Node tests and nonzero gate exit codes.

Run the completed host checks with:

```bash
npm run qa:fixture:validate
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

`docs/visual-qa/accepted/` currently contains only `.gitkeep`. No screenshots,
overlays, diffs, traces, logs, or performance numbers have been captured or
accepted. Do not add fabricated or simulator-only data as passing evidence.

## Deliberately Not Run

This foundation pass did **not**:

- download a Playwright browser or launch/control any browser;
- start a Web server or capture a Web reference;
- boot a simulator/emulator, install an app, open a deep link, or take a
  screenshot;
- invoke `adb`, `xcrun`, `simctl`, or `xctrace`;
- clear or collect device logs;
- generate iOS/Android native projects or run release builds;
- measure FPS, audio, lifecycle, offline retry, or account isolation on a
  device;
- wire the JSON fixture into the production-shaped application.

Direct `qa:visual:web` and `qa:visual:compare` execution currently exits
nonzero rather than pretending a capture occurred. Native capture commands
also require all explicit selectors and paths before they can execute.

## Remaining Blockers And Required Follow-up

1. Integrate the final focus-session and records work, then add a development-
   only native fixture provider, registered measurement refs/text-layout
   metadata, Web fixture driver, and frozen clocks/animations. Production must
   ignore fixture requests even when an environment flag is present.
2. Obtain explicit user authorization for deterministic browser capture. The
   repository has `@playwright/test` as a host dependency, but no browser was
   installed in this pass. A clean ephemeral browser exception is preferable
   to exposing a signed-in personal profile.
3. Install and select full Xcode with an iPhone 14 runtime, `simctl`,
   `xctrace`, and CocoaPods. Validate the installed Xcode's exported Core
   Animation TOC schema against the pinned parser before using it.
4. Use JDK 17 and install the matching Android platform/build tools and NDK.
   Create an API 34 Pixel 7 target with GPU acceleration for visual checks.
5. Always pass an explicit Android serial or iOS UDID. Keep timestamped,
   filtered logs; never erase shared or physical-device logs.
6. Treat simulator frame data as diagnostic only. Final 60-second release-mode
   performance, lifecycle, audio, and offline evidence requires physical Pixel
   7 and iPhone 14 hardware after a 10-second warmup.
7. Login and registration have no Web reference. Validate them against the
   approved native tokens/components instead of manufacturing Web overlays.
8. Decide on a controlled QA release profile for performance fixtures. A
   `__DEV__`-only fixture correctly protects production, but cannot drive a
   release performance run.

Only after those steps should an authorized orchestrator call the injected
capture adapters, produce bounded sanitized evidence, and populate the
accepted directory.
