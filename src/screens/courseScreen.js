// CourseScreen — timed clearing course: ready → running (start gate) →
// finished (finish pad), with penalties for missed mandatory targets and
// shot no-shoots. Same gameplay wiring as the static range.

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene, lerp, damp, clamp } from "../core/utils.js";
import { DEFAULT_BUILD } from "../data/parts.js";
import { createCourseWorld } from "../world/courseWorld.js";
import { PlayerController } from "../game/playerController.js";
import { ProjectileSystem } from "../game/projectiles.js";
import { Effects } from "../game/effects.js";
import { HUD } from "../game/hud.js";
import { ViewModel } from "../gun/viewmodel.js";
import { Weapon } from "../gun/weapon.js";
import {
  copyBuild, loadProgression, completeMission, nextMission,
  goToMission, freePlayCourseAward, grantXp,
} from "./missionShared.js";

const _mfPos = new THREE.Vector3();
const _mfDir = new THREE.Vector3();

const MISSED_PENALTY = 5; // s per missed mandatory target
const NOSHOOT_PENALTY = 3; // s per shot no-shoot

export class CourseScreen extends Screen {
  async enter(ctx, params) {
    this.ctx = ctx;
    this.build = copyBuild(
      (params && params.build) || ctx.save.loadLastBuild() || DEFAULT_BUILD
    );
    this.paused = false;
    this.state = "ready"; // "ready" | "running" | "finished"
    this.elapsed = 0;
    this._objTimer = 0;
    this._sprintAmt = 0;
    this._hudMode = null;
    this._rHeld = false;
    this._rTime = 0;

    // ---- Mission mode (Addendum v3) ----
    // Course missions are time-objective runs of the existing flow; the
    // progression module is loaded even in free play for the finish XP award
    // (both degrade gracefully while progression.js hasn't landed).
    this.mission = params && params.mission && params.mission.mode === "course"
      ? params.mission : null;
    this.progression = await loadProgression();
    if (this.mission && !this.progression) {
      console.warn("CourseScreen: mission ignored — progression unavailable");
      this.mission = null;
    }

    // ---- Scene / lighting (moodier than the static range) ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8296a8);
    this.scene.fog = new THREE.Fog(0x8296a8, 30, 160);
    this.scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x6a705f, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.95);
    sun.position.set(25, 45, -15);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 400
    );
    this.scene.add(this.camera);

    // ---- World & systems ----
    this.world = createCourseWorld();
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

    const hittables = [...this.world.wallHittables];
    for (const t of this.world.targets) hittables.push(...t.hittables);
    this.projectiles.setHittables(hittables);

    // ---- HUD initial state ----
    this.hud.setBuildName(this.build.name || "Untitled");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.setFireMode(this.weapon.fireMode);
    this._hudMode = this.weapon.fireMode;
    this.hud.setTimer(0);
    this.hud.setObjective(this._readyObjective());
    this.hud.setLaneInfo(null);

    // Hold-R-to-retry (desktop). input only exposes reloadPressed edges,
    // so track the physical key locally.
    this._onKeyDown = (e) => {
      if (e.code === "KeyR" && !e.repeat) { this._rHeld = true; this._rTime = 0; }
    };
    this._onKeyUp = (e) => {
      if (e.code === "KeyR") this._rHeld = false;
    };
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);

    // ---- Pause wiring ----
    ctx.input.onPauseRequest = () => this._pause();
    ctx.input.setGameplayMode(true);
    this._ready = true;
  }

  // ------------------------------------------------------------- flow

  _readyObjective() {
    return this.mission
      ? `${this.mission.title} — cross the gate to start`
      : "Cross the gate to start";
  }

  _pause() {
    if (this.paused || this.state === "finished" || !this._ready) return;
    this.paused = true;
    this.ctx.input.setGameplayMode(false);
    this.hud.showPause({
      title: "PAUSED",
      onResume: () => this._resume(),
      onRetry: () => this._retry(),
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

  _retry() {
    for (const t of this.world.targets) t.reset();
    this.projectiles.clear();
    this.weapon.reset();
    this.controller.teleport(this.world.spawn.position, this.world.spawn.yaw);
    this.state = "ready";
    this.elapsed = 0;
    this._rHeld = false;
    this._rTime = 0;
    this.paused = false;
    this.hud.hidePause();
    this.hud.hideFinish();   // pre-existing gap: Retry from the finish overlay never hid it
    this.hud.hideMissionResult();
    this.hud.setTimer(0);
    this.hud.setObjective(this._readyObjective());
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.ctx.input.setGameplayMode(true);
  }

  _remainingMandatory() {
    let fallen = 0;
    for (const t of this.world.targets) {
      if (t.state === "fallen" && !t.noShoot) fallen++;
    }
    return Math.max(0, this.world.mandatoryTargets - fallen);
  }

  _finish() {
    this.state = "finished";
    const missed = this._remainingMandatory();
    let noShootHits = 0;
    for (const t of this.world.targets) {
      if (t.noShoot && t.wasShot) noShootHits++;
    }
    const penalties = missed * MISSED_PENALTY + noShootHits * NOSHOOT_PENALTY;
    const final = this.elapsed + penalties;

    // Best times (global + per build name)
    let best = null;
    let isNewBest = false;
    try {
      const bt = this.ctx.save.loadBestTimes() || {};
      bt.course = bt.course || { global: null, byBuild: {} };
      bt.course.byBuild = bt.course.byBuild || {};
      const key = this.build.name || "Untitled";

      best = bt.course.global ? bt.course.global.time : null;
      if (best === null || final < best) {
        isNewBest = true;
        bt.course.global = {
          time: final, buildName: key, date: new Date().toISOString(),
        };
      }
      const prev = bt.course.byBuild[key];
      if (typeof prev !== "number" || final < prev) {
        bt.course.byBuild[key] = final;
      }
      this.ctx.save.saveBestTimes(bt);
    } catch (err) {
      console.error("CourseScreen: best-time save failed", err);
    }

    this.hud.setTimer(final);
    this.hud.setObjective(null);
    this.ctx.audio.play("finish");
    this.ctx.input.setGameplayMode(false);

    if (this.mission) {
      // Mission run: stars from the final (penalized) time, XP + level-up,
      // progress saved, Retry / Next Mission / Career.
      let stars = 1;
      try {
        stars = this.progression.starsForResult(this.mission, { timeSeconds: final });
      } catch (err) {
        console.error("CourseScreen: starsForResult failed", err);
      }
      stars = Math.max(1, Math.min(3, stars | 0)); // finishing always earns ≥ 1 star

      const res = completeMission(this.ctx.save, this.progression, this.mission, stars);
      if (res.leveledTo) this.hud.showLevelUp(res.leveledTo, res.unlockedNames);

      const next = nextMission(this.progression, this.mission, res.progress);
      this.hud.showMissionResult({
        success: true,
        missionTitle: this.mission.title,
        stars,
        time: final,
        xpText: `+${res.award} XP${res.first ? "" : " (repeat)"}`,
        onRetry: () => this._retry(),
        onNext: next ? () => goToMission(this.ctx, next) : null,
        onCareer: () => this.ctx.manager.goTo("career"),
      });
      return;
    }

    // Free play: every finish awards XP per Addendum v3.
    let xpAward = null;
    if (this.progression) {
      xpAward = freePlayCourseAward(final);
      const res = grantXp(this.ctx.save, this.progression, xpAward);
      if (res.unlockedNames) this.hud.showLevelUp(res.level, res.unlockedNames);
    }
    this.hud.showFinish({
      time: final,
      best,
      isNewBest,
      penalties,
      xp: xpAward,
      onRetry: () => this._retry(),
      onBuilder: () => this.ctx.manager.goTo("builder", { build: copyBuild(this.build) }),
      onMenu: () => this.ctx.manager.goTo("menu"),
    });
  }

  // ------------------------------------------------------------- update

  update(dt) {
    if (!this._ready || !this.scene) return;
    const input = this.ctx.input;

    if (input.state.pausePressed && !this.paused && this.state !== "finished") this._pause();
    if (this.paused) return;

    if (this.state === "finished") {
      // Let bullets/effects settle behind the finish overlay.
      this.projectiles.update(dt);
      this.effects.update(dt);
      return;
    }

    // Hold R for 1 s → retry
    if (this._rHeld) {
      this._rTime += dt;
      if (this._rTime >= 1) {
        this._rHeld = false;
        this._retry();
        return;
      }
    }

    const stats = this.weapon.stats;

    this.controller.update(dt, {
      mobility: stats.mobility,
      adsAmount: this.weapon.adsAmount,
      adsZoom: stats.adsZoom,
    });

    this.viewmodel.setADS(this.weapon.adsAmount);
    this._sprintAmt = damp(this._sprintAmt, this.controller.isSprinting ? 1 : 0, 10, dt);
    this.viewmodel.setSprint(this._sprintAmt);
    this.viewmodel.update(dt);

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

    this.projectiles.update(dt);
    for (const t of this.world.targets) t.update(dt, this.controller.position);
    this.effects.update(dt);

    const spread = lerp(stats.spreadHip, stats.spreadAds, this.weapon.adsAmount);
    this.hud.setCrosshairSpread(spread, this.weapon.adsAmount, this.weapon.stats.adsZoom);

    // ---- State machine ----
    if (this.state === "ready") {
      if (this.world.startGate.containsPoint(this.controller.position)) {
        this.state = "running";
        this.elapsed = 0;
        this._objTimer = 0;
        this.ctx.audio.play("beep");
        this.hud.setObjective("Clear all targets → reach the pad");
      }
    } else if (this.state === "running") {
      this.elapsed += dt;
      this.hud.setTimer(this.elapsed);

      this._objTimer += dt;
      if (this._objTimer >= 0.2) {
        this._objTimer = 0;
        const remaining = this._remainingMandatory();
        this.hud.setObjective(
          remaining > 0
            ? `Clear all targets → reach the pad · ${remaining} left`
            : "All clear! Reach the pad"
        );
      }

      if (this.world.finishPad.containsPoint(this.controller.position)) {
        this._finish();
      }
    }
  }

  exit() {
    this._ready = false;
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this._onKeyDown = null;
    this._onKeyUp = null;
    if (this.ctx) {
      this.ctx.input.onPauseRequest = null;
      this.ctx.input.setGameplayMode(false);
    }
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
    this.mission = null;
    this.progression = null;
  }
}
