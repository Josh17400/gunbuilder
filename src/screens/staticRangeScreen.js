// StaticRangeScreen — free-shoot test lanes: wires world, player controller,
// viewmodel, weapon, projectiles, effects and HUD together.

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene, lerp, damp, clamp } from "../core/utils.js";
import { DEFAULT_BUILD } from "../data/parts.js";
import { createStaticRangeWorld } from "../world/rangeStaticWorld.js";
import { PlayerController } from "../game/playerController.js";
import { ProjectileSystem } from "../game/projectiles.js";
import { Effects } from "../game/effects.js";
import { HUD } from "../game/hud.js";
import { ViewModel } from "../gun/viewmodel.js";
import { Weapon } from "../gun/weapon.js";

const _mfPos = new THREE.Vector3();
const _mfDir = new THREE.Vector3();

function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

export class StaticRangeScreen extends Screen {
  async enter(ctx, params) {
    this.ctx = ctx;
    this.build = copyBuild(
      (params && params.build) || ctx.save.loadLastBuild() || DEFAULT_BUILD
    );
    this.paused = false;
    this._lastHit = null;
    this._promptShown = false;
    this._sprintAmt = 0;
    this._hudMode = null;

    // ---- Scene / lighting ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fc4e0);
    this.scene.fog = new THREE.Fog(0x9fc4e0, 70, 260);
    this.scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x6a705f, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.0);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 400
    );
    this.scene.add(this.camera); // viewmodel gun is parented to the camera

    // ---- World & systems (contract wiring order) ----
    this.world = createStaticRangeWorld();
    this.scene.add(this.world.group);

    this.effects = new Effects(this.scene);
    this.hud = new HUD(document.getElementById("ui"));
    this.hud.mount(ctx.input.isTouch);

    this.projectiles = new ProjectileSystem(this.scene, {
      effects: this.effects, hud: this.hud, audio: ctx.audio,
    });

    this.controller = new PlayerController(this.camera, {
      input: ctx.input,
      colliders: this.world.colliders,
      spawn: this.world.spawn,
    });

    this.viewmodel = new ViewModel(this.camera, this.build);

    this.weapon = new Weapon(this.build, {
      projectiles: this.projectiles,
      audio: ctx.audio,
      hud: this.hud,
      getMuzzleWorld: (out) => this.viewmodel.getMuzzleWorld(out),
      getAimRay: (outOrigin, outDir) => {
        this.camera.getWorldPosition(outOrigin);
        this.camera.getWorldDirection(outDir);
      },
      onRecoil: (vDeg, hDeg) => this.controller.addRecoil(vDeg, hDeg),
      onShot: () => {
        // muzzle flash is spawned by ProjectileSystem.spawn — only kick here
        this.viewmodel.kick(this._kickIntensity);
      },
    });
    this.controller.recoilRecoveryDegS = this.weapon.stats.recoilRecovery;
    this._kickIntensity = clamp(this.weapon.stats.recoilV / 2.5, 0.35, 1.5);

    // Hittables: walls + every target's hittables
    const hittables = [...this.world.wallHittables];
    for (const t of this.world.targets) hittables.push(...t.hittables);
    this.projectiles.setHittables(hittables);

    // ---- HUD initial state ----
    this.hud.setBuildName(this.build.name || "Untitled");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.setFireMode(this.weapon.fireMode);
    this._hudMode = this.weapon.fireMode;
    this.hud.setTimer(null);
    this.hud.setObjective(null);
    this.hud.setLaneInfo(null);

    // ---- Touch-only refill button (touch has no interact key) ----
    this.refillBtn = null;
    if (ctx.input.isTouch) {
      this.refillBtn = document.createElement("button");
      this.refillBtn.className = "gb-btn";
      this.refillBtn.textContent = "REFILL AMMO";
      Object.assign(this.refillBtn.style, {
        position: "absolute", left: "50%", bottom: "180px",
        transform: "translateX(-50%)", display: "none",
        pointerEvents: "auto", zIndex: "10",
      });
      this.refillBtn.addEventListener("click", () => this._refill());
      document.getElementById("ui").appendChild(this.refillBtn);
    }

    // ---- Pause wiring ----
    ctx.input.onPauseRequest = () => this._pause();
    ctx.input.setGameplayMode(true);
    this._ready = true;
  }

  _pause() {
    if (this.paused || !this._ready) return;
    this.paused = true;
    this.ctx.input.setGameplayMode(false);
    this.hud.showPause({
      title: "PAUSED",
      onResume: () => this._resume(),
      onRetry: () => {
        this._resetRange();
        this._resume();
      },
      onBuilder: () => this.ctx.manager.goTo("builder", { build: copyBuild(this.build) }),
      onMenu: () => this.ctx.manager.goTo("menu"),
    });
  }

  _resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hud.hidePause();
    this.ctx.input.setGameplayMode(true);
  }

  _resetRange() {
    for (const t of this.world.targets) t.reset();
    this.projectiles.clear();
    this.weapon.reset();
    this.controller.teleport(this.world.spawn.position, this.world.spawn.yaw);
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.setLaneInfo(null);
    this._lastHit = null;
  }

  _refill() {
    this.weapon.refill();
    this.ctx.audio.play("uiClick");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.showMessage("Ammo refilled", 1200);
  }

  update(dt) {
    if (!this._ready || !this.scene) return;
    const input = this.ctx.input;

    if (input.state.pausePressed && !this.paused) this._pause();
    if (this.paused) return; // still renders (manager), gameplay frozen

    const stats = this.weapon.stats;

    // 1. player
    this.controller.update(dt, {
      mobility: stats.mobility,
      adsAmount: this.weapon.adsAmount,
      adsZoom: stats.adsZoom,
    });

    // 2. viewmodel
    this.viewmodel.setADS(this.weapon.adsAmount);
    this._sprintAmt = damp(this._sprintAmt, this.controller.isSprinting ? 1 : 0, 10, dt);
    this.viewmodel.setSprint(this._sprintAmt);
    this.viewmodel.update(dt);

    // 3. weapon
    this.weapon.update(dt, {
      wantFire: input.state.fire,
      wantADS: input.state.ads,
      wantReload: input.state.reloadPressed,
      wantModeToggle: input.state.fireModePressed,
      sprinting: this.controller.isSprinting,
      moving: this.controller.isMoving,
    });
    if (this.weapon.fireMode !== this._hudMode) {
      this._hudMode = this.weapon.fireMode;
      this.hud.setFireMode(this._hudMode);
    }

    // 4. projectiles / targets / effects
    this.projectiles.update(dt);
    for (const t of this.world.targets) t.update(dt, this.controller.position);
    this.effects.update(dt);

    // 5. HUD
    const spread = lerp(stats.spreadHip, stats.spreadAds, this.weapon.adsAmount);
    this.hud.setCrosshairSpread(spread, this.weapon.adsAmount, this.weapon.stats.adsZoom);

    const hit = this.projectiles.lastHitInfo;
    if (hit !== this._lastHit) {
      this._lastHit = hit;
      if (hit) {
        this.hud.setLaneInfo(
          `${Math.round(hit.damage)} dmg @ ${Math.round(hit.distance)}m · ${hit.flightTime.toFixed(2)}s`
        );
      }
    }

    // 6. ammo crate
    const crate = this.world.ammoCrate;
    const near = this.controller.position.distanceTo(crate.position) <= crate.radius;
    if (near !== this._promptShown) {
      this._promptShown = near;
      if (input.isTouch) {
        if (this.refillBtn) this.refillBtn.style.display = near ? "" : "none";
        this.hud.showInteractPrompt(null);
      } else {
        this.hud.showInteractPrompt(near ? "E — Refill ammo" : null);
      }
    }
    if (near && input.state.interactPressed) this._refill();
  }

  exit() {
    this._ready = false;
    if (this.ctx) {
      this.ctx.input.onPauseRequest = null;
      this.ctx.input.setGameplayMode(false);
    }
    if (this.refillBtn) { this.refillBtn.remove(); this.refillBtn = null; }
    if (this.hud) { this.hud.unmount(); this.hud.dispose(); this.hud = null; }
    if (this.weapon) { this.weapon.dispose(); this.weapon = null; }
    if (this.viewmodel) { this.viewmodel.dispose(); this.viewmodel = null; }
    if (this.projectiles) { this.projectiles.dispose(); this.projectiles = null; }
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    if (this.controller) { this.controller.dispose(); this.controller = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
  }
}
