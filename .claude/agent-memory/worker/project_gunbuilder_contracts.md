---
name: project-gunbuilder-contracts
description: Gunbuilder is a multi-agent build against a binding CONTRACTS.md spec — file ownership is split by directory/owner letter
metadata:
  type: project
---

Gunbuilder (3D gun-builder browser game, Three.js, plain ES modules, no bundler,
GitHub Pages) is built by several concurrent agents, each owning a disjoint set of
files, all implementing exactly `CONTRACTS.md` at the project root (binding interface
spec — exact export names/signatures/behaviors).

Ownership split (as of 2026-07-02, first build pass):
- Owner A (core/bootstrap): index.html, style.css, src/version.js, src/main.js,
  src/core/utils.js, src/core/input.js, src/core/touchControls.js,
  src/core/screens.js, src/core/save.js, src/core/audio.js.
- Owner B: src/data/stats.js, src/data/parts.js, src/data/compat.js.
- Owner C: src/gun/partMeshes.js, src/gun/gunFactory.js, src/gun/viewmodel.js,
  src/gun/weapon.js.
- Owner D1: src/game/playerController.js, src/game/hud.js.
- Owner D2: src/game/projectiles.js, src/game/targets.js, src/game/effects.js.
- Owner E: src/world/rangeStaticWorld.js, src/world/courseWorld.js.
- Owner F: src/screens/*.js (MenuScreen, BuilderScreen, RangeSelectScreen,
  StaticRangeScreen, CourseScreen).

**Why:** Because ownership is split, verification for any single agent's slice is
limited to `node --check` syntax checks on owned files — cross-file integration
(e.g. does BuilderScreen's DOM actually match style.css class names) can't be
verified until all owners finish, since most imported files don't exist yet while
any one owner works.

**How to apply:** When picking up further Gunbuilder work, re-read CONTRACTS.md
first — it is the single source of truth and overrides assumptions from any one
owner's file. Check which files already exist (`git status` / directory listing)
before assuming a fresh slate; other owners' agents may run concurrently.

Key global conventions worth remembering across sessions:
- localStorage keys: `gunbuilder.v1.builds`, `gunbuilder.v1.bestTimes`,
  `gunbuilder.v1.settings`, `gunbuilder.v1.lastBuild` — all access wrapped in
  try/catch (implemented in src/core/save.js).
- Class prefix `gb-` for all CSS; accent color `#ffb347`; dark theme.
- Site serves from a `/gunbuilder/` subpath on GitHub Pages — all asset paths in
  index.html/JS must be relative (`./`), never absolute.
- Three.js pinned at 0.165.0 via jsdelivr import map (both `three` and
  `three/addons/` keys required).
- Verification command used for plain ES module syntax (no bundler, so imports to
  not-yet-existing sibling files are expected and fine): copy file to a temp path
  and run `node --check` on it — this parses without resolving imports.

See [[gunbuilder-core-module-notes]] for implementation-level notes on the owner-A
modules (Input/TouchControls wiring, audio synthesis approach, etc.).
