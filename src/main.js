// Bootstrap: renderer, input, screen manager, and the main loop.

import * as THREE from "three";
import { Input } from "./core/input.js";
import { ScreenManager } from "./core/screens.js";
import { save } from "./core/save.js";
import { audio } from "./core/audio.js";

import { MenuScreen } from "./screens/menuScreen.js";
import { BuilderScreen } from "./screens/builderScreen.js";
import { RangeSelectScreen } from "./screens/rangeSelectScreen.js";
import { StaticRangeScreen } from "./screens/staticRangeScreen.js";
import { CourseScreen } from "./screens/courseScreen.js";

const canvas = document.getElementById("game");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

const input = new Input(canvas);

const ctx = { renderer, input, audio, save };
const manager = new ScreenManager(ctx); // ctx.manager = manager (set by ctor)

manager.register("menu", new MenuScreen());
manager.register("builder", new BuilderScreen());
manager.register("rangeSelect", new RangeSelectScreen());
manager.register("staticRange", new StaticRangeScreen());
manager.register("course", new CourseScreen());

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  manager.onResize(w, h);
}

window.addEventListener("resize", resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resize);
}
resize();

let audioStarted = false;
function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;
  audio.init();
}
window.addEventListener("pointerdown", startAudioOnce, { once: true });
window.addEventListener("touchend", startAudioOnce, { once: true });

manager.goTo("menu").catch((err) => {
  console.error("main: failed to enter initial screen", err);
});

// Debug handle (harmless in production, invaluable when poking at the live game)
window.__gb = { manager, input, renderer, audio };

const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  manager.update(dt);
  input.endFrame();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
