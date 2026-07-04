# Easy Meditation Design Spec

Date: 2026-07-04

## Goal

Build a lightweight meditation app prototype that helps users start short breathing sessions quickly. The app should feel calm, clean, and useful without becoming a course library, content platform, or social habit product.

## Product Direction

The first version is a lightweight meditation tool. It focuses on common breathing rhythms, simple session timing, gentle audio cues, and light practice tracking.

The selected visual direction is the fresh daily palette from option B with the immersive start layout from option A:

- Soft pale teal and mint surfaces.
- Low-stimulation typography and spacing.
- A large centered breathing orb as the main focus.
- Minimal practice stats that support continuity without competing with the breathing session.

## Target Prototype Level

The prototype should be fully interactive:

- Users can choose a breathing method.
- Users can choose a duration.
- Users can start, pause, resume, and reset a session.
- The timer advances through real breathing phases.
- Each phase produces a distinct soft audio cue.
- Completion updates local practice records.
- The interface shows recent practice history, current streak, weekly minutes, and favorite methods.

## MVP Scope

### Breathing Methods

The prototype includes three built-in methods:

- Box Breathing: inhale 4s, hold 4s, exhale 4s, hold 4s.
- Focus Reset: inhale 4s, hold 2s, exhale 6s.
- Sleep Downshift: inhale 4s, exhale 8s.

Each method has a short label, suggested use case, and default duration.

### Durations

Available session durations:

- 2 minutes.
- 3 minutes.
- 5 minutes.
- 10 minutes.

The selected duration controls the total session time. Breathing cycles repeat until the session finishes.

### Session Screen

The main screen opens directly into the current recommended session. It prioritizes:

- Greeting and gentle context, such as "下午好，先慢下来".
- Session title, such as "3 分钟盒式呼吸".
- Large breathing orb.
- Current phase label.
- Current phase countdown.
- Remaining session time.
- Compact phase progress indicator.
- Primary start or pause control.
- Secondary reset control.

The user should not have to navigate through a heavy setup flow before starting.

### Method And Duration Selection

Method and duration selection should be available from the main experience without taking over the app. A bottom sheet or compact panel is preferred over a full settings page.

Expected controls:

- Method segmented choices or list cards.
- Duration segmented control.
- Sound toggle.
- Optional vibration toggle if the platform supports it; otherwise represent it as a UI setting without requiring real device vibration.

### Practice Tracking

Tracking is intentionally lightweight. The app stores practice data in local browser storage for the prototype.

Track:

- Completed sessions.
- Completed minutes.
- Current streak.
- Weekly minutes.
- Recent sessions.
- Favorite or last-used method.

Do not add accounts, cloud sync, badges, leaderboards, courses, or community.

## Audio Cue Design

Use Web Audio API tones for the prototype so it works without external assets.

Cue intent:

- Inhale: soft rising bell tone.
- Hold: quiet rounded chime.
- Exhale: soft lower descending tone.
- Completion: warm two-note cue.

Audio should be off until the user starts or enables a session, so the browser can allow playback after user interaction.

## Interaction Model

### Session States

Idle:

- Shows recommended method and selected duration.
- Primary action starts the session.

Running:

- Timer counts down.
- Phase label and countdown update once per second or smoother.
- Breathing orb subtly scales with inhale and exhale phases.
- Hold phases keep the orb steady.
- Phase cues play at phase transitions.

Paused:

- Timer stops.
- Phase state remains visible.
- Primary action resumes.
- Reset is available.

Completed:

- Completion cue plays.
- Practice record is saved.
- UI shows a calm completion state and updated stats.
- User can start again or choose another method.

### Timer Rules

The session timer is authoritative. The phase loop repeats while remaining session time is above zero. If a phase duration exceeds the remaining session time, the phase is truncated so the session ends exactly at the selected duration.

## Visual Design

### Color

Use a fresh, pale teal palette:

- Background: very light mint or teal.
- Main surfaces: translucent white and soft mint.
- Primary accent: muted teal.
- Text: deep green-blue.
- Secondary text: desaturated teal-gray.

Avoid heavy gradients, dark navy dominance, purple-blue themes, beige-heavy spa styling, or decorative blobs. The UI should feel fresh and precise, not mystical or generic wellness-stock.

### Layout

Primary phone layout:

- Top greeting row with lightweight stat chip.
- Short recommendation headline.
- Centered breathing orb occupying the visual center.
- Compact control panel near the bottom.
- Simple bottom navigation for Practice, Favorites, and Records.

The selected layout should feel more like an elegant utility than a marketing page.

### Motion

Motion should be slow and functional:

- Orb expands during inhale.
- Orb holds steady during hold.
- Orb contracts during exhale.
- Progress indicators move calmly.

Avoid busy particles, flashy animations, and large decorative transitions.

## Navigation

Prototype navigation can stay within one app shell:

- Practice: main breathing session.
- Favorites: saved or common breathing methods.
- Records: lightweight history and weekly stats.

The Practice tab is the default first screen.

## Error Handling And Edge Cases

- If audio cannot start automatically, show a small unobtrusive prompt to tap start again or enable sound.
- If local storage is unavailable, keep the app usable in memory and show no blocking error.
- If a session is reset, do not save partial progress as a completed practice.
- If the browser tab loses focus, the timer should continue based on elapsed wall-clock time rather than relying only on interval ticks.

## Out Of Scope

- User accounts.
- Cloud sync.
- Subscription, billing, or paywalls.
- Guided voice content.
- Long meditation courses.
- Social sharing.
- Achievement systems beyond simple streak and minutes.
- Native mobile packaging.

## Acceptance Criteria

- The first screen immediately communicates a calm breathing session.
- Box Breathing runs through inhale, hold, exhale, hold in 4-second phases.
- A 3-minute session completes automatically after 180 seconds.
- Start, pause, resume, and reset work reliably.
- Phase labels, phase countdown, session countdown, and visual orb motion stay in sync.
- Distinct phase audio cues play after a user starts the session.
- Completed sessions update local stats and recent history.
- The app remains usable on desktop and mobile viewport sizes.
- The visual direction matches the selected fresh teal immersive layout.
