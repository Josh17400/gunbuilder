---
name: visual-pass-aces-skybits
description: Renderer runs ACES tone mapping (exposure 1.15); all scene light rigs are tuned FOR it — plus skybits.js helpers and empirical ACES tuning findings
metadata:
  type: project
---

The 2026-07-02 visual pass set `renderer.toneMapping = ACESFilmicToneMapping; toneMappingExposure = 1.15` in main.js. Every screen's lights are tuned against that curve; `src/world/skybits.js` provides `makeSkyDome` (unlit inverted sphere, vertex-color gradient, `fog:false`), `makeBlobShadow`/`makeBlobShadows` (shared radial CanvasTexture; per-world shadows merged into ONE mesh), and `makeGroundPatches` (vertex-colored thin boxes pushed into each world's static merge list → zero extra draw calls).

**Why:** hard-won empirical findings that contradict common guidance:
- "ACES darkens mids, raise intensities 1.3-1.6×" was WRONG here — three r165 ACES at exposure 1.15 roughly preserves mid brightness. A 1.3× raise washed the zombies arena pink; final values are only ~1.05-1.4× the pre-ACES rig (zombies ended at hemi 1.5/sun 1.8 vs original 1.5/1.6).
- Sky dome gradient exponents must account for VISIBLE sky elevation: the range's roof caps sky at ~30°, so exponent had to drop to 0.5 before any blue showed (f = t^exp; smaller exp pulls the top color down to the horizon).
- The shared blob CanvasTexture survives `disposeScene` across screen transitions (three re-uploads a texture whose image is still alive) — verified menu→builder→range in one session.

**How to apply:** when touching any scene's lighting or `scene.background`, keep the dome-horizon = fog color = background invariant, retune under ACES by screenshot (scratchpad `visual.mjs` rig captures all 5 modes + `renderer.info.render.calls`), and don't trust Read's downscaled screenshot rendering for subtle ground tints — pixel-sample with System.Drawing.GetPixel before "fixing" something that isn't broken.
