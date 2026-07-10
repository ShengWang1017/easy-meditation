# Easy Meditation Design QA

Date: 2026-07-11

## Result

- Web reference capture: passed.
- Native implementation comparison: not run.
- Overall build design QA: blocked until equivalent native screenshots exist.

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
