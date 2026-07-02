---
name: webgl-overlay-compositing-landmine
description: DOM overflow-y:auto scrollers layered over the #game WebGL canvas paint a white block (Chromium compositing); clip in a parent, scroll in a child
metadata:
  type: project
---

In Gunbuilder, a DOM panel with `overflow-y: auto` whose content actually overflows, positioned over the WebGL `#game` canvas, gets promoted to a composited scroll layer — and Chromium (seen under iPhone emulation, DSF 3, SwiftShader; likely also real devices) paints the layer's out-of-clip region as an opaque WHITE BLOCK adjacent to the panel (height = contentHeight − clipHeight). It is invisible to `elementFromPoint`/DOM inspection because it isn't an element — it only shows in the composited frame.

**Why:** cost a full diagnostic session on the builder stat drawer (2026-07-02): white rectangle floated above the drawer. Hiding canvas OR UI individually made it vanish; `contain: paint` and removing border-radius did NOT fix it; `overflow: hidden` did.

**How to apply:** any scrollable overlay above the canvas must be structured as an outer clipping container (`overflow: hidden`, e.g. `.gb-stat-panel`) with an inner scroller child (`.gb-stat-body`, `overflow-y: auto; min-height: 0; flex: 1`). Never make the visible panel itself the scroller. Also note: `.gb-toast` is opacity 0 without `.gb-show` — screens creating toasts manually must add both classes or the toast is invisible.
