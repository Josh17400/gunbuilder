---
name: project_gunbuilder_game_d1
description: Design decisions in gunbuilder's src/game/playerController.js and src/game/hud.js (owner D1) — read before modifying either
metadata:
  type: project
---

Gunbuilder (C:\Users\joshu\Documents\Claude Code\claude games\gunbuilder) — see also
[[project_gunbuilder_data_layer]] for general repo conventions (CONTRACTS.md is binding, no test
framework, `node --check` is the syntax-verification pattern).

**playerController.js recoil model**: yaw/pitch (aim) and recoilPitch/recoilYaw (kick) are two
separate accumulators, summed only at the point camera.rotation is set
(`camera.rotation.set(pitch + recoilPitch, yaw + recoilYaw, 0)`, order "YXZ" set once in the
ctor). Recoil decay per axis = `max(linearAmount, proportionalDecrease)` where linearAmount =
`recoilRecoveryDegS(deg/s)→rad * dt` and proportionalDecrease = `mag - mag*exp(-6*dt)` (λ=6) —
this was specified directly by the orchestrator brief, not inferred. Verified sign convention by
deriving the rotation math: positive `camera.rotation.x` (pitch) = looking up (matches
PointerLockControls' `euler.x -= movementY` convention), so `addRecoil(vDeg, hDeg)` adds vDeg
directly (kick pushes view up) rather than subtracting.

**Collision approach**: capsule reduces to a 2D point-vs-expanded-Box3 test in XZ (box expanded
by capsule radius 0.35 on all sides) — when the capsule center falls inside the expanded
rectangle, push out along whichever of the 4 edge-distances is smallest. This is a deliberate
simplification (not true circle-vs-rect) chosen because worlds are axis-aligned rooms per the
brief — corner cases near box corners aren't perfectly accurate but are acceptable here. Floor at
y=0 is always solid and handled separately from the Box3 collider list (colliders are for
platforms/walls only, not the ground plane). Landing test only fires when vertical range
[feetY+0.3, eyeY] overlaps the collider's Y range, so tiny floor lips don't trigger horizontal
push-out against the same box a player is standing on.

**hud.js contract deviation**: `setCrosshairSpread(deg, adsAmount)` per CONTRACTS.md only has 2
params, but the same contract line's comment requires hiding the crosshair for a scope vignette
"when adsAmount>0.8 & optic zoom<0.5" — zoom has no other delivery path in the listed API. Added
a third **optional** trailing param `opticZoom = 1` (default = no scope, so 2-arg callers get
identical behavior to a strict reading of the contract). Screens.js (owner F) needs to pass the
weapon/optic's zoom mult as the 3rd arg for the vignette feature to actually activate — flag this
if screens.js is later found calling it with only 2 args and the vignette never appears.

**HUD DOM lifecycle**: all DOM built once in the constructor under `this.root` (not yet attached
to `uiRoot`); `mount(isTouch)` appends it, `unmount()` detaches + hides. Every setter caches its
last-applied value/text and skips redundant DOM writes (perf convention from the brief), except
`setCrosshairSpread` which is expected to be called every frame with changing values by design.
Hitmarker pop/fade uses `Element.animate()` (Web Animations API) instead of CSS keyframe classes
so re-triggering mid-animation is just `.cancel()` + restart — no reflow-hack needed there (the
toast/message re-trigger does use a `toast.offsetHeight` reflow hack since it's opacity+display
toggling via plain style, not WAAPI). A single `<style id="gb-hud-inline-styles">` is injected
into `document.head` once (guarded by id check) for the ammo-low blink keyframe and toast
transition — needed because style.css (owner A) didn't exist yet at implementation time.
