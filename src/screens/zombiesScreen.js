// ZombiesScreen — Addendum v4 survival mode: wave-spawned zombies in a dusk
// arena, points economy (buy ammo / mystery-box gun rolls), player HP with
// regen + red vignette, game over with best-wave persistence and XP.
//
// Gameplay wiring mirrors staticRangeScreen (controller/viewmodel/weapon/
// projectiles/effects/hud). zombies.js + zombiesWorld.js are authored by a
// parallel workstream, so they are DYNAMIC-imported in enter() (same reason
// missionShared dynamic-imports progression.js): a static import chain from
// main.js would make the whole app unbootable until they land.

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene, lerp, damp, clamp } from "../core/utils.js";
import { DEFAULT_BUILD, PARTS_BY_SLOT, SLOTS } from "../data/parts.js";
import { isCompatible, sanitizeBuild } from "../data/compat.js";
import { PlayerController } from "../game/playerController.js";
import { ProjectileSystem } from "../game/projectiles.js";
import { Effects } from "../game/effects.js";
import { HUD } from "../game/hud.js";
import { ViewModel } from "../gun/viewmodel.js";
import { Weapon } from "../gun/weapon.js";
import { copyBuild, loadProgression, grantXp } from "./missionShared.js";

const ZOMBIES_KEY = "gunbuilder.v1.zombies";
const MAX_HP = 100;
const REGEN_DELAY = 4;      // s undamaged before regen kicks in
const REGEN_RATE = 12;      // hp/s
const FIRST_INTERMISSION = 3;
const INTERMISSION = 7;
const SLOWMO_SCALE = 0.3;
const SLOWMO_REAL_SECONDS = 1.2;
// Nullable per the build-object contract; every other slot is required.
const NULLABLE_SLOTS = new Set(["muzzle", "stock", "underbarrel", "laser"]);

const _playerPos = new THREE.Vector3();

function loadBest() {
  try {
    const raw = localStorage.getItem(ZOMBIES_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return {
      bestWave: (o && typeof o.bestWave === "number") ? o.bestWave : 0,
      bestPoints: (o && typeof o.bestPoints === "number") ? o.bestPoints : 0,
    };
  } catch (_) {
    return { bestWave: 0, bestPoints: 0 };
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(ZOMBIES_KEY, JSON.stringify(best));
  } catch (_) { /* storage unavailable — best-effort only */ }
}

export class ZombiesScreen extends Screen {
  async enter(ctx, params) {
    this.ctx = ctx;
    this.baseBuild = copyBuild(
      (params && params.build) || ctx.save.loadLastBuild() || DEFAULT_BUILD
    );
    this.build = copyBuild(this.baseBuild);
    this.paused = false;
    this._ready = false;

    // ---- Zombies core (parallel workstream) — dynamic import ----
    let zombiesMod = null;
    let worldMod = null;
    try {
      [zombiesMod, worldMod] = await Promise.all([
        import("../game/zombies.js"),
        import("../world/zombiesWorld.js"),
      ]);
    } catch (err) {
      console.error("ZombiesScreen: zombies core unavailable", err);
      // Bail out to the menu next tick (goTo is running us right now).
      setTimeout(() => ctx.manager.goTo("menu"), 0);
      return;
    }

    this.progression = await loadProgression(); // null-tolerant (XP still saves)

    // ---- Run state ----
    this.points = 0;
    this.hp = MAX_HP;
    this._sinceDamage = REGEN_DELAY;
    this.wave = 0;
    this.state = "intermission"; // "intermission" | "combat" | "dying" | "dead"
    this._intermissionLeft = FIRST_INTERMISSION;
    this._slowmoLeft = 0;
    this._waveHadZombies = false;
    this._combatElapsed = 0;
    this._nearStation = null; // null | "ammo" | "box"
    this._sprintAmt = 0;
    this._hudMode = null;
    this._hitCount = -1;

    // ---- Scene / lighting (dusk) ----
    // Rig tuned with the zombiesWorld palette (see builder memory: the world
    // is pure geometry — without screen lights the arena is near-black).
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2b2433);
    this.scene.fog = new THREE.Fog(0x2b2433, 28, 85);
    this.scene.add(new THREE.HemisphereLight(0x9fa4cc, 0x4a4038, 1.5));
    const sun = new THREE.DirectionalLight(0xffa666, 1.6); // low dusk sun
    sun.position.set(-30, 16, 12);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 400
    );
    this.scene.add(this.camera); // viewmodel gun is parented to the camera

    // ---- World & systems (same order as staticRangeScreen) ----
    this.world = worldMod.createZombiesWorld();
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

    this._createRig(this.build);

    this.zombies = new zombiesMod.ZombieSystem(this.scene, {
      audio: ctx.audio,
      effects: this.effects,
      getPlayerPos: (out) => out.copy(this.controller.position),
      onPlayerDamage: (dmg) => this._onPlayerDamage(dmg),
      onZombieDown: (e) => this._onZombieDown(e || {}),
      onPointsHit: () => this._addPoints(10), // +10 per damaging hit (contract)
    });
    if (this.world.gates) this.zombies.setGates(this.world.gates);
    if (this.world.obstacles) this.zombies.setObstacles(this.world.obstacles);
    this._refreshHittables();

    // ---- HUD initial state ----
    this.hud.setTimer(null);
    this.hud.setLaneInfo(null);
    this.hud.setPoints(0);
    this.hud.setWave(null);
    this.hud.setHealthVignette(0);
    this.hud.setObjective(`Wave 1 starts in ${Math.ceil(this._intermissionLeft)}…`);

    // ---- Big "WAVE N" banner (screen-owned; hud additions stay per-contract) ----
    this.waveBanner = document.createElement("div");
    this.waveBanner.className = "gb-zombies-wavebanner";
    document.getElementById("ui").appendChild(this.waveBanner);
    this._showBanner("WAVE 1");

    // ---- Pause wiring ----
    ctx.input.onPauseRequest = () => this._pause();
    ctx.input.setGameplayMode(true);
    this._ready = true;
  }

  // ------------------------------------------------------------- gun rig

  // Viewmodel + weapon wiring, extracted so the mystery box can rebuild the
  // rig live. Caller disposes any previous rig first (_disposeRig).
  _createRig(build) {
    this.build = build;
    this.viewmodel = new ViewModel(this.camera, build);
    this.weapon = new Weapon(build, {
      projectiles: this.projectiles,
      audio: this.ctx.audio,
      hud: this.hud,
      getMuzzleWorld: (out) => this.viewmodel.getMuzzleWorld(out),
      getAimRay: (outOrigin, outDir) => {
        this.camera.getWorldPosition(outOrigin);
        this.camera.getWorldDirection(outDir);
      },
      onRecoil: (vDeg, hDeg) => this.controller.addRecoil(vDeg, hDeg),
      onShot: () => this.viewmodel.kick(this._kickIntensity),
    });
    this.controller.recoilRecoveryDegS = this.weapon.stats.recoilRecovery;
    this._kickIntensity = clamp(this.weapon.stats.recoilV / 2.5, 0.35, 1.5);

    this.hud.setBuildName(build.name || "Untitled");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.setFireMode(this.weapon.fireMode);
    this._hudMode = this.weapon.fireMode;
  }

  _disposeRig() {
    if (this.weapon) { this.weapon.dispose(); this.weapon = null; }
    if (this.viewmodel) { this.viewmodel.dispose(); this.viewmodel = null; }
  }

  // Zombie hittables are pooled inside ZombieSystem; re-sync whenever the
  // exposed array changes length (cheap per-frame check) or a wave starts.
  _refreshHittables() {
    const zh = (this.zombies && this.zombies.hittables) || [];
    this._hitCount = zh.length;
    this.projectiles.setHittables([...this.world.wallHittables, ...zh]);
  }

  // ------------------------------------------------------------- points/hp

  _addPoints(n) {
    if (this.state === "dead" || this.state === "dying") return;
    this.points += n;
    this.hud.setPoints(this.points);
  }

  _onZombieDown(e) {
    // zombies.js supplies kill points ({headshot, points}); be defensive
    // about the field in case the parallel implementation omits it.
    const pts = typeof e.points === "number" ? e.points : (e.headshot ? 100 : 60);
    this._addPoints(pts);
  }

  _onPlayerDamage(dmg) {
    if (!this._ready || this.paused || this.state === "dying" || this.state === "dead") return;
    this.hp -= dmg;
    this._sinceDamage = 0;
    this.ctx.audio.play("hit");
    this.hud.setHealthVignette(clamp((1 - this.hp / MAX_HP) * 0.85, 0, 0.85));
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.state = "dying";
    this._slowmoLeft = SLOWMO_REAL_SECONDS;
    this.hud.setHealthVignette(0.85);
    this.hud.setObjective(null);
    this.hud.showInteractPrompt(null);
    this._nearStation = null;
    this.ctx.audio.play("fall");
  }

  _gameOver() {
    this.state = "dead";
    this.ctx.input.setGameplayMode(false);

    const best = loadBest();
    const isNewBest = this.wave > best.bestWave;
    const merged = {
      bestWave: Math.max(best.bestWave, this.wave),
      bestPoints: Math.max(best.bestPoints, this.points),
    };
    saveBest(merged);

    const award = Math.round(this.points / 10);
    let res = null;
    try {
      res = grantXp(this.ctx.save, this.progression, award);
    } catch (err) {
      console.error("ZombiesScreen: grantXp failed", err);
    }
    if (res && res.unlockedNames) this.hud.showLevelUp(res.level, res.unlockedNames);

    this.hud.showGameOver({
      wave: this.wave,
      points: this.points,
      best: merged.bestWave,
      isNewBest,
      xp: award,
      onRetry: () => this._retry(),
      onMenu: () => this.ctx.manager.goTo("menu"),
    });
  }

  _retry() {
    this.hud.hideGameOver();

    // Fresh run: points reset, so the loadout resets to the one you entered
    // with (keeping a 950-point mystery gun would be a free head start).
    this._disposeRig();
    this._createRig(copyBuild(this.baseBuild));

    this.zombies.clear();
    this.projectiles.clear();
    this.weapon.reset();
    this.controller.teleport(this.world.spawn.position, this.world.spawn.yaw);

    this.points = 0;
    this.hp = MAX_HP;
    this._sinceDamage = REGEN_DELAY;
    this.wave = 0;
    this.state = "intermission";
    this._intermissionLeft = FIRST_INTERMISSION;
    this._slowmoLeft = 0;
    this._waveHadZombies = false;
    this._combatElapsed = 0;
    this._nearStation = null;

    this.hud.setPoints(0);
    this.hud.setWave(null);
    this.hud.setHealthVignette(0);
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.showInteractPrompt(null);
    this.hud.setObjective(`Wave 1 starts in ${Math.ceil(this._intermissionLeft)}…`);
    this._showBanner("WAVE 1");
    this.ctx.input.setGameplayMode(true);
  }

  // ------------------------------------------------------------- waves

  _showBanner(text) {
    if (!this.waveBanner) return;
    this.waveBanner.textContent = text;
    this.waveBanner.classList.add("gb-show");
  }

  _hideBanner() {
    if (this.waveBanner) this.waveBanner.classList.remove("gb-show");
  }

  _startWave(n) {
    this.wave = n;
    this.state = "combat";
    this._waveHadZombies = false;
    this._combatElapsed = 0;
    this.hud.setWave(n);
    this.hud.setObjective(null);
    this._hideBanner();
    this.zombies.startWave(n);
    this._refreshHittables();
  }

  _queuedCount() {
    // Contract exposes no queue accessor — probe common shapes, default 0
    // (the _waveHadZombies guard below covers a purely internal queue).
    const z = this.zombies;
    if (typeof z.queuedCount === "number") return z.queuedCount;
    const q = z.queued != null ? z.queued : z.queue;
    if (typeof q === "number") return q;
    if (Array.isArray(q)) return q.length;
    return 0;
  }

  _updateWaves(dt) {
    if (this.state === "intermission") {
      this._intermissionLeft -= dt;
      if (this._intermissionLeft <= 0) {
        this._startWave(this.wave + 1);
      } else {
        this.hud.setObjective(
          `Wave ${this.wave + 1} starts in ${Math.ceil(this._intermissionLeft)}…`
        );
      }
      return;
    }
    if (this.state !== "combat") return;

    this._combatElapsed += dt;
    if (this.zombies.aliveCount > 0) this._waveHadZombies = true;

    const cleared =
      this.zombies.aliveCount === 0 &&
      this._queuedCount() === 0 &&
      // Spawns are staggered: don't call a wave cleared before anything
      // spawned. 15 s fallback prevents a deadlock if the system stalls.
      (this._waveHadZombies || this._combatElapsed > 15);

    if (cleared) {
      if (!this._waveHadZombies) {
        console.warn(`ZombiesScreen: wave ${this.wave} produced no zombies — advancing`);
      }
      this.state = "intermission";
      this._intermissionLeft = INTERMISSION;
      this._showBanner(`WAVE ${this.wave + 1}`);
      this.hud.setObjective(`Wave ${this.wave + 1} starts in ${INTERMISSION}…`);
      this.ctx.audio.play("ding");
    }
  }

  // ------------------------------------------------------------- stations

  _updateStations() {
    const input = this.ctx.input;
    let near = null;
    const ammo = this.world.ammoCrate;
    const box = this.world.mysteryBox;
    const dAmmo = ammo ? this.controller.position.distanceTo(ammo.position) : Infinity;
    const dBox = box ? this.controller.position.distanceTo(box.position) : Infinity;
    if (ammo && dAmmo <= ammo.radius) near = "ammo";
    if (box && dBox <= box.radius && dBox < dAmmo) near = "box";

    if (near !== this._nearStation) {
      this._nearStation = near;
      // Touch buys go through the touch cluster's USE button (it sets
      // interactPressed) — #ui sits UNDER the #touch look-drag surface, so a
      // tappable prompt inside the HUD can never receive the tap. The prompt
      // is the price tag; USE is the buy button.
      const key = input.isTouch ? "USE" : "E";
      if (near === "ammo") {
        this.hud.showInteractPrompt(`${key} — Ammo · ${ammo.cost}`);
      } else if (near === "box") {
        this.hud.showInteractPrompt(`${key} — Mystery Box · ${box.cost}`);
      } else {
        this.hud.showInteractPrompt(null);
      }
    }
    if (near && input.state.interactPressed) {
      if (near === "ammo") this._buyAmmo();
      else this._buyMystery();
    }
  }

  _trySpend(cost) {
    if (this.points >= cost) {
      this.points -= cost; // ledger can never go negative
      this.hud.setPoints(this.points);
      return true;
    }
    this.ctx.audio.play("beep");
    this.hud.showMessage("Not enough points", 1200);
    return false;
  }

  _buyAmmo() {
    if (this.state === "dying" || this.state === "dead" || this.paused) return;
    if (!this._trySpend(this.world.ammoCrate.cost)) return;
    this.weapon.refill();
    this.ctx.audio.play("uiClick");
    this.hud.setAmmo(this.weapon.ammoInMag, this.weapon.stats.magSize);
    this.hud.showMessage("Ammo refilled", 1200);
  }

  _buyMystery() {
    if (this.state === "dying" || this.state === "dead" || this.paused) return;
    if (!this._trySpend(this.world.mysteryBox.cost)) return;

    const build = this._rollRandomBuild();
    this._disposeRig();
    this._createRig(build);

    const rcv = (PARTS_BY_SLOT.receiver || []).find((p) => p.id === build.receiver);
    this.hud.showMessage(rcv ? rcv.name : (build.name || "New weapon"), 2200);
    this.ctx.audio.play("finish");
  }

  // Random legal build: random receiver, then a random compatible part (or
  // null for nullable slots) per slot; sanitizeBuild backstops required slots
  // and cross-slot rules (e.g. integral-suppressor barrels null the muzzle).
  _rollRandomBuild() {
    const receivers = PARTS_BY_SLOT.receiver || [];
    const rcv = receivers[Math.floor(Math.random() * receivers.length)];
    const build = { name: rcv.name, receiver: rcv.id };

    for (const slot of SLOTS) {
      if (slot === "receiver") continue;
      const candidates = (PARTS_BY_SLOT[slot] || [])
        .filter((p) => isCompatible(rcv.id, slot, p.id).ok)
        .map((p) => p.id);
      if (NULLABLE_SLOTS.has(slot)) candidates.push(null);
      build[slot] = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
    }

    try {
      const res = sanitizeBuild(build);
      return (res && res.build) ? res.build : build;
    } catch (err) {
      console.error("ZombiesScreen: sanitizeBuild failed on mystery roll", err);
      return build;
    }
  }

  // ------------------------------------------------------------- flow

  _pause() {
    if (this.paused || this.state === "dead" || !this._ready) return;
    this.paused = true;
    this.ctx.input.setGameplayMode(false);
    this.hud.showPause({
      title: "PAUSED",
      onResume: () => this._resume(),
      onRetry: () => {
        this.paused = false;
        this.hud.hidePause();
        this._retry();
      },
      onBuilder: () => this.ctx.manager.goTo("builder", { build: copyBuild(this.baseBuild) }),
      onMenu: () => this.ctx.manager.goTo("menu"),
    });
  }

  _resume() {
    if (!this.paused) return;
    this.paused = false;
    this.hud.hidePause();
    this.ctx.input.setGameplayMode(true);
  }

  update(dt) {
    if (!this._ready || !this.scene) return;
    const input = this.ctx.input;

    if (input.state.pausePressed && !this.paused && this.state !== "dead") this._pause();
    if (this.paused) return; // still renders, gameplay frozen

    if (this.state === "dead") {
      // Settle effects behind the game-over overlay.
      this.projectiles.update(dt);
      this.effects.update(dt);
      this.zombies.update(dt * SLOWMO_SCALE);
      return;
    }

    // Death slow-mo: world runs at 0.3× for 1.2 real seconds, then game over.
    let sdt = dt;
    const dying = this.state === "dying";
    if (dying) {
      sdt = dt * SLOWMO_SCALE;
      this._slowmoLeft -= dt;
      if (this._slowmoLeft <= 0) {
        this._gameOver();
        return;
      }
    }

    const stats = this.weapon.stats;

    // 1. player
    this.controller.update(sdt, {
      mobility: stats.mobility,
      adsAmount: this.weapon.adsAmount,
      adsZoom: stats.adsZoom,
    });

    // 2. viewmodel
    this.viewmodel.setADS(this.weapon.adsAmount);
    this._sprintAmt = damp(this._sprintAmt, this.controller.isSprinting ? 1 : 0, 10, sdt);
    this.viewmodel.setSprint(this._sprintAmt);
    this.viewmodel.update(sdt);

    // 3. weapon (dead men pull no triggers)
    this.weapon.update(sdt, {
      wantFire: !dying && input.state.fire,
      wantADS: !dying && input.state.ads,
      wantReload: !dying && input.state.reloadPressed,
      wantModeToggle: !dying && input.state.fireModePressed,
      sprinting: this.controller.isSprinting,
      moving: this.controller.isMoving,
    });
    if (this.weapon.fireMode !== this._hudMode) {
      this._hudMode = this.weapon.fireMode;
      this.hud.setFireMode(this._hudMode);
    }

    // 4. projectiles / zombies / effects
    this.projectiles.update(sdt);
    this.zombies.update(sdt);
    if (this.zombies.hittables && this.zombies.hittables.length !== this._hitCount) {
      this._refreshHittables();
    }
    this.effects.update(sdt);

    if (dying) return; // no regen, waves, buys or HUD churn while dying

    // 5. hp regen (12/s after 4 s undamaged)
    this._sinceDamage += dt;
    if (this._sinceDamage >= REGEN_DELAY && this.hp < MAX_HP) {
      this.hp = Math.min(MAX_HP, this.hp + REGEN_RATE * dt);
      this.hud.setHealthVignette(clamp((1 - this.hp / MAX_HP) * 0.85, 0, 0.85));
    }

    // 6. waves
    this._updateWaves(dt);

    // 7. HUD
    const spread = lerp(stats.spreadHip, stats.spreadAds, this.weapon.adsAmount);
    this.hud.setCrosshairSpread(spread, this.weapon.adsAmount, stats.adsZoom);

    // 8. buy stations
    this._updateStations();
  }

  exit() {
    this._ready = false;
    if (this.ctx) {
      this.ctx.input.onPauseRequest = null;
      this.ctx.input.setGameplayMode(false);
    }
    if (this.waveBanner) { this.waveBanner.remove(); this.waveBanner = null; }
    if (this.hud) { this.hud.unmount(); this.hud.dispose(); this.hud = null; }
    this._disposeRig();
    if (this.zombies) { this.zombies.dispose(); this.zombies = null; }
    if (this.projectiles) { this.projectiles.dispose(); this.projectiles = null; }
    if (this.effects) { this.effects.dispose(); this.effects = null; }
    if (this.controller) { this.controller.dispose(); this.controller = null; }
    if (this.world) { this.world.dispose(); this.world = null; }
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
    this.progression = null;
  }
}
