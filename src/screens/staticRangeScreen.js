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
import {
  copyBuild, loadProgression, loadProgress, completeMission,
  nextMission, goToMission,
} from "./missionShared.js";

const _mfPos = new THREE.Vector3();
const _mfDir = new THREE.Vector3();

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

    // ---- Mission mode (Addendum v3) ----
    // params.mission with a lanes-style objective turns the free-shoot range
    // into a timed objective run. Course-mode missions never route here.
    this.mission = params && params.mission && params.mission.mode !== "course"
      ? params.mission : null;
    this.progression = this.mission ? await loadProgression() : null;
    if (this.mission && !this.progression) {
      console.warn("StaticRangeScreen: mission ignored — progression unavailable");
      this.mission = null;
    }
    this.missionState = this.mission ? "active" : null; // "active" | "done"
    this._missionElapsed = 0;
    this._missionDamage = 0;
    this._missionHits = new Set(); // distinct target instances damaged
    this._hitOwner = null;         // stamped by wrapped onHit, read in onAnyHit
    this._objRefresh = 0;

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

    // Mission tracking: onAnyHit(info, result) doesn't carry the hittable, so
    // tag each target hittable with its owning target and wrap onHit to stamp
    // the owner just before ProjectileSystem synchronously fires onAnyHit.
    // (Targets are recreated with the world each enter — no double-wrap risk.)
    if (this.mission) {
      for (const t of this.world.targets) {
        for (const h of t.hittables) {
          h.owner = t;
          const orig = h.onHit.bind(h);
          h.onHit = (info) => {
            this._hitOwner = h.owner;
            return orig(info);
          };
        }
      }
      this.projectiles.onAnyHit = (info, result) => this._onMissionHit(info, result);
    }

    // ---- HUD initial state ----
    this.hud.setBuildName(this.build.name || "Untitled");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.setFireMode(this.weapon.fireMode);
    this._hudMode = this.weapon.fireMode;
    if (this.mission) {
      this.hud.setTimer(this.mission.objective.timeLimit || 0);
      this.hud.setObjective(this._objectiveText());
    } else {
      this.hud.setTimer(null);
      this.hud.setObjective(null);
    }
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

  // ------------------------------------------------------------- mission

  _objectiveText() {
    const obj = this.mission.objective;
    if (obj.type === "hits") {
      return `Hit ${obj.count} targets · ${this._missionHits.size}/${obj.count}`;
    }
    if (obj.type === "damage") {
      const dealt = Math.min(Math.round(this._missionDamage), obj.amount);
      return `Deal ${obj.amount} damage · ${dealt}/${obj.amount}`;
    }
    return this.mission.title || "";
  }

  // Fired by ProjectileSystem for every hit (walls included — those have no
  // stamped owner). result objects are reused by targets: read, never retain.
  _onMissionHit(info, result) {
    const owner = this._hitOwner;
    this._hitOwner = null;
    if (this.missionState !== "active") return;
    const dealt = (result && result.damage) || 0;
    if (dealt <= 0) return;

    this._missionDamage += dealt;
    if (owner) this._missionHits.add(owner);
    this.hud.setObjective(this._objectiveText());

    const obj = this.mission.objective;
    const done =
      (obj.type === "hits" && this._missionHits.size >= obj.count) ||
      (obj.type === "damage" && this._missionDamage >= obj.amount);
    if (done) this._missionComplete();
  }

  _missionComplete() {
    this.missionState = "done";
    const obj = this.mission.objective;
    const timeLeft = Math.max(0, (obj.timeLimit || 0) - this._missionElapsed);

    let stars = 1;
    try {
      stars = this.progression.starsForResult(this.mission, { completed: true, timeLeft });
    } catch (err) {
      console.error("StaticRangeScreen: starsForResult failed", err);
    }
    stars = Math.max(1, Math.min(3, stars | 0)); // success is always ≥ 1 star

    const res = completeMission(this.ctx.save, this.progression, this.mission, stars);

    this.hud.setTimer(timeLeft);
    this.hud.setObjective(null);
    this.ctx.audio.play("finish");
    this.ctx.input.setGameplayMode(false);
    if (res.leveledTo) this.hud.showLevelUp(res.leveledTo, res.unlockedNames);

    const next = nextMission(this.progression, this.mission, res.progress);
    this.hud.showMissionResult({
      success: true,
      missionTitle: this.mission.title,
      stars,
      xpText: `+${res.award} XP${res.first ? "" : " (repeat)"}`,
      onRetry: () => this._missionRetry(),
      onNext: next ? () => goToMission(this.ctx, next) : null,
      onCareer: () => this.ctx.manager.goTo("career"),
    });
  }

  _missionFail() {
    this.missionState = "done";
    this.hud.setTimer(0);
    this.hud.setObjective(null);
    this.ctx.audio.play("fall");
    this.ctx.input.setGameplayMode(false);

    // No XP on failure; Next only if it was already unlocked by a prior run.
    const next = nextMission(
      this.progression, this.mission, loadProgress(this.ctx.save)
    );
    this.hud.showMissionResult({
      success: false,
      missionTitle: this.mission.title,
      stars: 0,
      onRetry: () => this._missionRetry(),
      onNext: next ? () => goToMission(this.ctx, next) : null,
      onCareer: () => this.ctx.manager.goTo("career"),
    });
  }

  _missionRetry() {
    this.hud.hideMissionResult();
    this._resetRange();
    this.ctx.input.setGameplayMode(true);
  }

  // ------------------------------------------------------------- flow

  _pause() {
    if (this.paused || this.missionState === "done" || !this._ready) return;
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

    if (this.mission) {
      this.missionState = "active";
      this._missionElapsed = 0;
      this._missionDamage = 0;
      this._missionHits.clear();
      this._hitOwner = null;
      this._objRefresh = 0;
      this.hud.setTimer(this.mission.objective.timeLimit || 0);
      this.hud.setObjective(this._objectiveText());
    }
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

    if (input.state.pausePressed && !this.paused && this.missionState !== "done") this._pause();
    if (this.paused) return; // still renders (manager), gameplay frozen

    if (this.missionState === "done") {
      // Let bullets/effects settle behind the result overlay.
      this.projectiles.update(dt);
      this.effects.update(dt);
      return;
    }

    // Mission countdown — ticked before gameplay so a 0:00 frame can't also
    // register hits (fail wins the frame it expires).
    if (this.missionState === "active") {
      this._missionElapsed += dt;
      const left = (this.mission.objective.timeLimit || 0) - this._missionElapsed;
      this.hud.setTimer(Math.max(0, left));
      this._objRefresh += dt;
      if (this._objRefresh >= 0.2) {
        this._objRefresh = 0;
        this.hud.setObjective(this._objectiveText());
      }
      if (left <= 0) {
        this._missionFail();
        return;
      }
    }

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
    if (this.projectiles) {
      this.projectiles.onAnyHit = null;
      this.projectiles.dispose();
      this.projectiles = null;
    }
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    if (this.controller) { this.controller.dispose(); this.controller = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
    this.mission = null;
    this.progression = null;
    this.missionState = null;
    if (this._missionHits) this._missionHits.clear();
  }
}
