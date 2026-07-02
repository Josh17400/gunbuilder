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

Raycast double-count landmine: `ProjectileSystem._raySegment` calls `intersectObjects(objects, recursive=true)`. If one registered hittable's object3D is a scene-graph DESCENDANT of another registered hittable's object3D, its triangles are intersected twice (once under the ancestor's traversal, once as itself) → onHit fires twice per bullet. zombies.js dodges this by parenting the skeleton bones to the zombie GROUP (not the SkinnedMesh), so the head mesh (child of the torso bone) is not a descendant of the body mesh. Any future multi-hittable rig must keep registered object3Ds ancestor-disjoint (targets.js torso/head are siblings for the same reason).

SkinnedMesh notes (zombies.js, three 0.165): raycast DOES respect bone poses (`getVertexPosition`), so posed hittables are hit where they appear — but set a generous `geometry.boundingSphere` AND `mesh.boundingSphere` manually (rest-pose auto bounds can sphere-cull posed limbs). Rigid per-box skinning (skinIndex = one bone, weight 1) + bones on the group gets a fully animated humanoid in ONE draw call per mesh; zombies are 2 draw calls each (body + separate head for the crit hittable).
