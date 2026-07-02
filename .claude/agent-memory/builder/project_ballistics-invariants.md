---
name: ballistics-invariants
description: Non-obvious invariants in the D2 ballistics modules (projectiles/targets/effects) that other module owners must respect
metadata:
  type: project
---

Explosive AoE in `ProjectileSystem._explode` only applies to hittables that expose a `center()` function.
**Why:** CONTRACTS.md says "h.center() if provided else Box3 center", but the orchestrator's brief mandated "don't AoE walls" and multi-hittable targets (PopUp/Mover expose torso+head as two hittables) must not take double splash. Gating on `center()` solves both: all target classes give ONLY their torso/primary hittable a `center()`; walls and head-hittables omit it.
**How to apply:** If world owners (rangeStaticWorld/courseWorld walls) or new targets add `center()` to a wall-like hittable, it will start taking explosive splash. Conversely a new damageable target MUST provide `center()` on exactly one of its hittables to receive AoE.

Related: onHit result objects (`_hitResult`, `INERT_RESULT` in targets.js) and `_info`/`lastHitInfo` in projectiles.js are shared/reused objects — read immediately, never retain across frames. This is the zero-allocation convention for the 60fps iPhone target.
