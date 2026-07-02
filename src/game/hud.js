// Gameplay HUD — all DOM, built once inside the #ui root and re-shown per
// screen via mount()/unmount(). No per-frame allocations of DOM nodes;
// hot-path setters cache refs and only touch textContent/style on change.

import { clamp, lerp } from "../core/utils.js";

function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const secs = s - minutes * 60;
  return `${minutes}:${secs.toFixed(3).padStart(6, "0")}`;
}

function el(tag, className, cssText) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (cssText) node.style.cssText = cssText;
  return node;
}

function button(label, className = "gb-btn") {
  const b = el("button", className);
  b.type = "button";
  b.textContent = label;
  return b;
}

let stylesInjected = false;
function ensureInjectedStyles() {
  if (stylesInjected || document.getElementById("gb-hud-inline-styles")) {
    stylesInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = "gb-hud-inline-styles";
  style.textContent = `
    .gb-ammo-low { animation: gb-ammo-flash 0.5s ease-in-out infinite; }
    @keyframes gb-ammo-flash { 0%, 100% { color: #ff4b4b; } 50% { color: #ffb0b0; } }
    .gb-hud-toast { transition: opacity 200ms ease, transform 200ms ease; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

export class HUD {
  constructor(uiRoot) {
    ensureInjectedStyles();
    this.uiRoot = uiRoot;
    this._isTouch = false;
    this._lastGap = null;
    this._scopeVisible = false;
    this._lastAmmoText = null;
    this._ammoLow = false;
    this._lastFireMode = null;
    this._lastBuildName = null;
    this._lastTimerText = null;
    this._lastObjective = null;
    this._lastLaneInfo = null;
    this._toastTimer = null;
    this._toastHideTimer = null;
    this._hitmarkerAnim = null;
    this._levelUpAnim = null;
    this._levelUpTimer = null;
    this._lastPoints = null;
    this._lastWave = null;
    this._vignetteAlpha = null;

    this.el = {};
    this.root = el("div", "gb-hud", "position:fixed;inset:0;pointer-events:none;z-index:10;display:none;");
    // Fullscreen modal overlays (pause/finish/mission/gameover) are mounted
    // directly on document.body — see _buildOverlayScaffold for why: #ui
    // (z-index 10) is a lower stacking context than #touch (z-index 30, see
    // style.css), so a backdrop nested inside this.root/#ui can never paint
    // above the touch control buttons no matter its own z-index. Tracked
    // here so mount()/unmount() can attach/detach them alongside this.root.
    this._overlayEls = [];

    this._buildCrosshair();
    this._buildScopeVignette();
    this._buildAmmo();
    this._buildHitmarker();
    this._buildTimerObjective();
    this._buildLaneInfo();
    this._buildToast();
    this._buildInteractPrompt();
    this._buildPause();
    this._buildFinish();
    this._buildMissionResult();
    this._buildLevelUp();
    this._buildZombies();
  }

  // ---- construction ------------------------------------------------

  _buildCrosshair() {
    const crosshair = el(
      "div",
      "gb-crosshair",
      "position:fixed;top:50%;left:50%;width:0;height:0;pointer-events:none;z-index:20;"
    );
    const mkLine = (w, h) =>
      el("div", "gb-crosshair-line", `position:absolute;top:0;left:0;width:${w}px;height:${h}px;background:#f2f2f2;box-shadow:0 0 1px rgba(0,0,0,0.8);`);

    const top = mkLine(2, 8);
    const bottom = mkLine(2, 8);
    const left = mkLine(8, 2);
    const right = mkLine(8, 2);
    const dot = el("div", "gb-crosshair-dot", "position:absolute;top:0;left:0;width:2px;height:2px;transform:translate(-50%,-50%);background:#f2f2f2;border-radius:50%;");

    crosshair.append(top, bottom, left, right, dot);
    this.root.appendChild(crosshair);

    this.el.crosshair = crosshair;
    this.el.chTop = top;
    this.el.chBottom = bottom;
    this.el.chLeft = left;
    this.el.chRight = right;
  }

  _buildScopeVignette() {
    const vignette = el("div", "gb-scope-vignette", "position:fixed;inset:0;display:none;pointer-events:none;z-index:15;");
    const hole = el(
      "div",
      null,
      "position:absolute;top:50%;left:50%;width:38vmin;height:38vmin;transform:translate(-50%,-50%);border-radius:50%;box-shadow:0 0 0 9999px rgba(0,0,0,0.93);"
    );
    const crossV = el("div", null, "position:absolute;top:50%;left:50%;width:1px;height:16vmin;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);");
    const crossH = el("div", null, "position:absolute;top:50%;left:50%;width:16vmin;height:1px;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);");
    vignette.append(hole, crossV, crossH);
    this.root.appendChild(vignette);
    this.el.scopeVignette = vignette;
  }

  _buildAmmo() {
    const panel = el("div", "gb-ammo", "position:fixed;right:24px;bottom:20px;text-align:right;pointer-events:none;z-index:20;");
    const count = el("div", "gb-ammo-count", "font-size:34px;font-weight:700;color:#f2f2f2;line-height:1;");
    const mode = el("div", "gb-ammo-mode", "font-size:13px;color:#ffb347;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;");
    const build = el("div", "gb-ammo-build", "font-size:11px;color:#9a9a9a;margin-top:2px;");
    panel.append(count, mode, build);
    this.root.appendChild(panel);
    this.el.ammoCount = count;
    this.el.fireMode = mode;
    this.el.buildName = build;
  }

  _buildHitmarker() {
    const marker = el(
      "div",
      "gb-hitmarker",
      "position:fixed;top:50%;left:50%;width:26px;height:26px;transform:translate(-50%,-50%);pointer-events:none;z-index:25;opacity:0;"
    );
    marker.innerHTML =
      '<svg viewBox="0 0 26 26" width="26" height="26">' +
      '<line x1="4" y1="4" x2="22" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="22" y1="4" x2="4" y2="22" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
      "</svg>";
    marker.style.color = "#f2f2f2";
    this.root.appendChild(marker);
    this.el.hitmarker = marker;
  }

  _buildTimerObjective() {
    const timer = el(
      "div",
      "gb-timer",
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);font-family:'Courier New',monospace;font-size:28px;font-weight:700;color:#f2f2f2;display:none;pointer-events:none;z-index:20;text-align:center;"
    );
    const objective = el(
      "div",
      "gb-objective",
      "position:fixed;top:56px;left:50%;transform:translateX(-50%);font-size:14px;color:#ffb347;display:none;pointer-events:none;z-index:20;text-align:center;white-space:nowrap;"
    );
    this.root.append(timer, objective);
    this.el.timer = timer;
    this.el.objective = objective;
  }

  _buildLaneInfo() {
    const laneInfo = el(
      "div",
      "gb-lane-info",
      "position:fixed;left:20px;bottom:20px;font-size:13px;color:#c8c8c8;display:none;pointer-events:none;z-index:20;"
    );
    this.root.appendChild(laneInfo);
    this.el.laneInfo = laneInfo;
  }

  // NOTE: deliberately NOT class "gb-toast" — style.css's .gb-toast (builder/
  // menu toasts) pins `bottom:` which, combined with this element's inline
  // `top`, stretched it into a giant dark column over the whole HUD.
  _buildToast() {
    const toast = el(
      "div",
      "gb-hud-toast",
      "position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);font-size:16px;color:#f2f2f2;background:rgba(0,0,0,0.55);padding:8px 16px;border-radius:6px;display:none;opacity:0;pointer-events:none;z-index:30;text-align:center;"
    );
    this.root.appendChild(toast);
    this.el.toast = toast;
  }

  _buildInteractPrompt() {
    const interact = el(
      "div",
      "gb-interact",
      "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);font-size:14px;color:#f2f2f2;background:rgba(0,0,0,0.5);padding:8px 14px;border-radius:6px;display:none;pointer-events:none;z-index:20;white-space:nowrap;"
    );
    this.root.appendChild(interact);
    this.el.interact = interact;
  }

  // Shared fullscreen-overlay scaffold for pause / finish / mission result /
  // game over: a dark backdrop (fixed, centers its one child) around a
  // width-capped .gb-overlay-panel (gb-panel styling, fades+rises in via a
  // CSS animation on open). The panel itself stays overflow:hidden and an
  // inner .gb-overlay-panel-body does the actual scrolling — same split as
  // .gb-stat-panel/.gb-stat-body, so a short viewport (e.g. landscape phone)
  // never lets a composited scroll layer paint over the WebGL canvas.
  // modifierClass tags the backdrop for the per-overlay background tint in
  // style.css (.gb-pause / .gb-finish / .gb-mission / .gb-gameover).
  //
  // NOT appended under this.root: these are meant to fully block input
  // (including touch buttons) while shown, which requires out-ranking
  // #touch's stacking context — see the this._overlayEls comment in the
  // constructor. mount()/unmount() attach/detach them to document.body.
  _buildOverlayScaffold(modifierClass) {
    const backdrop = el("div", `gb-overlay-backdrop ${modifierClass}`, "display:none;");
    const panel = el("div", "gb-panel gb-overlay-panel");
    const body = el("div", "gb-overlay-panel-body");
    panel.appendChild(body);
    backdrop.appendChild(panel);
    this._overlayEls.push(backdrop);
    return { backdrop, panel, body };
  }

  _buildPause() {
    const { backdrop, body } = this._buildOverlayScaffold("gb-pause");
    const title = el("div", "gb-pause-title gb-overlay-title", "font-size:26px;font-weight:700;color:#f2f2f2;");
    const resumeBtn = button("Resume");
    const retryBtn = button("Retry");
    const builderBtn = button("Back to Builder");
    const menuBtn = button("Main Menu");
    body.append(title, resumeBtn, retryBtn, builderBtn, menuBtn);

    this.el.pauseOverlay = backdrop;
    this.el.pauseTitle = title;
    this.el.pauseResumeBtn = resumeBtn;
    this.el.pauseRetryBtn = retryBtn;
    this.el.pauseBuilderBtn = builderBtn;
    this.el.pauseMenuBtn = menuBtn;
  }

  _buildFinish() {
    const { backdrop, body } = this._buildOverlayScaffold("gb-finish");
    const time = el("div", "gb-finish-time", "font-size:44px;font-weight:800;color:#f2f2f2;font-family:'Courier New',monospace;");
    const newBest = el("div", "gb-finish-newbest", "font-size:16px;font-weight:700;color:#ffb347;display:none;");
    const best = el("div", "gb-finish-best", "font-size:14px;color:#c8c8c8;");
    const penalties = el("div", "gb-finish-penalties", "font-size:13px;color:#ff8a6b;display:none;");
    const xp = el("div", "gb-finish-xp", "font-size:14px;font-weight:700;color:#ffb347;display:none;");
    const retryBtn = button("Retry");
    const builderBtn = button("Back to Builder");
    const menuBtn = button("Main Menu");
    body.append(time, newBest, best, penalties, xp, retryBtn, builderBtn, menuBtn);

    this.el.finishOverlay = backdrop;
    this.el.finishTime = time;
    this.el.finishNewBest = newBest;
    this.el.finishBest = best;
    this.el.finishPenalties = penalties;
    this.el.finishXp = xp;
    this.el.finishRetryBtn = retryBtn;
    this.el.finishBuilderBtn = builderBtn;
    this.el.finishMenuBtn = menuBtn;
  }

  _buildMissionResult() {
    const { backdrop, body } = this._buildOverlayScaffold("gb-mission");
    const title = el("div", "gb-mission-title gb-overlay-title", "font-size:34px;font-weight:800;color:#ffb347;text-align:center;");
    const sub = el("div", "gb-mission-sub", "font-size:15px;color:#c8c8c8;text-align:center;");
    const stars = el("div", "gb-mission-stars", "font-size:44px;letter-spacing:12px;line-height:1;margin:4px 0 2px;text-indent:12px;");
    const time = el("div", "gb-mission-time", "font-size:20px;font-weight:700;font-family:'Courier New',monospace;color:#f2f2f2;display:none;");
    const xp = el("div", "gb-mission-xp", "font-size:16px;font-weight:700;color:#ffb347;display:none;");
    const retryBtn = button("Retry");
    const nextBtn = button("Next Mission");
    const careerBtn = button("Career");
    body.append(title, sub, stars, time, xp, retryBtn, nextBtn, careerBtn);

    this.el.missionOverlay = backdrop;
    this.el.missionTitle = title;
    this.el.missionSub = sub;
    this.el.missionStars = stars;
    this.el.missionTime = time;
    this.el.missionXp = xp;
    this.el.missionRetryBtn = retryBtn;
    this.el.missionNextBtn = nextBtn;
    this.el.missionCareerBtn = careerBtn;
  }

  _buildLevelUp() {
    // Gold slide-in banner (showLevelUp). Above overlays (z 60), never blocks.
    const banner = el(
      "div",
      "gb-levelup",
      "position:fixed;top:84px;left:50%;transform:translateX(-50%);padding:12px 28px;border-radius:10px;" +
      "background:linear-gradient(180deg,#ffd97a,#ff9d2e);color:#241a05;font-weight:800;font-size:18px;" +
      "letter-spacing:0.05em;text-align:center;box-shadow:0 6px 24px rgba(255,170,40,0.45);" +
      "display:none;opacity:0;pointer-events:none;z-index:60;white-space:nowrap;max-width:92vw;" +
      "overflow:hidden;text-overflow:ellipsis;"
    );
    this.root.appendChild(banner);
    this.el.levelUp = banner;
  }

  // Zombies-mode widgets (Addendum v4): points (top-left), wave (top-center —
  // zombies never shows the timer, so the slot is free), fullscreen red
  // health vignette, and the game-over overlay. All hidden until first set.
  _buildZombies() {
    const vignette = el(
      "div",
      "gb-health-vignette",
      "position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;" +
      "background:radial-gradient(ellipse at center, rgba(150,0,20,0) 42%, rgba(150,0,20,0.65) 78%, rgba(120,0,16,1) 100%);"
    );
    this.root.appendChild(vignette);
    this.el.healthVignette = vignette;

    const points = el(
      "div",
      "gb-points",
      "position:fixed;left:20px;top:14px;display:none;pointer-events:none;z-index:20;line-height:1;"
    );
    const pointsValue = el("div", "gb-points-value", "font-size:30px;font-weight:800;color:#ffb347;font-family:'Courier New',monospace;");
    const pointsLabel = el("div", "gb-points-label", "font-size:11px;color:#9a9a9a;letter-spacing:0.14em;margin-top:3px;");
    pointsLabel.textContent = "POINTS";
    points.append(pointsValue, pointsLabel);
    this.root.appendChild(points);
    this.el.points = points;
    this.el.pointsValue = pointsValue;

    const wave = el(
      "div",
      "gb-wave",
      "position:fixed;top:16px;left:50%;transform:translateX(-50%);font-size:20px;font-weight:800;" +
      "color:#ff6a5a;letter-spacing:0.16em;display:none;pointer-events:none;z-index:20;text-align:center;white-space:nowrap;"
    );
    this.root.appendChild(wave);
    this.el.wave = wave;

    const { backdrop, body } = this._buildOverlayScaffold("gb-gameover");
    const title = el("div", "gb-gameover-title gb-overlay-title", "font-size:40px;font-weight:900;color:#ff5a48;text-align:center;");
    title.textContent = "GAME OVER";
    const waveLine = el("div", "gb-gameover-wave", "font-size:24px;font-weight:800;color:#f2f2f2;");
    const pointsLine = el("div", "gb-gameover-points", "font-size:16px;color:#c8c8c8;");
    const newBest = el("div", "gb-gameover-newbest", "font-size:16px;font-weight:700;color:#ffb347;display:none;");
    newBest.textContent = "NEW BEST WAVE!";
    const bestLine = el("div", "gb-gameover-best", "font-size:14px;color:#c8c8c8;");
    const xpLine = el("div", "gb-gameover-xp", "font-size:15px;font-weight:700;color:#ffb347;display:none;");
    const retryBtn = button("Retry");
    const menuBtn = button("Main Menu");
    body.append(title, waveLine, pointsLine, newBest, bestLine, xpLine, retryBtn, menuBtn);

    this.el.gameOverOverlay = backdrop;
    this.el.gameOverWave = waveLine;
    this.el.gameOverPoints = pointsLine;
    this.el.gameOverNewBest = newBest;
    this.el.gameOverBest = bestLine;
    this.el.gameOverXp = xpLine;
    this.el.gameOverRetryBtn = retryBtn;
    this.el.gameOverMenuBtn = menuBtn;
  }

  // ---- lifecycle ------------------------------------------------

  mount(isTouch = false) {
    this._isTouch = !!isTouch;
    if (!this.root.parentNode) {
      this.uiRoot.appendChild(this.root);
    }
    this.root.style.display = "";
    this.root.classList.toggle("gb-hud-touch", this._isTouch);
    // Touch: lift the interact prompt above the ADS/FIRE button cluster.
    this.el.interact.style.bottom = this._isTouch ? "250px" : "90px";
    // Overlays live on document.body (see _buildOverlayScaffold), not
    // this.root, so they need their own attach step.
    for (const ov of this._overlayEls) {
      if (!ov.parentNode) document.body.appendChild(ov);
    }
  }

  unmount() {
    this.root.style.display = "none";
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    for (const ov of this._overlayEls) {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
  }

  // ---- HUD state setters ------------------------------------------------

  setAmmo(inMag, magSize) {
    const text = `${inMag} / ${magSize}`;
    if (text !== this._lastAmmoText) {
      this._lastAmmoText = text;
      this.el.ammoCount.textContent = text;
    }
    const low = magSize > 0 && inMag / magSize <= 0.2;
    if (low !== this._ammoLow) {
      this._ammoLow = low;
      this.el.ammoCount.classList.toggle("gb-ammo-low", low);
    }
  }

  setFireMode(str) {
    if (str === this._lastFireMode) return;
    this._lastFireMode = str;
    this.el.fireMode.textContent = str || "";
  }

  setBuildName(str) {
    if (str === this._lastBuildName) return;
    this._lastBuildName = str;
    this.el.buildName.textContent = str || "";
  }

  // deg = spread half-angle in degrees, adsAmount = 0..1 aim progress.
  // opticZoom is optional (defaults to 1 = no scope) — screens that wire an
  // ADS optic with zoom <=0.45 should pass the current optic's zoom mult so
  // the crosshair can hand off to the scope vignette at high magnification.
  setCrosshairSpread(deg, adsAmount, opticZoom = 1) {
    const ads = clamp(adsAmount, 0, 1);
    const hideForScope = ads > 0.8 && opticZoom <= 0.45;

    if (hideForScope !== this._scopeVisible) {
      this._scopeVisible = hideForScope;
      this.el.scopeVignette.style.display = hideForScope ? "" : "none";
      this.el.crosshair.style.display = hideForScope ? "none" : "";
    }
    if (hideForScope) return;

    const rawGap = 8 + deg * 6;
    const gap = lerp(rawGap, 2, ads);
    if (gap === this._lastGap) return;
    this._lastGap = gap;

    const g = gap.toFixed(2);
    this.el.chTop.style.transform = `translate(-50%,-100%) translateY(-${g}px)`;
    this.el.chBottom.style.transform = `translate(-50%,0%) translateY(${g}px)`;
    this.el.chLeft.style.transform = `translate(-100%,-50%) translateX(-${g}px)`;
    this.el.chRight.style.transform = `translate(0%,-50%) translateX(${g}px)`;
  }

  hitmarker(crit) {
    const marker = this.el.hitmarker;
    marker.classList.toggle("gb-hitmarker-crit", !!crit);
    marker.style.width = crit ? "34px" : "26px";
    marker.style.height = crit ? "34px" : "26px";
    marker.style.color = crit ? "#ffd447" : "#f2f2f2";

    if (this._hitmarkerAnim) this._hitmarkerAnim.cancel();
    marker.style.opacity = "1";
    if (typeof marker.animate === "function") {
      this._hitmarkerAnim = marker.animate(
        [
          { transform: "translate(-50%,-50%) scale(1.35)", opacity: 1, offset: 0 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.3 },
          { transform: "translate(-50%,-50%) scale(1)", opacity: 0, offset: 1 },
        ],
        { duration: 150, easing: "ease-out" }
      );
      this._hitmarkerAnim.onfinish = () => {
        marker.style.opacity = "0";
      };
    } else {
      marker.style.opacity = "0";
    }
  }

  setTimer(seconds) {
    if (seconds == null) {
      if (this.el.timer.style.display !== "none") this.el.timer.style.display = "none";
      this._lastTimerText = null;
      return;
    }
    if (this.el.timer.style.display === "none") this.el.timer.style.display = "";
    const text = formatTime(seconds);
    if (text !== this._lastTimerText) {
      this._lastTimerText = text;
      this.el.timer.textContent = text;
    }
  }

  setObjective(text) {
    if (text == null) {
      if (this.el.objective.style.display !== "none") this.el.objective.style.display = "none";
      this._lastObjective = null;
      return;
    }
    if (this.el.objective.style.display === "none") this.el.objective.style.display = "";
    if (text !== this._lastObjective) {
      this._lastObjective = text;
      this.el.objective.textContent = text;
    }
  }

  setLaneInfo(text) {
    if (text == null) {
      if (this.el.laneInfo.style.display !== "none") this.el.laneInfo.style.display = "none";
      this._lastLaneInfo = null;
      return;
    }
    if (this.el.laneInfo.style.display === "none") this.el.laneInfo.style.display = "";
    if (text !== this._lastLaneInfo) {
      this._lastLaneInfo = text;
      this.el.laneInfo.textContent = text;
    }
  }

  showMessage(text, ms = 2000) {
    const toast = this.el.toast;
    toast.textContent = text;
    toast.style.display = "";
    // Start a touch below the resting spot so the transition (opacity +
    // transform, declared in ensureInjectedStyles) reads as a slide-up.
    toast.style.transform = "translate(-50%, -35%)";
    // Force reflow so opacity/transform always transition from their
    // start state on retrigger.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, -50%)";

    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toastHideTimer) clearTimeout(this._toastHideTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = "0";
      this._toastHideTimer = setTimeout(() => {
        toast.style.display = "none";
      }, 220);
    }, ms);
  }

  showInteractPrompt(text, onTap) {
    const interact = this.el.interact;
    if (text == null) {
      interact.style.display = "none";
      interact.onclick = null;
      return;
    }
    interact.style.display = "";
    interact.textContent = text;
    interact.onclick = onTap || null;
    const tappable = this._isTouch && !!onTap;
    interact.style.pointerEvents = tappable ? "auto" : "none";
    interact.style.cursor = tappable ? "pointer" : "";
    interact.classList.toggle("gb-interact-touch", tappable);
  }

  showPause({ title = "Paused", onResume, onRetry, onBuilder, onMenu } = {}) {
    this.el.pauseTitle.textContent = title;
    this.el.pauseResumeBtn.onclick = onResume || null;
    this.el.pauseBuilderBtn.onclick = onBuilder || null;
    this.el.pauseMenuBtn.onclick = onMenu || null;
    if (onRetry) {
      this.el.pauseRetryBtn.style.display = "";
      this.el.pauseRetryBtn.onclick = onRetry;
    } else {
      this.el.pauseRetryBtn.style.display = "none";
      this.el.pauseRetryBtn.onclick = null;
    }
    this.el.pauseOverlay.style.display = "flex";
  }

  hidePause() {
    this.el.pauseOverlay.style.display = "none";
  }

  // Non-blocking gold banner: "LEVEL 7 — UNLOCKED: Kriss Vex, Holo Sight".
  // Slides in, holds, fades — ~2.5 s total. Safe to call over any overlay.
  showLevelUp(level, partNames) {
    const banner = this.el.levelUp;
    if (!banner) return;
    const names = Array.isArray(partNames) && partNames.length
      ? ` — UNLOCKED: ${partNames.join(", ")}`
      : "";
    banner.textContent = `LEVEL ${level}${names}`;
    banner.style.display = "";

    if (this._levelUpAnim) this._levelUpAnim.cancel();
    if (this._levelUpTimer) clearTimeout(this._levelUpTimer);
    const hide = () => {
      banner.style.display = "none";
      banner.style.opacity = "0";
    };
    if (typeof banner.animate === "function") {
      banner.style.opacity = "1";
      this._levelUpAnim = banner.animate(
        [
          { transform: "translateX(-50%) translateY(-36px)", opacity: 0, offset: 0 },
          { transform: "translateX(-50%) translateY(0)", opacity: 1, offset: 0.14 },
          { transform: "translateX(-50%) translateY(0)", opacity: 1, offset: 0.85 },
          { transform: "translateX(-50%) translateY(-12px)", opacity: 0, offset: 1 },
        ],
        { duration: 2500, easing: "ease-out" }
      );
      this._levelUpAnim.onfinish = hide;
    } else {
      banner.style.opacity = "1";
      this._levelUpTimer = setTimeout(hide, 2500);
    }
  }

  // Mission end overlay: MISSION COMPLETE/FAILED, star row, optional time and
  // "+N XP" lines, Retry / Next Mission (when onNext given) / Career.
  showMissionResult({
    success, missionTitle, stars = 0, time = null, xpText = null,
    onRetry, onNext, onCareer,
  } = {}) {
    this.el.missionTitle.textContent = success ? "MISSION COMPLETE" : "MISSION FAILED";
    this.el.missionTitle.style.color = success ? "#ffb347" : "#ff6a6a";
    this.el.missionSub.textContent = missionTitle || "";

    const starsEl = this.el.missionStars;
    starsEl.textContent = "";
    for (let i = 0; i < 3; i++) {
      // 150ms stagger, scale-overshoot pop-in (see .gb-star / gb-star-pop in
      // style.css) — gold filled for earned, dim outline for missed.
      const s = el("span", "gb-star", `color:${i < stars ? "#ffd447" : "#4a4a52"};animation-delay:${i * 150}ms;`);
      s.textContent = i < stars ? "★" : "☆";
      starsEl.appendChild(s);
    }

    if (time != null) {
      this.el.missionTime.style.display = "";
      this.el.missionTime.textContent = formatTime(time);
    } else {
      this.el.missionTime.style.display = "none";
    }
    if (xpText) {
      this.el.missionXp.style.display = "";
      this.el.missionXp.textContent = xpText;
    } else {
      this.el.missionXp.style.display = "none";
    }

    this.el.missionRetryBtn.onclick = onRetry || null;
    this.el.missionCareerBtn.onclick = onCareer || null;
    if (onNext) {
      this.el.missionNextBtn.style.display = "";
      this.el.missionNextBtn.onclick = onNext;
    } else {
      this.el.missionNextBtn.style.display = "none";
      this.el.missionNextBtn.onclick = null;
    }
    this.el.missionOverlay.style.display = "flex";
  }

  hideMissionResult() {
    this.el.missionOverlay.style.display = "none";
  }

  showFinish({ time, best, isNewBest, penalties = 0, xp = null, onRetry, onBuilder, onMenu } = {}) {
    this.el.finishTime.textContent = formatTime(time);
    this.el.finishNewBest.style.display = isNewBest ? "" : "none";
    this.el.finishBest.textContent = best != null ? `Best: ${formatTime(best)}` : "";
    if (penalties > 0) {
      this.el.finishPenalties.style.display = "";
      this.el.finishPenalties.textContent = `Penalties: +${penalties.toFixed(1)}s`;
    } else {
      this.el.finishPenalties.style.display = "none";
    }
    if (xp != null) {
      this.el.finishXp.style.display = "";
      this.el.finishXp.textContent = `+${xp} XP`;
    } else {
      this.el.finishXp.style.display = "none";
    }
    this.el.finishRetryBtn.onclick = onRetry || null;
    this.el.finishBuilderBtn.onclick = onBuilder || null;
    this.el.finishMenuBtn.onclick = onMenu || null;
    this.el.finishOverlay.style.display = "flex";
  }

  hideFinish() {
    this.el.finishOverlay.style.display = "none";
  }

  // ---- Zombies mode (Addendum v4) ----------------------------------

  setPoints(n) {
    if (n == null) {
      if (this.el.points.style.display !== "none") this.el.points.style.display = "none";
      this._lastPoints = null;
      return;
    }
    if (this.el.points.style.display === "none") this.el.points.style.display = "";
    if (n !== this._lastPoints) {
      this._lastPoints = n;
      this.el.pointsValue.textContent = String(n);
    }
  }

  setWave(n) {
    if (n == null) {
      if (this.el.wave.style.display !== "none") this.el.wave.style.display = "none";
      this._lastWave = null;
      return;
    }
    if (this.el.wave.style.display === "none") this.el.wave.style.display = "";
    if (n !== this._lastWave) {
      this._lastWave = n;
      this.el.wave.textContent = `WAVE ${n}`;
    }
  }

  // alpha 0..1 red edge vignette. Skips sub-0.02 changes (per-frame regen
  // ticks) except an exact 0, which always clears fully.
  setHealthVignette(a) {
    const v = clamp(a || 0, 0, 1);
    if (this._vignetteAlpha != null && v !== 0 && Math.abs(v - this._vignetteAlpha) < 0.02) return;
    this._vignetteAlpha = v;
    this.el.healthVignette.style.opacity = v.toFixed(3);
  }

  showGameOver({ wave, points, best = null, xp = null, isNewBest = false, onRetry, onMenu } = {}) {
    this.el.gameOverWave.textContent = `Wave ${wave}`;
    this.el.gameOverPoints.textContent = `Points: ${points}`;
    this.el.gameOverNewBest.style.display = isNewBest ? "" : "none";
    this.el.gameOverBest.textContent = best != null ? `Best wave: ${best}` : "";
    if (xp != null) {
      this.el.gameOverXp.style.display = "";
      this.el.gameOverXp.textContent = `+${xp} XP`;
    } else {
      this.el.gameOverXp.style.display = "none";
    }
    this.el.gameOverRetryBtn.onclick = onRetry || null;
    this.el.gameOverMenuBtn.onclick = onMenu || null;
    this.el.gameOverOverlay.style.display = "flex";
  }

  hideGameOver() {
    this.el.gameOverOverlay.style.display = "none";
  }

  dispose() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toastHideTimer) clearTimeout(this._toastHideTimer);
    if (this._hitmarkerAnim) this._hitmarkerAnim.cancel();
    if (this._levelUpAnim) this._levelUpAnim.cancel();
    if (this._levelUpTimer) clearTimeout(this._levelUpTimer);
    this.unmount();
    this.el = {};
  }
}
