// Touch input surface: dynamic joystick (left 40% of screen) + look-drag
// (everywhere else) + DOM buttons. Writes directly into the shared Input
// state object so Input's public `state` stays the single source of truth.

import { clamp } from "./utils.js";

const JOYSTICK_RADIUS = 60; // px
const LEFT_ZONE_FRACTION = 0.4;
const LOOK_SENS_BASE = 0.004; // rad/px

export class TouchControls {
  // onPause is an internal-only 4th arg used by input.js (which owns this
  // instance) to relay the PAUSE button into Input.onPauseRequest.
  constructor(rootEl, inputState, settingsGetter, onPause) {
    this.root = rootEl;
    this.state = inputState;
    this.settingsGetter = typeof settingsGetter === "function" ? settingsGetter : () => ({ touchSens: 1 });
    this.onPause = typeof onPause === "function" ? onPause : null;

    this.joystickId = null;
    this.lookId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this._lookLastX = 0;
    this._lookLastY = 0;
    this._cleanupFns = [];

    this._onSurfaceTouchStart = this._onSurfaceTouchStart.bind(this);
    this._onSurfaceTouchMove = this._onSurfaceTouchMove.bind(this);
    this._onSurfaceTouchEnd = this._onSurfaceTouchEnd.bind(this);

    this._buildDom();
    this._bindSurface();
    this._bindButtons();
    this.hide();
  }

  _buildDom() {
    this.container = document.createElement("div");
    this.container.className = "gb-touch";

    this.surface = document.createElement("div");
    this.surface.className = "gb-touch-surface";
    this.container.appendChild(this.surface);

    this.joystickBase = document.createElement("div");
    this.joystickBase.className = "gb-joystick";
    this.joystickKnob = document.createElement("div");
    this.joystickKnob.className = "gb-joystick-knob";
    this.joystickBase.appendChild(this.joystickKnob);
    this.joystickBase.style.display = "none";
    this.container.appendChild(this.joystickBase);

    // Bottom-right action cluster.
    this.fireBtn = this._makeButton("gb-touchbtn gb-touchbtn-fire", "FIRE");
    this.adsBtn = this._makeButton("gb-touchbtn gb-touchbtn-ads", "ADS");
    this.reloadBtn = this._makeButton("gb-touchbtn gb-touchbtn-reload", "RELOAD");
    this.jumpBtn = this._makeButton("gb-touchbtn gb-touchbtn-jump", "JUMP");
    this.interactBtn = this._makeButton("gb-touchbtn gb-touchbtn-interact", "USE");

    // Top-right cluster.
    this.pauseBtn = this._makeButton("gb-touchbtn gb-touchbtn-pause", "❚❚");
    this.modeBtn = this._makeButton("gb-touchbtn gb-touchbtn-mode", "MODE");

    [
      this.fireBtn,
      this.adsBtn,
      this.reloadBtn,
      this.jumpBtn,
      this.interactBtn,
      this.pauseBtn,
      this.modeBtn,
    ].forEach((btn) => this.container.appendChild(btn));

    this.root.appendChild(this.container);
  }

  _makeButton(className, label) {
    const btn = document.createElement("div");
    btn.className = className;
    btn.textContent = label;
    return btn;
  }

  _bindSurface() {
    const opts = { passive: false };
    this.surface.addEventListener("touchstart", this._onSurfaceTouchStart, opts);
    this.surface.addEventListener("touchmove", this._onSurfaceTouchMove, opts);
    this.surface.addEventListener("touchend", this._onSurfaceTouchEnd, opts);
    this.surface.addEventListener("touchcancel", this._onSurfaceTouchEnd, opts);
    this._cleanupFns.push(() => {
      this.surface.removeEventListener("touchstart", this._onSurfaceTouchStart);
      this.surface.removeEventListener("touchmove", this._onSurfaceTouchMove);
      this.surface.removeEventListener("touchend", this._onSurfaceTouchEnd);
      this.surface.removeEventListener("touchcancel", this._onSurfaceTouchEnd);
    });
  }

  _bindButtons() {
    this._bindHoldButton(this.fireBtn, "fire");
    this._bindToggleButton(this.adsBtn, "ads");
    this._bindPressButton(this.reloadBtn, "reloadPressed");
    this._bindPressButton(this.jumpBtn, "jumpPressed");
    this._bindPressButton(this.interactBtn, "interactPressed");
    this._bindPressButton(this.modeBtn, "fireModePressed");
    this._bindPressButton(this.pauseBtn, "pausePressed", () => {
      if (this.onPause) this.onPause();
    });
  }

  // Held while finger is down (e.g. FIRE).
  _bindHoldButton(btn, stateKey) {
    let touchId = null;
    const onStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (touchId !== null) return;
      touchId = e.changedTouches[0].identifier;
      this.state[stateKey] = true;
      btn.classList.add("gb-active");
    };
    const onEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) {
          touchId = null;
          this.state[stateKey] = false;
          btn.classList.remove("gb-active");
        }
      }
    };
    btn.addEventListener("touchstart", onStart, { passive: false });
    btn.addEventListener("touchend", onEnd, { passive: false });
    btn.addEventListener("touchcancel", onEnd, { passive: false });
    this._cleanupFns.push(() => {
      btn.removeEventListener("touchstart", onStart);
      btn.removeEventListener("touchend", onEnd);
      btn.removeEventListener("touchcancel", onEnd);
    });
  }

  // Single-frame edge-triggered flag, cleared by Input#endFrame().
  _bindPressButton(btn, stateKey, extra) {
    const onStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.state[stateKey] = true;
      btn.classList.add("gb-active");
      if (extra) extra();
    };
    const onEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove("gb-active");
    };
    btn.addEventListener("touchstart", onStart, { passive: false });
    btn.addEventListener("touchend", onEnd, { passive: false });
    btn.addEventListener("touchcancel", onEnd, { passive: false });
    this._cleanupFns.push(() => {
      btn.removeEventListener("touchstart", onStart);
      btn.removeEventListener("touchend", onEnd);
      btn.removeEventListener("touchcancel", onEnd);
    });
  }

  // Toggled on tap (e.g. ADS).
  _bindToggleButton(btn, stateKey) {
    const onStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.state[stateKey] = !this.state[stateKey];
      btn.classList.toggle("gb-active", !!this.state[stateKey]);
    };
    btn.addEventListener("touchstart", onStart, { passive: false });
    this._cleanupFns.push(() => btn.removeEventListener("touchstart", onStart));
  }

  _onSurfaceTouchStart(e) {
    e.preventDefault();
    const w = window.innerWidth;
    for (const t of e.changedTouches) {
      const inLeftZone = t.clientX < w * LEFT_ZONE_FRACTION;
      if (inLeftZone && this.joystickId === null) {
        this.joystickId = t.identifier;
        this._spawnJoystick(t.clientX, t.clientY);
      } else if (!inLeftZone && this.lookId === null) {
        this.lookId = t.identifier;
        this._lookLastX = t.clientX;
        this._lookLastY = t.clientY;
      }
    }
  }

  _onSurfaceTouchMove(e) {
    e.preventDefault();
    const settings = this.settingsGetter() || {};
    const sens = LOOK_SENS_BASE * (settings.touchSens ?? 1);
    for (const t of e.changedTouches) {
      if (t.identifier === this.joystickId) {
        this._updateJoystick(t.clientX, t.clientY);
      } else if (t.identifier === this.lookId) {
        const dx = t.clientX - this._lookLastX;
        const dy = t.clientY - this._lookLastY;
        this._lookLastX = t.clientX;
        this._lookLastY = t.clientY;
        this.state.lookDX += dx * sens;
        this.state.lookDY += dy * sens;
      }
    }
  }

  _onSurfaceTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joystickId) {
        this.joystickId = null;
        this.joystickBase.style.display = "none";
        this.state.moveX = 0;
        this.state.moveZ = 0;
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  _spawnJoystick(x, y) {
    this.joystickOrigin = { x, y };
    this.joystickBase.style.left = `${x}px`;
    this.joystickBase.style.top = `${y}px`;
    this.joystickBase.style.display = "block";
    this.joystickKnob.style.transform = "translate(-50%, -50%)";
    this.state.moveX = 0;
    this.state.moveZ = 0;
  }

  _updateJoystick(x, y) {
    let dx = x - this.joystickOrigin.x;
    let dy = y - this.joystickOrigin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    this.joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.state.moveX = clamp(dx / JOYSTICK_RADIUS, -1, 1);
    this.state.moveZ = clamp(-dy / JOYSTICK_RADIUS, -1, 1); // drag up = forward
  }

  show() {
    this.container.style.display = "block";
  }

  hide() {
    this.container.style.display = "none";
    this._resetTouches();
  }

  _resetTouches() {
    this.joystickId = null;
    this.lookId = null;
    if (this.joystickBase) this.joystickBase.style.display = "none";
    this.state.moveX = 0;
    this.state.moveZ = 0;
    this.state.fire = false;
  }

  dispose() {
    this._cleanupFns.forEach((fn) => fn());
    this._cleanupFns = [];
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
