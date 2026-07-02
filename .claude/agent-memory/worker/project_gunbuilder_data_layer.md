---
name: project_gunbuilder_data_layer
description: Design decisions baked into gunbuilder's src/data/{stats,parts,compat}.js — read before modifying the data layer
metadata:
  type: project
---

Gunbuilder (C:\Users\joshu\Documents\Claude Code\claude games\gunbuilder) is a plain-ES-module
3D gun builder game, no bundler. The binding spec is CONTRACTS.md at repo root — always read it
first, it is treated as authoritative and exact (export names, part ids, shapes).

**Data layer owner boundaries**: src/data/stats.js, src/data/parts.js, src/data/compat.js are one
owner's files (no Three.js imports allowed in any of them — pure data/math). Other owners (gun
meshes, game loop, screens) consume these but are out of scope for data-layer work.

**adsZoom mechanism**: every receiver's base.adsZoom is 1.0; each optic reaches its target zoom
via a flat `add.adsZoom` offset (opt_irons -0.15, opt_reddot -0.25, opt_holo -0.3, opt_4x -0.55,
opt_8x -0.7). No part ever uses mult.adsZoom — this was a deliberate "pick ONE mechanism" choice
per the brief (add, not mult) so there's exactly one place zoom values are set.

**composeStats formula**: `(base + Σadd) × Π(1+mult)`, then clamp per-stat. fireModes (array) is
copied straight from the receiver, not run through the numeric pipeline. `suppressed` (bool) is
derived by scanning all equipped parts' tags for "integral-suppressor" or id === "mzl_suppressor",
not composed numerically either. magSize and pellets are rounded to integers after composing.

**isCompatible cannot see cross-slot interactions**: the contract signature is fixed to
`isCompatible(receiverId, slot, partId)` — no build object. So the rule "brl_suppressed's
integral-suppressor tag blocks the muzzle slot" (a barrel-vs-muzzle interaction) can NOT be
implemented inside isCompatible; it's enforced only in sanitizeBuild, which does have the full
build and nulls out build.muzzle after the barrel is finalized. Any future cross-slot rule added
to isCompatible's rule list needs the same treatment — check if the rule needs another part's ID
beyond receiver+target part; if so it belongs in sanitizeBuild, not isCompatible.

**sanitizeBuild fill order**: barrel → optic → mag → grip → ammo (required slots), then a final
pass nulls the muzzle if the finalized barrel carries "integral-suppressor". Nullable slots
(muzzle, stock, underbarrel, laser) are only ever nulled on incompatibility, never auto-filled.

**mag_drum/mag_belt have stricter minimums than the generic ±1 sizeClass-step rule**: mag_drum
needs receiver sizeClass ≥ medium (a light receiver would otherwise pass the generic 1-step
check but is explicitly excluded), mag_belt needs sizeClass === heavy exactly. These are
special-cased by partId in isCompatible, checked after the generic size-step check.

**Testing pattern used**: no test framework in the repo (plain ES modules, no bundler/npm). Data
layer was verified with a standalone node script using `file:///C:/...` absolute import URLs
(relative `../` paths from a scratch temp dir don't resolve across drives/paths with spaces —
must percent-encode spaces in the file:// URL, e.g. "Claude%20Code"). `node --check` for syntax,
then a scratch .mjs script asserting composeStats clamps, isCompatible rules, and
sanitizeBuild repair behavior. No existing test runner to mirror — this ad hoc approach is fine
for future data-layer changes too.
