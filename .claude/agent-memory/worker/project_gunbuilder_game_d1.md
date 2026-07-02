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

**Overlay restructure (UI polish pass, 2026-07-02)**: pause/finish/mission-result/game-over used
to be a single fullscreen flex div with buttons as direct children → `.gb-btn`'s CSS (`width:
100%` under `.gb-pause`) resolved against the *full viewport*, so buttons rendered edge-to-edge on
desktop. Fixed by a shared `_buildOverlayScaffold(modifierClass)` helper in hud.js: backdrop
(`.gb-overlay-backdrop`, dark + centers its one child) → panel (`.gb-panel.gb-overlay-panel`,
width-capped `min(420px,100%)`, fade+rise CSS `animation` on open) → inner `.gb-overlay-panel-body`
(the actual flex column + scroller). All style now lives in style.css under `.gb-overlay-*`; the
per-overlay class (`gb-pause`/`gb-finish`/`gb-mission`/`gb-gameover`) is kept only as a modifier on
the backdrop for background-tint differences.

**Gotcha found & fixed: #touch outranks #ui, so overlays inside `this.root` can never paint above
touch buttons.** index.html has `#game`, `#ui` (z-index 10), `#touch` (z-index 30) as siblings of
`<body>`. `#ui` is `position:fixed` with its own z-index → it forms a stacking context that caps
*every* descendant, no matter what z-index they set internally. Since the old pause/finish/mission/
gameover overlays lived inside `this.root` (→ `#ui`), they could never out-rank `#touch`'s buttons
even at `z-index:50` — confirmed via Playwright iPhone screenshot: FIRE/JUMP/ADS/etc. painted over
the "Paused" panel. Not something introduced by the overlay restructure — it was already true of
the pre-existing single-div overlay, just newly visible once the panel had legible button labels to
be occluded. Fix: the 4 overlay backdrops are **not** appended to `this.root`; they're tracked in
`this._overlayEls` and attached directly to `document.body` in `mount()` / detached in `unmount()`
(dispose() already calls unmount()). As true top-level siblings of `#touch`, their `z-index:50` now
correctly wins over `#touch`'s `30`. If a 5th overlay is ever added, route it through
`_buildOverlayScaffold` rather than `this.root.appendChild` or it'll regress this bug.

**Gotcha: style.css has dead/stale selectors that predate hud.js's actual implementation.**
`.gb-crosshair`, `.gb-ammo`, `.gb-ammo-mag`/`.gb-ammo-reserve`, `.gb-timer`/`.gb-objective`'s
`position` etc. were written (owner A) before hud.js existed and don't match hud.js's real class
names (`.gb-ammo-count`/`.gb-ammo-mode`/`.gb-ammo-build`, not `.gb-ammo-mag`) or get overridden
per-property by hud.js's inline `cssText`. **Inline style wins per-property, not per-rule** — so a
CSS class rule can still land for whichever properties hud.js *didn't* set inline (this is how the
2026-07-02 pass added timer/objective background pills and tabular-nums purely via style.css
without touching hud.js's inline strings — verified by checking hud.js's cssText for each target
element first). Don't assume a class name having a style.css rule means that rule is live; check
what hud.js sets inline before relying on or editing a rule for HUD elements.

**Star pop-in / heading letter-spacing / numeral tabular-nums conventions** (2026-07-02 polish
pass, likely to recur): mission-result stars get class `gb-star` + inline `animation-delay:
${i*150}ms` set in JS (stagger amount), actual keyframe (`gb-star-pop`, scale-overshoot) lives in
CSS. Overlay headings share `.gb-overlay-title` (letter-spacing 0.06em) instead of each hardcoding
its own value. Numeric HUD/overlay text (ammo, timer, points, finish/mission/gameover stat lines)
gets `font-variant-numeric: tabular-nums` via a shared style.css selector list, not per-element
inline — cheaper to extend when a new numeric readout is added.
