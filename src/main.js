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
import { CareerScreen } from "./screens/careerScreen.js";
import { ZombiesScreen } from "./screens/zombiesScreen.js";

const canvas = document.getElementById("game");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
// Filmic look: ACES compresses highlights and enriches saturated colors.
// Every screen's light intensities are tuned FOR this curve — if you change
// it, retune the scenes (ACES darkens mids; they run ~1.3-1.6× hotter).
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const input = new Input(canvas);

const ctx = { renderer, input, audio, save };
const manager = new ScreenManager(ctx); // ctx.manager = manager (set by ctor)

manager.register("menu", new MenuScreen());
manager.register("builder", new BuilderScreen());
manager.register("rangeSelect", new RangeSelectScreen());
manager.register("staticRange", new StaticRangeScreen());
manager.register("course", new CourseScreen());
manager.register("career", new CareerScreen());
manager.register("zombies", new ZombiesScreen());

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

// Version-skew guard: GitHub Pages caches files for ~10 min, so right after a
// deploy the browser can hold a mix of old and new files (this broke the
// builder UI once). If index.html's stamp disagrees with our VERSION, clear
// HTTP caches and reload — once per session to avoid a loop.
import("./version.js").then(({ VERSION }) => {
  const stamp = window.__buildStamp;
  if (!stamp || stamp === VERSION) return;
  console.warn(`version skew: html=${stamp} js=${VERSION}`);
  if (sessionStorage.getItem("gb-skew-reload")) return; // already tried
  try { sessionStorage.setItem("gb-skew-reload", "1"); } catch (_) {}
  const reload = () => location.reload();
  if (window.caches?.keys) {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(reload, reload);
  } else {
    reload();
  }
});

const clock = new THREE.Clock();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  manager.update(dt);
  input.endFrame();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
