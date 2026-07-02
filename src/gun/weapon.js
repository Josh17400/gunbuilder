// Runtime weapon logic: fire timing, fire modes, ammo/reload, ADS progress,
// sprint-lock, and shot spawning. See CONTRACTS.md (src/gun/weapon.js).

import * as THREE from "three";
import { clamp, lerp } from "../core/utils.js";
import { composeStats } from "../data/stats.js";
import { PARTS } from "../data/parts.js";

const SPRINT_LOCK_TIME = 0.15; // can't fire while sprinting or this long after

export class Weapon {
  constructor(build, deps) {
    this.build = build;
    this.deps = deps;

    this.stats = composeStats(build);
    // rpmCap is applied in composeStats already — guard anyway.
    const ammoPart = PARTS[build.ammo];
    const ammoData = (ammoPart && ammoPart.ammo) || {};
    if (ammoData.rpmCap) {
      this.stats.fireRate = Math.min(this.stats.fireRate, ammoData.rpmCap);
    }
    this._ammoObj = { ...ammoData, id: build.ammo };

    this.ammoInMag = this.stats.magSize;
    this.fireMode = this.stats.fireModes[0];
    this.adsAmount = 0;
    this.reloading = false;

    this._cooldown = 0;
    this._reloadT = 0;
    this._sprintLock = 0;
    this._prevFire = false;
    this._prevReload = false;
    this._prevMode = false;

    // Reused shot object — no per-shot allocation.
    this._shot = {
      origin: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      spreadDeg: 0,
      pellets: 1,
      velocity: 0,
      damage: 0,
      falloffStart: 0,
      falloffEnd: 0,
      falloffMult: 0.4,
      penetration: 0,
      ammo: this._ammoObj,
    };
    this._rayOrigin = new THREE.Vector3(); // scratch for getAimRay's origin out-param

    this.deps.hud.setAmmo(this.ammoInMag, this.stats.magSize);
    this.deps.hud.setFireMode(this.fireMode);
  }

  update(dt, { wantFire, wantADS, wantReload, wantModeToggle, sprinting, moving }) {
    const { audio, hud } = this.deps;
    const stats = this.stats;

    // --- Sprint lock ---
    if (sprinting) this._sprintLock = SPRINT_LOCK_TIME;
    else this._sprintLock = Math.max(0, this._sprintLock - dt);

    // --- ADS progress (sprint suppresses aiming) ---
    const adsTarget = wantADS && !sprinting ? 1 : 0;
    const adsStep = dt / Math.max(stats.adsTime, 0.001);
    this.adsAmount = clamp(
      this.adsAmount + Math.sign(adsTarget - this.adsAmount) * adsStep,
      0,
      1
    );
    if (Math.abs(adsTarget - this.adsAmount) < adsStep) this.adsAmount = adsTarget;

    // --- Fire mode toggle (rising edge) ---
    if (wantModeToggle && !this._prevMode && stats.fireModes.length > 1) {
      const i = stats.fireModes.indexOf(this.fireMode);
      this.fireMode = stats.fireModes[(i + 1) % stats.fireModes.length];
      hud.setFireMode(this.fireMode);
    }

    // --- Reload ---
    if (this.reloading) {
      this._reloadT -= dt;
      if (this._reloadT <= 0) {
        this.reloading = false;
        this.ammoInMag = stats.magSize;
        hud.setAmmo(this.ammoInMag, stats.magSize);
      }
    } else if (
      wantReload &&
      !this._prevReload &&
      this.ammoInMag < stats.magSize
    ) {
      this._startReload();
    }

    // --- Fire ---
    this._cooldown = Math.max(0, this._cooldown - dt);
    const fireEdge = wantFire && !this._prevFire;
    const wantsShot = this.fireMode === "auto" ? wantFire : fireEdge;
    const canFire =
      !this.reloading && !sprinting && this._sprintLock <= 0 && this._cooldown <= 0;

    if (wantsShot && canFire) {
      if (this.ammoInMag <= 0) {
        if (fireEdge) {
          audio.play("dry");
          hud.showMessage("RELOAD", 600);
        }
      } else {
        this._fire();
      }
    }

    this._prevFire = wantFire;
    this._prevReload = wantReload;
    this._prevMode = wantModeToggle;
  }

  _fire() {
    const { projectiles, audio, hud, getMuzzleWorld, getAimRay, onRecoil, onShot } =
      this.deps;
    const stats = this.stats;

    this.ammoInMag--;
    this._cooldown = 60 / Math.max(stats.fireRate, 1);

    const shot = this._shot;
    getMuzzleWorld(shot.origin);
    getAimRay(this._rayOrigin, shot.dir); // dir = camera center ray
    shot.spreadDeg = lerp(stats.spreadHip, stats.spreadAds, this.adsAmount);
    shot.pellets = stats.pellets;
    shot.velocity = stats.muzzleVelocity;
    shot.damage = stats.damage;
    shot.falloffStart = stats.falloffStart;
    shot.falloffEnd = stats.falloffEnd;
    shot.penetration = stats.penetration;
    projectiles.spawn(shot);

    onRecoil(stats.recoilV, stats.recoilH * (Math.random() * 2 - 1));
    onShot();

    if (stats.suppressed) audio.play("shotSuppressed");
    else if (stats.damage >= 60) audio.play("shotHeavy");
    else audio.play("shot");

    hud.setAmmo(this.ammoInMag, stats.magSize);
    if (this.ammoInMag === 0) hud.showMessage("RELOAD", 600);
  }

  _startReload() {
    this.reloading = true;
    this._reloadT = this.stats.reloadTime;
    this.deps.audio.play("reload");
  }

  refill() {
    this.reloading = false;
    this._reloadT = 0;
    this.ammoInMag = this.stats.magSize;
    this.deps.hud.setAmmo(this.ammoInMag, this.stats.magSize);
  }

  reset() {
    this.refill();
    this.adsAmount = 0;
    this.fireMode = this.stats.fireModes[0];
    this._cooldown = 0;
    this._sprintLock = 0;
    this._prevFire = false;
    this._prevReload = false;
    this._prevMode = false;
    this.deps.hud.setFireMode(this.fireMode);
  }

  dispose() {
    this.deps = null;
  }
}
