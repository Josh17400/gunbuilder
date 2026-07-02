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
- TouchControls has NO interact button, but the static range ammo crate needs interact — staticRangeScreen adds its own "REFILL AMMO" DOM button on touch.
- Lighting ownership is doubled: world contract says static-range world includes "Sun: 1 directional + hemisphere", but the screens brief says screens own lights. Screens add lights; if worlds also do, scenes will be double-lit.
- `hud.showFinish({penalties})` shape undefined — screens pass total penalty seconds as a number.
- Screens assume #ui children control pointer-events (screen roots use pointer-events:none + auto on interactive children) so OrbitControls on the canvas works under the builder UI.
