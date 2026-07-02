// Base Screen class + ScreenManager that drives the active screen's
// update/render and hands off between named screens.

import * as THREE from "three";

export class Screen {
  scene = null;
  camera = null;

  async enter(ctx, params) {}

  update(dt) {}

  // Subclasses MUST dispose their scene, remove their own DOM, and unbind
  // any listeners they registered.
  exit() {}

  onResize(w, h) {
    if (this.camera && this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
}

export class ScreenManager {
  constructor(ctx) {
    this.ctx = ctx;
    ctx.manager = this;
    this.screens = new Map();
    this.active = null;
    this.activeName = null;
  }

  register(name, screenInstance) {
    this.screens.set(name, screenInstance);
  }

  async goTo(name, params) {
    const next = this.screens.get(name);
    if (!next) {
      console.error(`ScreenManager: unknown screen "${name}"`);
      return;
    }

    if (this.active) {
      try {
        this.active.exit();
      } catch (err) {
        console.error(`ScreenManager: error exiting screen "${this.activeName}"`, err);
      }
    }

    this.active = next;
    this.activeName = name;

    try {
      await next.enter(this.ctx, params);
    } catch (err) {
      console.error(`ScreenManager: error entering screen "${name}"`, err);
    }

    // Ensure the newly entered screen's camera matches current viewport
    // immediately rather than waiting for the next resize event.
    const canvas = this.ctx.renderer && this.ctx.renderer.domElement;
    const w = (canvas && canvas.clientWidth) || window.innerWidth;
    const h = (canvas && canvas.clientHeight) || window.innerHeight;
    try {
      next.onResize(w, h);
    } catch (err) {
      console.error(`ScreenManager: error resizing screen "${name}"`, err);
    }
  }

  update(dt) {
    if (!this.active) return;
    try {
      this.active.update(dt);
    } catch (err) {
      console.error(`ScreenManager: error updating screen "${this.activeName}"`, err);
    }
    if (this.active.scene && this.active.camera) {
      this.ctx.renderer.render(this.active.scene, this.active.camera);
    }
  }

  onResize(w, h) {
    if (!this.active) return;
    try {
      this.active.onResize(w, h);
    } catch (err) {
      console.error(`ScreenManager: error resizing screen "${this.activeName}"`, err);
    }
  }
}
