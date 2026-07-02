// Unified desktop + touch input. Desktop uses keyboard/mouse + pointer lock;
// touch is delegated to an internally-owned TouchControls instance that
// writes into the same shared `state` object.

import { save } from "./save.js";
import { TouchControls } from "./touchControls.js";

const MOUSE_SENS_BASE = 0.0023; // rad/px

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = {
      moveX: 0,
      moveZ: 0,
      lookDX: 0,
      lookDY: 0,
      fire: false,
      ads: false,
      sprint: false,
      jumpPressed: false,
      reloadPressed: false,
      fireModePressed: false,
      interactPressed: false,
      pausePressed: false,
    };

    this.onPauseRequest = null;
    this.isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.gameplayMode = false;

    this._keys = new Set();
    this._pointerLocked = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onCanvasClick = this._onCanvasClick.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onBlur = this._onBlur.bind(this);

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("mousemove", this._onMouseMove);
    canvas.addEventListener("mousedown", this._onMouseDown);
    window.addEventListener("mouseup", this._onMouseUp);
    canvas.addEventListener("contextmenu", this._onContextMenu);
    canvas.addEventListener("click", this._onCanvasClick);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
    window.addEventListener("blur", this._onBlur);

    this.touch = null;
    if (this.isTouch) {
      const root = document.getElementById("touch");
      if (root) {
        this.touch = new TouchControls(
          root,
          this.state,
          () => save.getSettings(),
          () => {
            if (this.onPauseRequest) this.onPauseRequest();
          }
        );
      }
    }
  }

  setGameplayMode(on) {
    this.gameplayMode = on;

    if (this.isTouch && this.touch) {
      if (on) this.touch.show();
      else this.touch.hide();
    }

    if (!on && document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  _onCanvasClick() {
    if (!this.gameplayMode || this.isTouch) return;
    if (document.pointerLockElement !== this.canvas && this.canvas.requestPointerLock) {
      this.canvas.requestPointerLock();
    }
  }

  _onPointerLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (this._pointerLocked && !locked) {
      // Lock was lost (Esc or OS-level focus change).
      this.state.fire = false;
      this.state.ads = false;
      if (this.gameplayMode && this.onPauseRequest) {
        this.onPauseRequest();
      }
    }
    this._pointerLocked = locked;
  }

  _onMouseMove(e) {
    if (!this._pointerLocked || !this.gameplayMode) return;
    const settings = save.getSettings();
    const sens = MOUSE_SENS_BASE * (settings.sens ?? 1);
    this.state.lookDX += e.movementX * sens;
    this.state.lookDY += e.movementY * sens;
  }

  _onMouseDown(e) {
    if (!this.gameplayMode) return;
    if (e.button === 0) this.state.fire = true;
    else if (e.button === 2) this.state.ads = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.state.fire = false;
    else if (e.button === 2) this.state.ads = false;
  }

  _onContextMenu(e) {
    if (this.gameplayMode) e.preventDefault();
  }

  _onKeyDown(e) {
    this._keys.add(e.code);
    this._updateMoveAxes();

    if (e.repeat) return;

    switch (e.code) {
      case "ShiftLeft":
      case "ShiftRight":
        this.state.sprint = true;
        break;
      case "Space":
        this.state.jumpPressed = true;
        e.preventDefault();
        break;
      case "KeyR":
        this.state.reloadPressed = true;
        break;
      case "KeyX":
        this.state.fireModePressed = true;
        break;
      case "KeyF":
      case "KeyE":
        this.state.interactPressed = true;
        break;
      default:
        break;
    }
  }

  _onKeyUp(e) {
    this._keys.delete(e.code);
    this._updateMoveAxes();

    switch (e.code) {
      case "ShiftLeft":
      case "ShiftRight":
        this.state.sprint = false;
        break;
      default:
        break;
    }
  }

  _updateMoveAxes() {
    const forward = this._keys.has("KeyW") || this._keys.has("ArrowUp");
    const back = this._keys.has("KeyS") || this._keys.has("ArrowDown");
    const left = this._keys.has("KeyA") || this._keys.has("ArrowLeft");
    const right = this._keys.has("KeyD") || this._keys.has("ArrowRight");
    this.state.moveZ = (forward ? 1 : 0) - (back ? 1 : 0);
    this.state.moveX = (right ? 1 : 0) - (left ? 1 : 0);
  }

  _onBlur() {
    // Prevent stuck keys/buttons when the tab/window loses focus.
    this._keys.clear();
    this._updateMoveAxes();
    this.state.fire = false;
    this.state.ads = false;
    this.state.sprint = false;
  }

  endFrame() {
    this.state.lookDX = 0;
    this.state.lookDY = 0;
    this.state.jumpPressed = false;
    this.state.reloadPressed = false;
    this.state.fireModePressed = false;
    this.state.interactPressed = false;
    this.state.pausePressed = false;
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("mousemove", this._onMouseMove);
    this.canvas.removeEventListener("mousedown", this._onMouseDown);
    window.removeEventListener("mouseup", this._onMouseUp);
    this.canvas.removeEventListener("contextmenu", this._onContextMenu);
    this.canvas.removeEventListener("click", this._onCanvasClick);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
    window.removeEventListener("blur", this._onBlur);
    if (this.touch) this.touch.dispose();
  }
}
