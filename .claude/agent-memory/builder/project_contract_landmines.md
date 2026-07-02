---
name: gunbuilder-contract-landmines
description: Known ambiguities/gaps in CONTRACTS.md found while building the screens layer (2026-07-02)
metadata:
  type: project
---

Gunbuilder is built by parallel agents, each owning modules per CONTRACTS.md; the screens layer (src/screens/*) was written against the contract before most other modules existed.

**Why:** the contract has gaps that only surface at integration; these were handled defensively in the screens and must be re-checked once all modules land.

**How to apply:** when integrating/debugging Gunbuilder, check these first:
- `sanitizeBuild` contract is self-contradictory: signature says "returns build", description says returns `{build, dropped}`. builderScreen handles both shapes.
- TouchControls DOES have a USE button now (bound to `interactPressed`; the old note that it lacked one is obsolete). Critically: `#touch` (z-index 30) holds a fullscreen `.gb-touch-surface` with pointer-events:auto ABOVE `#ui` (z-index 10), so NO #ui element is tappable during touch gameplay — staticRange's touch "REFILL AMMO" button and HUD showInteractPrompt onTap are unreachable; route touch interactions through `interactPressed`/touch-cluster buttons (zombiesScreen does). Overlays (pause/game-over) are tappable only because screens call `setGameplayMode(false)` first, which hides #touch.
- hud.js's toast must NOT use class `gb-toast`: style.css's `.gb-toast` (builder/menu toasts) pins `bottom:`, which combined with the HUD toast's inline `top:30%` stretched it into a giant dark column over the HUD (found 2026-07-02 in zombies screenshots; had silently affected every gameplay toast). Renamed to `gb-hud-toast`.
- HUD fullscreen overlays reuse class `gb-pause` without the `.gb-panel` wrapper style.css expects, so `.gb-pause .gb-btn { width:100% }` renders their buttons full-bleed on desktop. Consistent across pause/finish/mission/game-over — a global polish item; don't fix in just one overlay.
- Lighting ownership is doubled: world contract says static-range world includes "Sun: 1 directional + hemisphere", but the screens brief says screens own lights. Screens add lights; if worlds also do, scenes will be double-lit.
- `hud.showFinish({penalties})` shape undefined — screens pass total penalty seconds as a number.
- Screens assume #ui children control pointer-events (screen roots use pointer-events:none + auto on interactive children) so OrbitControls on the canvas works under the builder UI.
- CONTRACTS.md still specifies the builder's touch flow as "first-tap previews, second tap equips" — this was DELIBERATELY replaced (2026-07-02, user request) with one-tap equip + STATS-toggle-only drawer. The contract text is stale on this point; don't "fix" the screen back to spec. See [[webgl-overlay-compositing-landmine]] for why the drawer is structured panel(clip)/body(scroll).
- `projectiles.onAnyHit(info, result)` does NOT pass the hittable, and info/result objects are reused (never retain). Mission hit-identity works by the screen wrapping each target hittable's onHit to stamp `screen._hitOwner = h.owner` (owner tagged in the screen, per contract) — onAnyHit fires synchronously right after onHit in the same stack, so the stamp is safe. Pattern lives in staticRangeScreen; src/screens/missionShared.js holds the shared XP/level/next-mission plumbing.
- Screens load progression.js via dynamic import in enter() (missionShared.loadProgression) with graceful degradation, because the module was authored concurrently — a static import would have made the whole app unbootable until it landed. If that ever feels like dead weight, it's also the reason a broken progression.js can't take down the menu/builder.
- CourseScreen `_retry` originally never called `hud.hideFinish()` — Retry from the finish overlay left it covering the screen. Fixed 2026-07-02 during mission integration.
- Addendum v3 `getLevel(xp)` — contract comment says "toNext = xp needed for next level" but the implementation returns XP *remaining* (xpForLevel(level) - total), NOT the level's span. Any "into / span" UI (XP bars) must use `into + toNext` as the denominator; careerScreen does. Also `toNext = 0` at MAX_LEVEL — guard division.
- Addendum v3 doesn't pin the shape of `save.loadProgress().missions[id]` (bare star count vs `{stars}`); careerScreen's `starsOf()` accepts both — keep writers consistent with whatever the missions-integration agent picked.
- careerScreen/menuScreen use STATIC imports of progression.js (landed before their verification ran), unlike staticRange/course which dynamic-import via missionShared — divergence is deliberate: menu/career are meaningless without progression data anyway.
- Zombies mode (Addendum v4, built 2026-07-02): zombiesWorld is pure geometry like the other worlds — zombiesScreen MUST add dusk lighting or the arena is near-black. Verified-good rig: `HemisphereLight(0x9fa4cc, 0x4a4038, 1.5)` + `DirectionalLight(0xffa666, 1.6)` at (-30,16,12), `scene.fog = Fog(0x2b2433, 28, 85)`, background 0x2b2433. Also: `ZombieSystem.aliveCount` = active + still-queued (wave ends at aliveCount===0; no separate queue check needed, though `queuedCount`/`activeCount` getters exist); zombie deps.audio is injected (system never imports audio.js); gate opening panels are solid colliders (player can't leave; zombies rise from the ground just inside them).
