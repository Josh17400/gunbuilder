# Memory index

- [Gunbuilder contract landmines](project_contract_landmines.md) — CONTRACTS.md gaps found while building screens; check at integration
- [Ballistics invariants](project_ballistics-invariants.md) — AoE gated on center() presence; reused onHit result/info objects (zero-alloc convention)
- [Headless verification rig](project_headless_verification.md) — Node smoke tests + Playwright/SwiftShader visual grid rig (magstock.mjs) for this no-bundler project
- [WebGL overlay compositing landmine](project_webgl_overlay_compositing.md) — scrollable DOM over #game canvas paints a white block; clip outside, scroll inside
- [ACES + skybits visual pass](project_visual_pass.md) — renderer uses ACES exp 1.15; rigs tuned for it; "raise 1.3-1.6×" was wrong here; visual.mjs rig
