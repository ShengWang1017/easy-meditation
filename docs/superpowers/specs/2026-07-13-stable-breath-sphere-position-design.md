# Stable Breath Sphere Position Design

Date: 2026-07-13

## Problem

On the mobile focus-session screen, pressing **开始** changes the action area
from one 58 px button to a two-button stack. Because the breathing stage is the
only flexible-height region in the vertical layout, the larger action area
shrinks that stage and moves its center upward. The sphere therefore jumps even
though the ready and inhale-start motion values already match.

## Desired Behavior

- The sphere center remains at the same screen position when a session changes
  from `idle` to `running`.
- The sphere continues directly from its ready appearance into the inhale
  animation without a separate position transition.
- The ready, running, paused, and completed controls remain usable at the
  existing supported screen sizes.
- The breathing motion and renderer algorithms remain unchanged.

## Design

Reserve the full running-action stack height in every session state. The action
container will have a minimum height equal to the running controls' natural
height: the 44 px primary action, the existing vertical gap, and the 58 px end
action. In the ready state, the single start button remains aligned to the
bottom of this reserved slot.

This makes the vertical space consumed below the breathing stage stable across
the `idle` to `running` transition. The stage therefore keeps the same bounds
and center while the contents of the action slot change.

The change stays in the focus-session presentation styles. It does not add
absolute sphere positioning, layout measurement state, or a compensating
animation.

## Alternatives Considered

### Absolutely position the breathing canvas

This would isolate the canvas from control reflow, but it would couple the
sphere to screen coordinates and increase small-screen and safe-area risk.

### Animate the stage displacement

This would soften the jump but would still move the sphere after the user
presses start, which does not meet the accepted behavior.

### Absolutely overlay the running controls

This could preserve the current ready-state stage size, but the extra pause
control would compete with the timer area on shorter screens. Reserving the
maximum action height is simpler and safer.

## Testing

Add a native session-screen regression test that verifies the action slot
reserves the same running-stack height in both ready and active states and that
the ready button is bottom-aligned within that slot. Run the focused native
screen test, the mobile test suite, and mobile TypeScript checking.

## Scope

Only the mobile focus-session layout and its regression coverage are in scope.
Web layout, breathing timing, Skia rendering, motion curves, persistence, and
audio behavior are unchanged.
