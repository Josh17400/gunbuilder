---
name: gunbuilder-core-module-notes
description: Implementation notes on Gunbuilder's owner-A core modules (input/touch wiring, screens, audio) for future edits in this project
metadata:
  type: project
---

Context: [[project-gunbuilder-contracts]]. Notes below are about the owner-A slice
of Gunbuilder (src/core/*, src/main.js, src/version.js, index.html, style.css) as
implemented on 2026-07-02.

**Input <-> TouchControls wiring is not 1:1 with the public contract signature.**
CONTRACTS.md declares `TouchControls(rootEl, inputState, settingsGetter)` (3 args),
but `src/core/input.js` constructs it with a 4th, undocumented arg: an `onPause`
callback, so a tap on the touch PAUSE button can call `Input.onPauseRequest`
without TouchControls needing to know about Input at all. This is safe because
CONTRACTS.md says input.js is the only place that instantiates TouchControls
("input.js owns a TouchControls instance internally") — no other owner is expected
to construct it directly. If a future contract revision has another file construct
TouchControls directly, the missing 4th arg is a no-op (`onPause` defaults to
null-checked), so it degrades gracefully.
**Why:** the alternative (polling `state.pausePressed` from Input) would delay the
pause callback by a frame since `endFrame()` clears pressed flags after screens
already consumed them.
**How to apply:** don't "fix" this to strictly match the 3-arg signature — the
4-arg call is intentional and documented in both files' code comments.

**Touch layout:** joystick zone is the left 40% of screen width (checked via
`window.innerWidth` at touchstart), everything else is look-drag, both tracked by
`touch.identifier` so multi-touch (move + look + fire) works simultaneously.
Buttons are DOM elements appended after the drag surface in the same absolutely-
positioned container, so they naturally intercept touches before the surface
sees them (no manual hit-testing/exclusion needed) — relies on DOM paint order
putting later siblings on top, no z-index needed.

**Added an INTERACT/"USE" touch button** not literally listed in CONTRACTS.md's
touchControls prose (which only lists FIRE/ADS/RELOAD/JUMP + PAUSE/MODE), because
the orchestrator's brief explicitly required `interactPressed` to be wired to a
touch button (needed for ammo-crate refill in range/course screens) and the
`*Pressed` flag list in the Input contract includes `interactPressed` alongside
the others that do have buttons. Placed near JUMP in the bottom-right cluster.

**Audio (src/core/audio.js):** fully synthesized via WebAudio, no asset files.
One shared 1-second noise AudioBuffer created once at `init()` and sliced with
random offsets per play() call to vary noise-based sounds cheaply (avoids
per-play buffer allocation — "cheap node creation per play" from the brief).
`init()`/`play()`/`setVolume()` are all safe to call before the AudioContext
exists (no-ops) since browsers require a user gesture before creating one;
`main.js` calls `audio.init()` on the first `pointerdown`/`touchend` via
`{once:true}` listeners.

**ScreenManager.goTo()** calls the newly entered screen's `onResize(w,h)`
synchronously right after `enter()` resolves (in addition to main.js's own
resize-event handling) so a screen's PerspectiveCamera aspect ratio is correct
immediately on entry rather than waiting for the next window resize event. This
is an addition beyond the literal contract text but doesn't change any exported
signature.
