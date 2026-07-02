---
name: headless-verification-rig
description: How to execute/verify this no-bundler Three.js project's modules for real — Node smoke tests AND Playwright/Chromium visual tests (both proven working)
metadata:
  type: project
---

Gunbuilder has no bundler, no package.json, no tests — modules import bare "three" / "three/addons/" via the index.html import map, so Node can't run them in place and `node --check` (on a temp .mjs copy) only catches syntax.

**Why:** runtime failures (mergeGeometries attribute mismatches, socket math) and visual defects (part alignment, silhouettes) only surface on execution/render.

**How to apply:**
- **Node smoke tests:** stage a copy in the scratchpad: `smoke/package.json` with `{"type":"module"}`, `npm install three@0.165.0` there (three's exports map `three/addons/*` → `examples/jsm/*`, so import-map specifiers resolve unchanged), copy `src/` files preserving relative paths, stub cross-owner modules. Never npm-install in the repo. Three core runs fine in Node if you never render.
- **Visual verification (works!):** Playwright + Chromium live in the scratchpad. Launch with `args: ["--enable-unsafe-swiftshader"]` (software GL). Pattern: tiny node:http server serving the project root (plus `/__sp/*` → scratchpad for test pages) — see `ammobug.mjs` (drives the real app UI) and `magstock.mjs` + `magstock.html` (renders a labeled grid of gun builds via scissor viewports, one auto-fitted camera per cell, exposed as `window.renderCells(cells)`; supports per-cell view angle / zoom / focus point). Screenshot → Read the PNG → iterate on mesh code. One grid screenshot of many builds is far cheaper token-wise than per-build shots.
- Mesh landmine: mags bake a +0.1..0.12 forward cant into their geometry; receiver mag sockets are Object3Ds, so per-receiver orientation fixes go on the socket (e.g. rcv_pistol sets `sockets.mag.rotation.x = -0.35` for a net -0.25 matching its grip rake).
- `meshgrid.mjs` + `meshgrid.html` (scratchpad) supersede magstock for part-mesh sweeps: same scissor-grid pattern plus per-cell triangle counts and `part:` cells that render a single `makePartMesh` id (ammo displays, parts not yet in parts.js). Landmine: laser parts carry an invisible 30m beam mesh — `Box3.setFromObject` includes invisible meshes, so auto-fit cameras zoom out to nothing; fit by unioning only `o.visible` mesh bounds (meshgrid.html does this).
- Sub-pixel alignment checks (e.g. iron-sight tips vs screen center): don't eyeball screenshots — probe pixels with PowerShell `System.Drawing.Bitmap.GetPixel` (scan a column for first dark row). Eyeballing a 3x crop misjudged a perfectly-centered sight by "10px". Also: Playwright page keeps localStorage across `goto`s, so `gunbuilder.v1.lastBuild` persists between test flows — reset it or account for it.
