---
name: headless-verification-rig
description: How to actually execute/verify this no-bundler Three.js project's ES modules headlessly in Node (no browser available)
metadata:
  type: project
---

Gunbuilder has no bundler, no package.json, no tests — modules import bare "three" / "three/addons/" via the index.html import map, so Node can't run them in place and `node --check` only catches syntax.

**Why:** agents here can't open a browser; runtime failures (e.g. `mergeGeometries` attribute mismatches, socket math) only surface on execution.

**How to apply:** to smoke-test for real, stage a copy in the scratchpad: create `smoke/package.json` with `{"type":"module"}`, `npm install three@0.165.0` there (three's package exports map `three/addons/*` → `examples/jsm/*`, so import-map specifiers resolve unchanged), copy the `src/` files under test preserving relative paths, stub any cross-owner modules (e.g. `src/data/*`), and drive the API from a Node script asserting behavior. Keeps the project root clean (never npm-install in the repo). Three.js core + BufferGeometryUtils run fine in Node without a GL context as long as you never render.
