# Gunbuilder — Module Contracts (v1)

Binding interface spec. Every module MUST export exactly these names with these signatures.
Plain ES modules, no bundler. Three.js via import map: `import * as THREE from "three"`,
addons via `import { OrbitControls } from "three/addons/controls/OrbitControls.js"`.
Pinned version: three@0.165.0 (jsdelivr, defined in index.html import map).

## Global conventions

- Units: meters, seconds, degrees for stat values (convert to radians at use site). Y is up.
- Player eye height: 1.65 m. Gravity for player: 14 m/s². Gravity for projectiles: 9.81 m/s².
- **Gun-local space: -Z is the muzzle direction** (matches camera forward). Part meshes are
  authored with their origin AT their mount point, muzzle axis along -Z.
- Look convention: controller applies `yaw -= lookDX; pitch -= lookDY` (pitch clamped ±1.55 rad).
  Desktop sets `lookDX = e.movementX * sens`, `lookDY = e.movementY * sens` → mouse up = look up
  (NON-inverted). Touch drag uses the same signs (drag up = look up).
- Materials: `MeshLambertMaterial` only, `vertexColors: true` for merged geometry. NO shadow maps,
  NO postprocessing. Merge static geometry with `BufferGeometryUtils.mergeGeometries`.
- No per-frame allocations in hot paths — preallocate scratch `Vector3`s at module scope.
- All UI overlays are DOM (inside `#ui`), styled in style.css. Canvas is `#game`.
- localStorage keys: `gunbuilder.v1.builds`, `gunbuilder.v1.bestTimes`, `gunbuilder.v1.settings`,
  `gunbuilder.v1.lastBuild`. All access wrapped in try/catch.

## The build object (currency between screens & storage)

```js
{ name: "My Gun",
  receiver: "rcv_ar", barrel: "brl_standard", muzzle: null, optic: "opt_irons",
  mag: "mag_standard", stock: "stk_standard", grip: "grp_standard",
  underbarrel: null, laser: null, ammo: "amo_fmj" }
```
Required (never null): receiver, barrel, optic, mag, grip, ammo. Nullable: muzzle, stock,
underbarrel, laser. (Receivers that forbid a slot force it null.)

## Part IDs (canonical — data, meshes, and defaults must all use exactly these)

- Receivers: `rcv_pistol rcv_smg rcv_ar rcv_dmr rcv_shotgun rcv_lmg rcv_nailer rcv_gauss`
- Barrels: `brl_stub brl_carbine brl_standard brl_bull brl_long brl_suppressed brl_pepperbox`
- Grips: `grp_standard grp_rubber grp_skeleton grp_target grp_bare`
- Stocks: `stk_none stk_wire stk_folding stk_standard stk_heavy stk_cushion`
- Mags: `mag_compact mag_standard mag_extended mag_drum mag_belt mag_quickpull`
- Optics: `opt_irons opt_reddot opt_holo opt_4x opt_8x`
- Muzzles: `mzl_comp mzl_brake mzl_flash mzl_suppressor mzl_choke`
- Underbarrel: `ub_vert ub_angled ub_bipod ub_shield`
- Lasers: `lsr_red lsr_green lsr_disco`
- Ammo: `amo_fmj amo_hollow amo_ap amo_explosive amo_incendiary amo_subsonic`

## Weapon stats object (output of composeStats)

```js
{ damage, fireRate /*RPM*/, fireModes /*["auto","semi"] subset order = toggle order*/,
  recoilV, recoilH /*deg/shot*/, recoilRecovery /*deg/s*/,
  muzzleVelocity /*m/s*/, adsTime /*s*/, adsZoom /*fov mult, <1*/,
  mobility /*mult*/, magSize, reloadTime /*s*/,
  spreadHip, spreadAds /*deg cone half-angle*/,
  falloffStart, falloffEnd /*m*/, pellets, penetration /*0..1*/,
  suppressed /*bool, from barrel/muzzle tags*/ }
```

---

## src/version.js  (owner: A)
`export const VERSION = "0.1.0";`

## src/core/utils.js  (owner: A)
```js
export function clamp(v, min, max)
export function lerp(a, b, t)
export function invLerp(a, b, v)
export function damp(current, target, lambda, dt)   // exp smoothing: lerp(c,t,1-exp(-lambda*dt))
export function disposeScene(root)  // traverse: geometry.dispose(), material(s).dispose(), texture dispose
```
No Three import needed (duck-typed traversal via root.traverse).

## src/core/input.js  (owner: A)
```js
export class Input {
  constructor(canvas)
  state = { moveX, moveZ,          // -1..1; moveZ +1 = forward, moveX +1 = right
            lookDX, lookDY,        // radians accumulated this frame
            fire, ads, sprint,     // booleans (held; ads is TOGGLED on touch backend)
            jumpPressed, reloadPressed, fireModePressed, interactPressed, pausePressed }
  isTouch                          // true if primary input is touch
  setGameplayMode(on)              // on: canvas requests pointer lock on click (desktop) / shows nothing extra
  onPauseRequest = null            // callback; fired on Esc / pointer-lock loss / touch pause btn
  endFrame()                       // zero lookDX/DY and all *Pressed flags — main loop calls after update
  dispose()
}
```
Desktop: WASD+arrows, Shift=sprint, Space=jump, R=reload, X=fire mode, F or E=interact,
LMB hold=fire, RMB hold=ads, Esc via pointerlockchange → onPauseRequest. Sensitivity 0.0023 rad/px
× settings.sens.

## src/core/touchControls.js  (owner: A)
```js
export class TouchControls {
  constructor(rootEl, inputState, settingsGetter)  // writes into the SAME state object
  show(); hide(); dispose()
}
```
Left 40% of screen: dynamic joystick (appears at touch point, radius 60 px → moveX/moveZ).
Rest: look-drag (0.004 rad/px × settings.touchSens). DOM buttons bottom-right: FIRE (big),
ADS (toggle), RELOAD, JUMP; top-right: PAUSE, MODE. Track by `touch.identifier` (multi-touch:
move+look+fire simultaneously). All handlers `{passive:false}` + preventDefault.

## src/core/screens.js  (owner: A)
```js
export class Screen {
  scene = null; camera = null;      // manager renders these if both set
  async enter(ctx, params) {}
  update(dt) {}
  exit() {}                          // MUST dispose scene + remove own DOM + unbind listeners
  onResize(w, h) {}                  // default: update camera aspect if PerspectiveCamera
}
export class ScreenManager {
  constructor(ctx)                   // ctx = { renderer, input, audio, save, manager: <set by ctor> }
  register(name, screenInstance)
  async goTo(name, params)           // exits current (disposeScene via screen.exit), enters next
  update(dt)                         // active.update(dt); then renderer.render if scene+camera
  onResize(w, h)
}
```
Screen names: `"menu" | "builder" | "rangeSelect" | "staticRange" | "course"`.

## src/core/save.js  (owner: A)
```js
export const save = {
  loadBuilds(): Build[],  saveBuilds(arr),
  loadLastBuild(): Build|null,  saveLastBuild(build),
  loadBestTimes(): { course: { global: {time,buildName,date}|null, byBuild: {[name]:number} } },
  saveBestTimes(obj),
  getSettings(): {sens:1, touchSens:1, volume:0.8},  saveSettings(patch),
}
```

## src/core/audio.js  (owner: A)
```js
export const audio = {
  init(),                       // create/resume AudioContext — main.js calls on first pointerdown/touchend
  play(name, opts = {})         // names: "shot","shotSuppressed","shotHeavy","dry","reload",
                                //        "hit","hitmarker","ding","popup","fall","explosion",
                                //        "uiClick","beep","finish"
  setVolume(v)
}
```
All synthesized (oscillators + noise buffers), no assets. Must be safe to call before init (no-op).

## src/main.js  (owner: A)
Bootstrap: renderer (antialias, `setPixelRatio(Math.min(devicePixelRatio, 1.75))`), Input, ScreenManager,
registers all 5 screens (import from ./screens/*.js — classes: MenuScreen, BuilderScreen,
RangeSelectScreen, StaticRangeScreen, CourseScreen), starts at "menu".
Loop: `dt = Math.min(clock.getDelta(), 0.05); manager.update(dt); input.endFrame();`
Resize via window.resize + visualViewport.resize. audio.init on first gesture.

## index.html + style.css  (owner: A)
- import map (three 0.165.0), `<canvas id="game">`, `<div id="ui"></div>`, `<div id="touch"></div>`,
  `<script type="module" src="./src/main.js">`. ALL paths relative (`./`).
- viewport meta: `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`.
- CSS: canvas fixed fullscreen; `#ui` overlay 100dvh, safe-area-inset padding; `touch-action:none`
  and `-webkit-user-select:none` on canvas/#touch; block gesturestart in JS. Clean stylized UI
  (dark theme, accent color #ffb347). Class prefix `gb-`.

---

## src/data/stats.js  (owner: B)
```js
export const STAT_DEFS  // { [stat]: {label, unit, min, max, lowerIsBetter, format(v)=>string, showInPanel:bool} }
export function composeStats(build): Stats   // (base + Σadd) × Π(1+mult), then clamp; merges tags
export function diffStats(a, b): { [stat]: {from, to, better:bool|null} }  // only changed stats
```

## src/data/parts.js  (owner: B)
```js
export const SLOTS = ["receiver","barrel","muzzle","optic","mag","stock","grip","underbarrel","laser","ammo"]
export const PARTS  // { [id]: Part }
export const PARTS_BY_SLOT  // { [slot]: Part[] }
export const DEFAULT_BUILD  // the AX-4 baseline build object (name "AX-4 Standard")
```
Part shape:
```js
{ id, slot, name, blurb /*≤6 words*/, sizeClass /*"light"|"medium"|"heavy" — receivers, barrels,
  stocks, mags, underbarrel*/, tags: [],
  // receivers only:
  base: {<full stat set>}, caliberFamily: "pistol"|"rifle"|"shell"|"exotic",
  slotsAllowed: { stock:false, underbarrel:false, ... } /*only list forbidden ones*/,
  // non-receivers:
  add: {stat: flat}, mult: {stat: fraction e.g. -0.15},
  // ammo only:
  ammo: { tracer: 0xffcc55, tracerAlpha: 1, families: ["pistol","rifle","shell","exotic"],
          explosive: {radius:2.5, damage:25}|undefined, incendiary: {dps:5, duration:3}|undefined,
          rpmCap: number|undefined } }
```
NO Three.js imports in data/.

## src/data/compat.js  (owner: B)
```js
export function isCompatible(receiverId, slot, partId): {ok:true} | {ok:false, reason:string}
export function sanitizeBuild(build): build   // drop incompatible → null or slot default; returns {build, dropped:[names]}
```
Rules: size within 1 step of receiver; receiver slotsAllowed masks; tag rules
(brl_suppressed tag "integral-suppressor" blocks muzzle slot; mzl_choke requires receiver tag
"shotgun"; mag_drum needs receiver size ≥ medium; mag_belt needs heavy; stk_* blocked when
slotsAllowed.stock===false); ammo family must include receiver caliberFamily.

---

## src/gun/partMeshes.js  (owner: C)
```js
export function makePartMesh(partId): { object: THREE.Object3D, sockets: { [name]: THREE.Object3D } }
export const gunMaterial  // shared MeshLambertMaterial({vertexColors:true})
```
Receiver sockets (as allowed): `barrel, mag, stock, grip, optic, underbarrel, laser`.
Barrel sockets: `muzzle` (at tip, -Z end). Optic sockets: `eye` (an Object3D on the sighting axis,
where the camera should align during ADS). Receivers also expose `eye` for iron-sight fallback.
Scale guide: receiver body ≈ 0.28–0.45 m long, 0.06–0.08 wide, 0.10–0.16 tall; pistol smaller.
2–6 primitives per part merged into ONE geometry (vertex colors for flat multi-tone look).

## src/gun/gunFactory.js  (owner: C)
```js
export function buildGunMesh(build): THREE.Group
// group.userData = { muzzleTip: Object3D (deepest muzzle point: muzzle device tip else barrel tip),
//                    eyePoint: Object3D (optic's eye socket), build }
export function disposeGun(group)
```
Assembly: parent part objects into receiver sockets; barrel's `muzzle` socket receives the muzzle
device; optic goes on `optic` socket; laser adds a thin additive beam mesh (visible when hip firing —
toggled by viewmodel via `group.userData.setLaser(on)` you provide).

## src/gun/viewmodel.js  (owner: C)
```js
export class ViewModel {
  constructor(camera, build)      // builds gun, parents to camera
  setADS(amount)                  // 0..1: lerp hip pos (0.17,-0.15,-0.35) → eyePoint aligned to (0,0,-z)
  kick(intensity)                 // per-shot back-kick + rotation spring
  setSprint(amount)               // 0..1 lowered/tilted pose
  update(dt)
  getMuzzleWorld(outV3): outV3
  dispose()
}
```

## src/gun/weapon.js  (owner: C)
```js
export class Weapon {
  constructor(build, deps)
  // deps = { projectiles, audio, hud,
  //          getMuzzleWorld(out:V3),         // from viewmodel
  //          getAimRay(outOrigin:V3, outDir:V3),  // camera center ray
  //          onRecoil(vDeg, hDeg), onShot() }
  stats; build; ammoInMag; fireMode; adsAmount /*0..1*/; reloading /*bool*/
  update(dt, { wantFire, wantADS, wantReload, wantModeToggle, sprinting, moving })
  refill()      // mag to full instantly (ammo crate)
  reset()
  dispose()
}
```
Fire when: interval 60/fireRate elapsed, not reloading, not sprint-locked (0.15 s after sprint end),
mag > 0 (else `audio.play("dry")` once per press). Semi = one shot per press. On shot: compute
spread = lerp(spreadHip, spreadAds, adsAmount) (lasers already reduce spreadHip via stats), call
`projectiles.spawn(shot)` (see contract below), onRecoil(recoilV, ±recoilH·rand), onShot(),
audio shot variant (suppressed / heavy for damage≥60), hud.setAmmo. Auto-reload prompt: hud message
when empty. ADS: adsAmount moves toward target at 1/adsTime per second. Ammo rpmCap clamps fireRate.

---

## src/game/playerController.js  (owner: D1)
```js
export class PlayerController {
  constructor(camera, { input, colliders /*THREE.Box3[]*/, spawn: {position:V3, yaw} })
  update(dt, { mobility = 1, adsAmount = 0, adsZoom = 1 })
  addRecoil(vDeg, hDeg)            // separate accumulator layered on aim, damped by recoilRecoveryDegS
  recoilRecoveryDegS = 20          // weapon-screen sets from stats
  teleport(position, yaw)
  position   // THREE.Vector3 (feet)
  isSprinting; isMoving; onGround
  dispose()
}
```
Walk 4.8, sprint 7.2 (sprint only when moveZ > 0.5 and sprint held; ADS cancels sprint), ADS move
×0.5, all × mobility. Jump 4.6 m/s, g 14. Exp-damp accel (λ≈12 ground, 3 air). Capsule radius 0.35 vs
Box3 colliders: resolve horizontal push-out per axis, land on top faces. FOV: base 75 →
`75 * lerp(1, adsZoom, adsAmount)`, +4 while sprinting, damped. camera.rotation order "YXZ".

## src/game/projectiles.js  (owner: D2)
```js
export class ProjectileSystem {
  constructor(scene, { effects, hud, audio })
  setHittables(list)   // see Hittable below
  spawn(shot)
  // shot = { origin:V3, dir:V3 (normalized), spreadDeg, pellets, velocity, damage,
  //          falloffStart, falloffEnd, falloffMult:0.4, penetration, ammo /*ammo part's .ammo object + id*/ }
  update(dt)
  clear(); dispose()
}
```
Pool 192. Integration with substep if `dist/step > 20 m`. Segment raycast prevPos→pos vs hittable
object3Ds (single shared Raycaster, `raycaster.set`, far = segLen). Damage falloff by cumulative
traveled distance. On hit call `h.onHit(info)`; if `info.damage > 0 && result.showNumber !== false`
→ `effects.damageNumber(point, dmgRounded, result.crit)` and `hud.hitmarker(result.crit)`;
`result.sound` → audio.play(sound). Penetration: if `result.stopped` and
`proj.pen >= (h.penetrationCost ?? 1)` → subtract, nudge 0.05 m past, continue; else kill.
Explosive ammo: on ANY stop, AoE `ammo.explosive.radius` sphere vs hittables (`h.center()` if
provided else Box3 center of object3D), apply `ammo.explosive.damage` via onHit (no falloff),
`effects.explosion(point, radius)`, audio "explosion". Incendiary: pass `ammo.incendiary` in info —
targets apply DoT themselves. Kill at 3 s / 500 m / y < -2.
**Tracers: ONE THREE.LineSegments**, preallocated 192×2 position+color BufferAttributes rewritten
each frame (segment = pos → pos - vel·0.012, per-ammo color), additive blending, transparent.

Hittable interface (implemented by targets + walls):
```js
{ object3D,                       // raycast target (mesh or group)
  penetrationCost,                // 1 = solid wall, 0.5 = thin wall, 0.4 = soft target
  center()?,                      // optional V3 for AoE tests
  onHit(info) => { stopped:bool, damage?:number /*actually dealt*/, crit?:bool,
                   showNumber?:bool, sound?:string }
  // info = { point:V3, damage:number /*post-falloff*/, distance, ammo, incendiary? } }
```

## src/game/targets.js  (owner: D2)
```js
export class RingTarget   { constructor({position, yaw})  }          // 3 nested rings, bullseye ×2 crit, never dies
export class SteelPlate   { constructor({position, yaw}) }           // swings on hit (tween), sound "ding"
export class PopUpTarget  { constructor({position, yaw, hp=60, noShoot=false, triggerZone:THREE.Box3}) }
   // states "down"|"up"|"fallen"; rises (0.25s hinge) when player in triggerZone; head box ×1.8 crit;
   // falls at hp≤0 (sound "fall"); noShoot = white, wasShot flag for penalties. onFall = null (callback)
export class MoverTarget  { constructor({position, yaw, axis:V3, range, speed, hp=60}) } // sine slide, pop-up style HP
export class ThinWall     { constructor({position, size:V3, yaw}) }  // penetrationCost 0.5, visible panel
```
All expose: `.group` (add to scene), `.hittables: Hittable[]`, `.update(dt, playerPos)`, `.reset()`.
Incendiary DoT: targets with hp tick `info.incendiary` themselves (orange emissive tint while burning).
Low-poly: boxes/cylinders, vertex colors ok, silhouettes tan `0xd8c49a`, no-shoot white, plates gray.

## src/game/effects.js  (owner: D2)
```js
export class Effects {
  constructor(scene)
  damageNumber(pos, amount, crit)   // pooled 24 canvas-sprite digits, float 0.6m + fade 0.7s, crit = bigger/yellow
  hitSpark(pos)                     // small pooled additive sprite burst
  muzzleFlash(worldPos, dir)        // brief additive quad/cone, 40ms
  explosion(pos, radius)            // expanding fading sphere 0.15s
  update(dt); dispose()
}
```

## src/game/hud.js  (owner: D1)
```js
export class HUD {
  constructor(uiRoot)
  mount(isTouch); unmount()
  setAmmo(inMag, magSize); setFireMode(str); setBuildName(str)
  setCrosshairSpread(deg, adsAmount)   // px expansion; hide crosshair fully when adsAmount>0.8 & optic zoom<0.5
  hitmarker(crit)
  setTimer(seconds|null)               // null hides; format M:SS.mmm
  setObjective(text|null)              // top-center line (course prompts)
  setLaneInfo(text|null)               // "34 dmg @ 48m · 0.21s flight" bottom-left
  showMessage(text, ms=2000)
  showInteractPrompt(text|null)        // "E — Refill ammo" / tap button on touch
  showPause({title, onResume, onRetry, onBuilder, onMenu}); hidePause()
  showFinish({time, best, isNewBest, penalties, onRetry, onBuilder, onMenu})
  dispose()
}
```
ADS: when aiming with zoom ≤ 0.45 optics show a simple DOM scope vignette (circle + crosshair).

---

## src/world/rangeStaticWorld.js  (owner: E)
```js
export function createStaticRangeWorld(): {
  group, colliders: THREE.Box3[],  wallHittables: Hittable[],  // walls/floor stop bullets, cost 1
  targets: Target[],               // all RingTargets/SteelPlates placed
  spawn: {position:V3, yaw},
  ammoCrate: {position:V3, radius:1.5},
  dispose() }
```
Covered firing line (roof + posts + bench boxes), 4 lanes; ring target + steel plate at 10/25/50/100 m
lines; distance signboards using runtime CanvasTexture (one canvas per distance, shared);
low fence sides, sky handled by scene.background gradient color + fog. Sun: 1 directional + hemisphere.
Merged static geometry ⇒ < 20 draw calls.

## src/world/courseWorld.js  (owner: E)
```js
export function createCourseWorld(): {
  group, colliders, wallHittables, targets,
  spawn: {position:V3, yaw},
  startGate: THREE.Box3, finishPad: THREE.Box3,
  mandatoryTargets: number,        // count of non-noShoot pop-ups+movers
  dispose() }
```
Layout: start box → gate posts (Box3 trigger) → corridor (3 pop-ups) → left room (4 pop-ups, one
behind a ThinWall) → hallway (2 MoverTargets) → final room (5 pop-ups incl. 2 noShoot) → finish pad
(green). Walls 3 m tall, colliders everywhere the player shouldn't leave.

---

## src/screens/*.js  (owner: F) — classes: MenuScreen, BuilderScreen, RangeSelectScreen, StaticRangeScreen, CourseScreen

All extend Screen. ctx = { renderer, input, audio, save, manager }.

- **MenuScreen**: title "GUNBUILDER", buttons Build / Range (uses lastBuild or DEFAULT_BUILD),
  slowly rotating gun (buildGunMesh(lastBuild||DEFAULT_BUILD)) as 3D backdrop, VERSION footer.
- **BuilderScreen** `enter(ctx, {build?})`: OrbitControls around gun at origin (min/max distance,
  damping); rebuild gun mesh on part change (dispose old). Bottom: category tab row (SLOTS order);
  above it horizontal scroll of part cards (name + blurb; selected highlighted; incompatible greyed
  with reason subtext, still tappable to read reason but not equip). Stat panel: right column
  (desktop ≥900px) / toggleable drawer (mobile) — rows: label, bar (normalized to STAT_DEFS min/max),
  value. Click/tap on a compatible card EQUIPS IMMEDIATELY (sanitizeBuild after EVERY equip,
  toast dropped parts); incompatible cards toast the reason. Desktop mouse hover previews
  diffStats as colored ▲▼ deltas (green=better via lowerIsBetter). The mobile stat drawer
  (max 45dvh, inner .gb-stat-body scroller — the panel itself must be overflow:hidden or
  Chromium paints a white composited-scroll artifact) opens ONLY via the STATS toggle.
  Header: name input, Save, Load (list w/ delete), "TEST →" → rangeSelect.
  Nullable slots get a "None" card.
- **RangeSelectScreen** `enter(ctx, {build})`: two big cards — "Test Lanes" / "Clearing Course"
  (+ best time shown), build summary line, Back.
- **StaticRangeScreen** `enter(ctx, {build})`: wires world + PlayerController + ViewModel + Weapon +
  ProjectileSystem (hittables = wallHittables + all target hittables) + Effects + HUD.
  Update order: controller.update → viewmodel (setADS(weapon.adsAmount), setSprint, update) →
  weapon.update (wantFire=input.state.fire etc.) → projectiles.update → targets.update →
  effects.update → hud (laneInfo from last projectile hit: ProjectileSystem exposes
  `lastHitInfo = {damage, distance, flightTime}|null`). Ammo crate: within radius → interact prompt,
  interactPressed → weapon.refill(). Pause via input.onPauseRequest → hud.showPause (dt gated 0
  while paused). Recoil: weapon deps.onRecoil → controller.addRecoil; controller.recoilRecoveryDegS =
  stats.recoilRecovery.
- **CourseScreen**: same wiring + state machine: "ready" (objective "Cross the gate to start — R to
  reset") → gate Box3 containsPoint(player) → "running" (timer up, hud.setTimer) → finish pad while
  running → "finished": penalties = missed mandatory ×5 s + noShoot wasShot ×3 s; final = elapsed +
  penalties; save best (global + byBuild via save.loadBestTimes); hud.showFinish. R (reloadPressed
  at "ready"… use a dedicated retry: pause menu Retry + finish screen Retry + holding R for 1 s)
  resets: targets.reset(), teleport spawn, state "ready".

Add `lastHitInfo` to ProjectileSystem (owner D2): `{ damage, distance, flightTime }` updated on
every damaging hit, plus `onAnyHit` optional callback.

## Update/render loop ownership
main.js drives `manager.update(dt)`. Gameplay screens gate their internal updates with a `paused`
flag but still render. All screens null out scene/camera and call disposeScene + their world/system
dispose() in exit().
