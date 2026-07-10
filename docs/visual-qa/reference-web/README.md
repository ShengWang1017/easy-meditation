# Deterministic Web visual references

Captured on 2026-07-11 from the approved repository Web prototype in Google Chrome.

## Coverage

- Viewports: `390x844` and `412x915`
- Device pixel ratio: `1`
- States per viewport: 11
  - practice
  - guide
  - custom
  - session-ready
  - session-inhale
  - session-hold
  - session-exhale
  - session-paused
  - session-completed
  - records-empty
  - records-populated

Each viewport directory contains:

- one true PNG screenshot for every state;
- one `VISUAL_QA_READY` metrics payload for every state;
- `capture-summary.json` with viewport and overflow observations.

The browser returned JPEG screenshot bytes. The exact raw captures remain in the ignored QA scratch directory, while these committed files are decoded, pixel-preserving PNG derivatives compatible with the repository comparison pipeline.

`source-practice.png` is the historical 390x844 brainstorm image. `practice-source-vs-web.png` places it beside the deterministic reference. The historical image uses a 3-minute box duration; the approved fixture intentionally uses 5 minutes.

Login and registration are native-only states and have no approved Web reference.

These files establish the Web side of the comparison contract. They do not prove native fidelity until equivalent iOS or Android captures, overlays, diffs, geometry checks, and typography checks are produced.
