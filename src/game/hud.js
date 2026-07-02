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
    .gb-toast { transition: opacity 200ms ease; }
    .gb-overlay-panel { transition: opacity 150ms ease; }
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

    this.el = {};
    this.root = el("div", "gb-hud", "position:fixed;inset:0;pointer-events:none;z-index:10;display:none;");

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

  _buildToast() {
    const toast = el(
      "div",
      "gb-toast",
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

  _buildPause() {
    const overlay = el(
      "div",
      "gb-pause gb-overlay-panel",
      "position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(8,8,10,0.82);pointer-events:auto;z-index:50;"
    );
    const title = el("div", "gb-pause-title", "font-size:26px;font-weight:700;color:#f2f2f2;margin-bottom:8px;");
    const resumeBtn = button("Resume");
    const retryBtn = button("Retry");
    const builderBtn = button("Back to Builder");
    const menuBtn = button("Main Menu");
    overlay.append(title, resumeBtn, retryBtn, builderBtn, menuBtn);
    this.root.appendChild(overlay);

    this.el.pauseOverlay = overlay;
    this.el.pauseTitle = title;
    this.el.pauseResumeBtn = resumeBtn;
    this.el.pauseRetryBtn = retryBtn;
    this.el.pauseBuilderBtn = builderBtn;
    this.el.pauseMenuBtn = menuBtn;
  }

  _buildFinish() {
    const overlay = el(
      "div",
      "gb-pause gb-finish gb-overlay-panel",
      "position:fixed;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(8,8,10,0.86);pointer-events:auto;z-index:50;"
    );
    const time = el("div", "gb-finish-time", "font-size:44px;font-weight:800;color:#f2f2f2;font-family:'Courier New',monospace;");
    const newBest = el("div", "gb-finish-newbest", "font-size:16px;font-weight:700;color:#ffb347;display:none;");
    const best = el("div", "gb-finish-best", "font-size:14px;color:#c8c8c8;");
    const penalties = el("div", "gb-finish-penalties", "font-size:13px;color:#ff8a6b;display:none;");
    const retryBtn = button("Retry");
    const builderBtn = button("Back to Builder");
    const menuBtn = button("Main Menu");
    overlay.append(time, newBest, best, penalties, retryBtn, builderBtn, menuBtn);
    this.root.appendChild(overlay);

    this.el.finishOverlay = overlay;
    this.el.finishTime = time;
    this.el.finishNewBest = newBest;
    this.el.finishBest = best;
    this.el.finishPenalties = penalties;
    this.el.finishRetryBtn = retryBtn;
    this.el.finishBuilderBtn = builderBtn;
    this.el.finishMenuBtn = menuBtn;
  }

  // ---- lifecycle ------------------------------------------------

  mount(isTouch = false) {
    this._isTouch = !!isTouch;
    if (!this.root.parentNode) {
      this.uiRoot.appendChild(this.root);
    }
    this.root.style.display = "";
    this.root.classList.toggle("gb-hud-touch", this._isTouch);
  }

  unmount() {
    this.root.style.display = "none";
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
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
    // Force reflow so opacity always transitions from 0 on retrigger.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.style.opacity = "1";

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

  showFinish({ time, best, isNewBest, penalties = 0, onRetry, onBuilder, onMenu } = {}) {
    this.el.finishTime.textContent = formatTime(time);
    this.el.finishNewBest.style.display = isNewBest ? "" : "none";
    this.el.finishBest.textContent = best != null ? `Best: ${formatTime(best)}` : "";
    if (penalties > 0) {
      this.el.finishPenalties.style.display = "";
      this.el.finishPenalties.textContent = `Penalties: +${penalties.toFixed(1)}s`;
    } else {
      this.el.finishPenalties.style.display = "none";
    }
    this.el.finishRetryBtn.onclick = onRetry || null;
    this.el.finishBuilderBtn.onclick = onBuilder || null;
    this.el.finishMenuBtn.onclick = onMenu || null;
    this.el.finishOverlay.style.display = "flex";
  }

  hideFinish() {
    this.el.finishOverlay.style.display = "none";
  }

  dispose() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._toastHideTimer) clearTimeout(this._toastHideTimer);
    if (this._hitmarkerAnim) this._hitmarkerAnim.cancel();
    this.unmount();
    this.el = {};
  }
}
