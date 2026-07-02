---
name: project-gunbuilder-progression
description: Gunbuilder progression/career data layer (src/data/progression.js) — unlock table design and mission structure worth knowing before extending it
metadata:
  type: project
---

Built `src/data/progression.js` (Addendum v3) plus `save.loadProgress`/`save.saveProgress`
additions in `src/core/save.js` (key `gunbuilder.v1.progress`). See [[project_gunbuilder_data_layer]]
and [[project_gunbuilder_contracts]] for the surrounding conventions this follows.

**Why:** career mode needed XP curve, per-part unlock levels, and a 15-mission campaign, kept
data-only (no Three imports) like stats.js/parts.js/compat.js.

**Key design decisions (load-bearing for anyone editing this file later):**
- `xpForLevel(n) = round(400 * n^1.5)` is cumulative XP to have completed `n` levels (n=0 → 0).
  `getLevel(xp)` walks it; `toNext` is the *remaining* xp to next level (not the raw threshold).
- Level-1 base kit (always unlocked) is a fixed 10-part `BASE_KIT` Set internal to the module
  (not exported — contract only requires `isUnlocked`/`UNLOCK_LEVEL`/`unlocksAt`): rcv_pistol,
  rcv_ar, brl_standard, brl_carbine, opt_irons, mag_standard, mag_compact, stk_standard,
  grp_standard, amo_fmj. The other 64 of the 74 canonical part ids are in `UNLOCK_LEVEL`
  (levels 2-28), with every level 2-28 guaranteed ≥1 unlock. Receiver milestones are fixed
  spine values dictated by the brief (rcv_smg 2 ... rcv_minigun 28); everything else is
  hand-paced (see in-file comments) — amo_slug@5, amo_ap@9, amo_explosive@17, opt_8x@19 were
  brief-mandated exact levels.
- `MISSIONS` (15, Ironsight Proving Grounds / range master "Hale") alternate `mode:"lanes"`
  (objective type `hits`/`damage`, forced or free build) and `mode:"course"` (objective type
  `time`, no count field). Early missions use `forcedBuild` (full Build objects that must pass
  `sanitizeBuild` completely unchanged — verified in the test suite); later missions omit it for
  free-build. `stars` semantics differ by mode: time-mode stars are `[loosest,mid,tightest]`
  seconds (strictly decreasing, lower=better); hits/damage stars are spare-`timeLeft` thresholds
  (strictly increasing, `result.completed` gates any stars at all).
- Test suite lives at
  `C:\Users\joshu\AppData\Local\Temp\claude\...\scratchpad\progressiontest.mjs` (scratchpad is
  session-scoped/ephemeral — if it's gone, the assertions worth re-deriving are: no orphan/unknown
  part ids, every level 2-28 has ≥1 unlock, getLevel boundary/monotonic/cap behavior, mission
  shape + forcedBuild-passes-sanitizeBuild-unchanged, starsForResult edge cases incl.
  not-completed/negative/NaN/boundary-equality).
- NOT yet wired: `careerScreen.js`, HUD `showLevelUp`, builder-screen 🔒 lock gating, and the
  freeplay-course XP award formula (`max(50, round(500 - 5*seconds))`) — those are explicitly a
  separate "missions-integration agent" per CONTRACTS.md Addendum v3, not part of this file.
