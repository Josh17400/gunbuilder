// src/game/zombies.js — Addendum v4: pooled zombie horde for the Zombies mode.
//
// 24 pooled low-poly humanoids. Each zombie is ONE SkinnedMesh body (rigid
// per-box skinning, 6 bones) + ONE head mesh = 2 draw calls per zombie.
// The bones are parented to the zombie GROUP, not the SkinnedMesh: the head
// mesh hangs off the torso bone, and if it were a descendant of the body mesh
// ProjectileSystem's recursive intersectObjects would hit it twice (once as
// its own registered hittable, once under the body traversal).
//
// Pursuit = seek player + tangent steering around obstacle Box3s + gentle
// pairwise separation. Attack = 0.45 s windup → torso-lunge swipe → 1.0 s
// cooldown. Death = crumple 0.5 s + sink 0.7 s → back to pool (parked at
// y = -50 and invisible; raycasts ignore `visible`, so parking far below any
// bullet path — projectiles die at y < -2 — is the real guard).
//
// Zero per-frame allocations: module-scope scratch vectors, pooled slots,
// reused onHit result objects (same convention as targets.js/projectiles.js).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, damp } from "../core/utils.js";

const POOL = 24;               // concurrent cap; wave overflow queues
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

const ATTACK_RANGE = 1.3;      // m — start windup
const HIT_RANGE = 1.9;         // m — must still be this close when the swipe lands
const ATTACK_DAMAGE = 25;
const WINDUP_TIME = 0.45;
const SWIPE_TIME = 0.18;
const COOLDOWN_TIME = 1.0;
const CRUMPLE_TIME = 0.5;
const SINK_TIME = 0.7;
const SINK_DEPTH = 0.75;
const RISE_TIME = 0.9;         // s — clawing up out of the ground at a gate
const RISE_DEPTH = 1.5;
const SEP_RADIUS = 0.8;        // m — zombies within this push each other apart
const STEER_LOOKAHEAD = 5;     // m — obstacles further than this don't steer us
const HEAD_CRIT = 2.0;         // zombies headshot multiplier (silhouettes use 1.8)
const PARK_Y = -50;

// Skeleton landmarks (rest pose, meters; model faces -Z like everything else).
const HIP_Y = 0.92;
const TORSO_PIVOT_Y = 0.98;
const SHOULDER_Y = 1.44;
const SHOULDER_X = 0.26;
const NECK_Y = 1.52;
const LEG_Y = 0.9;
const LEG_X = 0.115;

// Bone indices (skinIndex values).
const B_HIPS = 0, B_TORSO = 1, B_ARML = 2, B_ARMR = 3, B_LEGL = 4, B_LEGR = 5;

// Mottled skin + torn-clothes color-block variants (dusk-friendly, distinct
// from the tan range silhouettes).
const VARIANTS = [
  { skin: 0x8da368, shirt: 0x6b5340, pants: 0x53535c },
  { skin: 0x9aa38e, shirt: 0x82463c, pants: 0x5c5142 },
  { skin: 0xa4b374, shirt: 0x47606b, pants: 0x45454d },
];

// ---- shared/reused result + scratch (never retained by callers) ----------
const PASS_RESULT = { stopped: false, damage: 0, crit: false, showNumber: false };
const _hitResult = { stopped: true, damage: 0, crit: false, showNumber: true, sound: "hit" };

const _white = new THREE.Color(0xffffff);
const _flashRed = new THREE.Color(0xff5a4a);
const _burnTint = new THREE.Color(0xff7a2a);

const _player = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _move = new THREE.Vector3();
const _toC = new THREE.Vector3();
const _boxCenter = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _ray = new THREE.Ray();

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Flat per-vertex color (Lambert + vertexColors flat-tone look, as targets.js).
function colorize(geo, hex) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Rigid-bind a whole primitive to a single bone.
function bindTo(geo, boneIndex) {
  const n = geo.attributes.position.count;
  const idx = new Uint16Array(n * 4);
  const w = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    idx[i * 4] = boneIndex;
    w[i * 4] = 1;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(w, 4));
  return geo;
}

// ---- cached per-variant geometries (built once, shared by all zombies) ----
// Body = 8 prims, head = 2 prims (≤10 total). One arm's sleeve is torn off
// (bare skin) for silhouette asymmetry.
const _bodyGeos = [null, null, null];
const _headGeos = [null, null, null];

function bodyGeo(v) {
  if (_bodyGeos[v]) return _bodyGeos[v];
  const c = VARIANTS[v];
  const geo = mergeGeometries([
    // pelvis
    bindTo(colorize(new THREE.BoxGeometry(0.36, 0.22, 0.24).translate(0, 0.88, 0), c.pants), B_HIPS),
    // torso (shirt)
    bindTo(colorize(new THREE.BoxGeometry(0.44, 0.54, 0.26).translate(0, 1.22, 0), c.shirt), B_TORSO),
    // left arm: torn sleeve → bare skin upper + darker forearm/hand
    bindTo(colorize(new THREE.BoxGeometry(0.11, 0.36, 0.12).translate(-0.315, 1.27, 0), c.skin), B_ARML),
    bindTo(colorize(new THREE.BoxGeometry(0.1, 0.32, 0.11).translate(-0.315, 0.94, 0), shade(c.skin, 0.78)), B_ARML),
    // right arm: sleeved upper + darker forearm/hand
    bindTo(colorize(new THREE.BoxGeometry(0.12, 0.36, 0.13).translate(0.315, 1.27, 0), c.shirt), B_ARMR),
    bindTo(colorize(new THREE.BoxGeometry(0.1, 0.32, 0.11).translate(0.315, 0.94, 0), shade(c.skin, 0.78)), B_ARMR),
    // legs (pants, right leg slightly darker for wear)
    bindTo(colorize(new THREE.BoxGeometry(0.15, 0.88, 0.18).translate(-LEG_X, 0.45, 0), c.pants), B_LEGL),
    bindTo(colorize(new THREE.BoxGeometry(0.15, 0.88, 0.18).translate(LEG_X, 0.45, 0), shade(c.pants, 0.88)), B_LEGR),
  ], false);
  // Generous bounds so posed limbs never get sphere-culled out of raycasts.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 2.4);
  _bodyGeos[v] = geo;
  return geo;
}

function headGeo(v) {
  if (_headGeos[v]) return _headGeos[v];
  const c = VARIANTS[v];
  // Authored around the neck pivot: skull + jutting underbite jaw.
  const geo = mergeGeometries([
    colorize(new THREE.BoxGeometry(0.22, 0.24, 0.24).translate(0, 0.14, 0.01), c.skin),
    colorize(new THREE.BoxGeometry(0.17, 0.09, 0.2).translate(0, 0.005, -0.045), shade(c.skin, 0.8)),
  ], false);
  _headGeos[v] = geo;
  return geo;
}

// =============================================================================
// Zombie — one pooled slot. States:
// "inactive" | "spawning" | "chase" | "windup" | "swipe" | "cooldown" | "dying"
// =============================================================================
class Zombie {
  constructor(sys, index) {
    this.sys = sys;
    this.index = index;
    this.variant = index % VARIANTS.length;

    this.group = new THREE.Group();
    this.group.rotation.order = "YXZ"; // yaw first → crumple falls in facing dir
    this.group.visible = false;

    // Per-zombie material → hit flash / incendiary tint without cross-talk.
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });

    // ---- skeleton (bones on the GROUP — see module header) ----
    const hips = new THREE.Bone();
    hips.position.set(0, HIP_Y, 0);
    const torso = new THREE.Bone();
    torso.position.set(0, TORSO_PIVOT_Y - HIP_Y, 0);
    const armL = new THREE.Bone();
    armL.position.set(-SHOULDER_X, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    const armR = new THREE.Bone();
    armR.position.set(SHOULDER_X, SHOULDER_Y - TORSO_PIVOT_Y, 0);
    const legL = new THREE.Bone();
    legL.position.set(-LEG_X, LEG_Y - HIP_Y, 0);
    const legR = new THREE.Bone();
    legR.position.set(LEG_X, LEG_Y - HIP_Y, 0);
    hips.add(torso);
    torso.add(armL);
    torso.add(armR);
    hips.add(legL);
    hips.add(legR);
    this.bHips = hips;
    this.bTorso = torso;
    this.bArmL = armL;
    this.bArmR = armR;
    this.bLegL = legL;
    this.bLegR = legR;

    this.body = new THREE.SkinnedMesh(bodyGeo(this.variant), this.mat);
    this.group.add(this.body);
    this.group.add(hips);
    this.group.updateMatrixWorld(true); // bones need world matrices before bind
    const skeleton = new THREE.Skeleton([hips, torso, armL, armR, legL, legR]);
    this.body.bind(skeleton, this.body.matrixWorld);
    // r156+ SkinnedMesh raycast consults mesh.boundingSphere — keep it generous.
    this.body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 2.4);

    this.head = new THREE.Mesh(headGeo(this.variant), this.mat);
    // Slung low and pushed forward off the shoulders — key zombie silhouette.
    this.head.position.set(0, NECK_Y - TORSO_PIVOT_Y - 0.05, -0.06);
    torso.add(this.head);

    this.centerObj = new THREE.Object3D(); // chest — AoE center()
    this.centerObj.position.set(0, 1.2 - TORSO_PIVOT_Y, 0);
    torso.add(this.centerObj);
    this._center = new THREE.Vector3();

    // ---- state ----
    this.state = "inactive";
    this.t = 0;
    this.time = 0;
    this.hp = 0;
    this.speed = 2;
    this.runner = false;
    this.scale = 1;
    this.hunch = 0.4;      // torso forward lean (applied as -rotation.x)
    this.tiltZ = 0.2;      // permanent head tilt
    this.reachRight = true;
    this.phase = 0;        // walk cycle
    this.yaw = 0;
    this.flash = 0;
    this.burnDps = 0;
    this.burnUntil = 0;
    this.burnGlow = 0;
    this.deathYawDelta = 0;
    this.deathYawBase = 0;

    // Hittables are registered ONCE for every pool slot (screen calls
    // setHittables once). Inactive slots are parked at y=-50 + invisible.
    const self = this;
    this.bodyHittable = {
      object3D: this.body,
      penetrationCost: 0.4,
      fleshy: true,
      // Only the body entry has center() (AoE hits each zombie exactly once);
      // null while not alive → excluded from explosive AoE.
      center() {
        return self._isAlive() ? self.centerObj.getWorldPosition(self._center) : null;
      },
      onHit(info) {
        return self._onHit(info, false);
      },
    };
    this.headHittable = {
      object3D: this.head,
      penetrationCost: 0.4,
      fleshy: true,
      onHit(info) {
        return self._onHit(info, true);
      },
    };

    this._park();
  }

  _isAlive() {
    const s = this.state;
    return s === "spawning" || s === "chase" || s === "windup" || s === "swipe" || s === "cooldown";
  }

  activate(gatePos, wave, runner) {
    this.state = "spawning";
    this.t = 0;
    this.hp = 55 + wave * 14;
    this.runner = runner;
    this.speed = runner ? 3.2 + Math.random() * 0.6 : 1.7 + Math.random() * 0.5;
    this.scale = 0.9 + Math.random() * 0.2; // size jitter ±10%
    this.hunch = (runner ? 0.62 : 0.42) + Math.random() * 0.15;
    this.tiltZ = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.22);
    this.reachRight = Math.random() < 0.5;
    this.phase = Math.random() * TWO_PI;
    this.flash = 0;
    this.burnDps = 0;
    this.burnUntil = 0;
    this.burnGlow = 0;
    this.mat.color.copy(_white);

    this.group.visible = true;
    this.group.scale.setScalar(this.scale);
    this.group.position.set(
      gatePos.x + (Math.random() - 0.5) * 1.2,
      -RISE_DEPTH * this.scale,
      gatePos.z + (Math.random() - 0.5) * 1.2
    );

    // Face the player from the start.
    if (this.sys.getPlayerPos) {
      this.sys.getPlayerPos(_toPlayer);
      this.yaw = Math.atan2(
        -(_toPlayer.x - this.group.position.x),
        -(_toPlayer.z - this.group.position.z)
      );
    } else {
      this.yaw = 0;
    }
    this.group.rotation.set(0, this.yaw, 0);

    // Reset pose.
    this.bHips.rotation.set(0, 0, 0);
    this.bHips.position.y = HIP_Y;
    this.bTorso.rotation.set(0, 0, 0);
    this.bArmL.rotation.set(1.4, 0, 0.2);  // spawn clawing upward
    this.bArmR.rotation.set(1.4, 0, -0.2);
    this.bLegL.rotation.set(0, 0, 0);
    this.bLegR.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);

    if (this.sys.audio) this.sys.audio.play("popup");
  }

  _park() {
    this.state = "inactive";
    this.group.visible = false;
    this.group.position.set(0, PARK_Y, 0);
  }

  // ---- Hittable callback (body or head) ----
  _onHit(info, isHead) {
    // Corpses and parked slots don't block bullets (shoot the horde behind).
    if (!this._isAlive()) return PASS_RESULT;

    const dmg = info.damage * (isHead ? HEAD_CRIT : 1);
    this.hp -= dmg;
    this.flash = 1;
    if (info.incendiary) {
      this.burnDps = info.incendiary.dps || 0;
      this.burnUntil = this.time + (info.incendiary.duration || 0);
    }
    if (this.sys.onPointsHit && dmg > 0) this.sys.onPointsHit();
    if (this.hp <= 0) this._die(isHead);

    _hitResult.damage = dmg;
    _hitResult.crit = isHead;
    _hitResult.sound = "hit";
    return _hitResult;
  }

  _die(headshot) {
    this.state = "dying";
    this.t = 0;
    this.deathYawBase = this.yaw;
    this.deathYawDelta = (Math.random() - 0.5) * 1.1;
    this.burnDps = 0;
    if (this.sys.audio) this.sys.audio.play("fall");
    if (this.sys.onZombieDown) {
      this.sys.onZombieDown({ headshot, points: headshot ? 100 : 60 });
    }
  }

  // ---- per-frame ----
  update(dt, player) {
    this.time += dt;

    // Hit flash + incendiary DoT (zombies tick their own burn, like targets).
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 7);
    if (this._isAlive() && this.burnDps > 0 && this.time < this.burnUntil) {
      this.hp -= this.burnDps * dt;
      this.burnGlow = Math.min(1, this.burnGlow + dt * 5);
      if (this.hp <= 0) this._die(false);
    } else if (this.burnGlow > 0) {
      this.burnGlow = Math.max(0, this.burnGlow - dt * 3);
    }
    this.mat.color
      .copy(_white)
      .lerp(_flashRed, this.flash * 0.85)
      .lerp(_burnTint, this.burnGlow * 0.8);

    switch (this.state) {
      case "spawning": this._updateSpawning(dt, player); break;
      case "chase": this._updateChase(dt, player); break;
      case "windup": this._updateWindup(dt, player); break;
      case "swipe": this._updateSwipe(dt, player); break;
      case "cooldown": this._updateCooldown(dt, player); break;
      case "dying": this._updateDying(dt); break;
    }
  }

  _updateSpawning(dt, player) {
    this.t += dt;
    const k = clamp(this.t / RISE_TIME, 0, 1);
    this.group.position.y = -RISE_DEPTH * this.scale * (1 - easeOutCubic(k));
    // Sway while clawing up.
    this.bTorso.rotation.x = -this.hunch * k;
    this.bTorso.rotation.z = Math.sin(this.time * 5) * 0.06;
    this._faceHead(dt);
    if (k >= 1) {
      this.group.position.y = 0;
      this.state = "chase";
      this.t = 0;
    }
  }

  _updateChase(dt, player) {
    const dist = this._moveToward(dt, player, 1);
    if (dist <= ATTACK_RANGE) {
      this.state = "windup";
      this.t = 0;
      return;
    }
    this._walkPose(dt, 1);
  }

  _updateWindup(dt, player) {
    this.t += dt;
    this._turnToward(player, dt, 3);
    const k = clamp(this.t / WINDUP_TIME, 0, 1);
    // Both arms rise high, torso rears back off the hunch.
    this.bArmL.rotation.x = damp(this.bArmL.rotation.x, 1.9, 16, dt);
    this.bArmR.rotation.x = damp(this.bArmR.rotation.x, 1.9, 16, dt);
    this.bArmL.rotation.z = damp(this.bArmL.rotation.z, 0.45, 12, dt);
    this.bArmR.rotation.z = damp(this.bArmR.rotation.z, -0.45, 12, dt);
    this.bTorso.rotation.x = damp(this.bTorso.rotation.x, -this.hunch + 0.35 * k, 12, dt);
    this._settleLegs(dt);
    this._faceHead(dt);
    if (this.t >= WINDUP_TIME) {
      // Strike lands if the player is still in reach.
      _toPlayer.subVectors(player, this.group.position);
      _toPlayer.y = 0;
      if (_toPlayer.length() <= HIT_RANGE && this.sys.onPlayerDamage) {
        this.sys.onPlayerDamage(ATTACK_DAMAGE);
      }
      this.state = "swipe";
      this.t = 0;
    }
  }

  _updateSwipe(dt, player) {
    this.t += dt;
    // Quick forward lunge of the torso, arms sweep down through the target.
    this.bTorso.rotation.x = damp(this.bTorso.rotation.x, -this.hunch - 0.55, 26, dt);
    this.bArmL.rotation.x = damp(this.bArmL.rotation.x, 0.5, 26, dt);
    this.bArmR.rotation.x = damp(this.bArmR.rotation.x, 0.5, 26, dt);
    this._settleLegs(dt);
    if (this.t >= SWIPE_TIME) {
      this.state = "cooldown";
      this.t = 0;
    }
  }

  _updateCooldown(dt, player) {
    this.t += dt;
    // Shamble slowly while recovering.
    this._moveToward(dt, player, 0.35);
    this._walkPose(dt, 0.35);
    if (this.t >= COOLDOWN_TIME) {
      this.state = "chase";
      this.t = 0;
    }
  }

  _updateDying(dt) {
    this.t += dt;
    if (this.t <= CRUMPLE_TIME + 0.1) {
      const k = clamp(this.t / CRUMPLE_TIME, 0, 1);
      const e = k * k; // ease-in — accelerates into the ground
      this.group.rotation.x = -HALF_PI * 0.94 * e;
      this.group.rotation.y = this.deathYawBase + this.deathYawDelta * e;
      // Limbs go slack.
      this.bArmL.rotation.x = damp(this.bArmL.rotation.x, 1.5, 10, dt);
      this.bArmR.rotation.x = damp(this.bArmR.rotation.x, 0.35, 10, dt);
      this.bArmL.rotation.z = damp(this.bArmL.rotation.z, 0.5, 10, dt);
      this.bArmR.rotation.z = damp(this.bArmR.rotation.z, -0.3, 10, dt);
      this.bLegL.rotation.x = damp(this.bLegL.rotation.x, -0.7, 10, dt);
      this.bLegR.rotation.x = damp(this.bLegR.rotation.x, 0.45, 10, dt);
      this.bTorso.rotation.x = damp(this.bTorso.rotation.x, -0.2, 10, dt);
      this.head.rotation.z = damp(this.head.rotation.z, this.tiltZ * 2, 10, dt);
    }
    const sinkT = this.t - CRUMPLE_TIME;
    if (sinkT > 0) {
      this.group.position.y = -SINK_DEPTH * clamp(sinkT / SINK_TIME, 0, 1);
      if (sinkT >= SINK_TIME) this._park();
    }
  }

  // ---- locomotion helpers ----

  // Seek + tangent steer + separation. Returns flat distance to player.
  _moveToward(dt, player, mult) {
    const pos = this.group.position;
    _toPlayer.subVectors(player, pos);
    _toPlayer.y = 0;
    const dist = _toPlayer.length();
    if (dist < 1e-4) return dist;
    _desired.copy(_toPlayer).multiplyScalar(1 / dist);

    // Tangent steering: if a straight ray to the player is blocked by an
    // obstacle Box3, slide along the obstacle's tangent, side picked so we
    // go around the face nearest to us (cross-product side test).
    const obstacles = this.sys._obstacles;
    let blockedD = Infinity;
    let blocked = null;
    _ray.origin.set(pos.x, 0.5, pos.z);
    _ray.direction.copy(_desired);
    for (let i = 0; i < obstacles.length; i++) {
      const hit = _ray.intersectBox(obstacles[i], _hitPoint);
      if (hit) {
        const d = _hitPoint.distanceTo(_ray.origin);
        if (d < blockedD && d < Math.min(dist, STEER_LOOKAHEAD)) {
          blockedD = d;
          blocked = obstacles[i];
        }
      }
    }
    _move.copy(_desired);
    if (blocked) {
      blocked.getCenter(_boxCenter);
      _toC.subVectors(_boxCenter, pos);
      // cross(desired, toCenter).y — sign says which side the box bulk is on.
      const crossY = _desired.z * _toC.x - _desired.x * _toC.z;
      const s = crossY > 0 ? 1 : -1;
      // Tangent perpendicular to desired, away from the box bulk; keep a
      // little forward bias so they still make progress. Closer → more tangent.
      const w = 1 - clamp(blockedD / STEER_LOOKAHEAD, 0, 1);
      _move.set(
        _desired.x * (1 - w * 0.8) + s * _desired.z * w,
        0,
        _desired.z * (1 - w * 0.8) - s * _desired.x * w
      ).normalize();
    }

    // Advance (stop just short of standing inside the player).
    const step = this.speed * mult * dt;
    if (dist > 0.6) pos.addScaledVector(_move, Math.min(step, dist - 0.55));

    // Gentle separation from other zombies within SEP_RADIUS.
    const zombies = this.sys._zombies;
    for (let i = 0; i < zombies.length; i++) {
      const o = zombies[i];
      if (o === this || o.state === "inactive" || o.state === "dying") continue;
      const dx = pos.x - o.group.position.x;
      const dz = pos.z - o.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > SEP_RADIUS * SEP_RADIUS || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = ((SEP_RADIUS - d) / d) * 3.0 * dt;
      pos.x += dx * push;
      pos.z += dz * push;
    }

    // Hard push-out of obstacle boxes (zombies never clip through cover).
    for (let i = 0; i < obstacles.length; i++) {
      const b = obstacles[i];
      const r = 0.32;
      if (
        pos.x > b.min.x - r && pos.x < b.max.x + r &&
        pos.z > b.min.z - r && pos.z < b.max.z + r &&
        b.min.y < 1.5 && b.max.y > 0.1
      ) {
        const pxMin = pos.x - (b.min.x - r);
        const pxMax = (b.max.x + r) - pos.x;
        const pzMin = pos.z - (b.min.z - r);
        const pzMax = (b.max.z + r) - pos.z;
        const m = Math.min(pxMin, pxMax, pzMin, pzMax);
        if (m === pxMin) pos.x = b.min.x - r;
        else if (m === pxMax) pos.x = b.max.x + r;
        else if (m === pzMin) pos.z = b.min.z - r;
        else pos.z = b.max.z + r;
      }
    }

    // Face movement direction (smoothed shortest-arc turn).
    const targetYaw = Math.atan2(-_move.x, -_move.z);
    const turn = this.runner ? 7 : 4.5;
    const dyaw = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += dyaw * Math.min(1, dt * turn);
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = 0;

    return dist;
  }

  _turnToward(player, dt, rate) {
    const pos = this.group.position;
    const targetYaw = Math.atan2(-(player.x - pos.x), -(player.z - pos.z));
    const dyaw = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    this.yaw += dyaw * Math.min(1, dt * rate);
    this.group.rotation.y = this.yaw;
  }

  // Alternating leg swings + arm sway synced to speed; one arm reaches
  // forward (asymmetric), runners lean further into it.
  _walkPose(dt, mult) {
    this.phase += dt * this.speed * mult * (this.runner ? 2.9 : 3.4);
    const s = Math.sin(this.phase);
    const legAmp = (this.runner ? 0.72 : 0.5) * (mult > 0.6 ? 1 : 0.55);

    this.bLegL.rotation.x = s * legAmp;
    this.bLegR.rotation.x = -s * legAmp;
    this.bLegL.rotation.z = 0.05;  // slight bow-legged shamble splay
    this.bLegR.rotation.z = -0.05;
    this.bHips.position.y = HIP_Y + Math.abs(Math.cos(this.phase)) * 0.035;

    const reach = this.reachRight ? this.bArmR : this.bArmL;
    const sway = this.reachRight ? this.bArmL : this.bArmR;
    // Reaching arm: held out at the prey (near-horizontal once the torso
    // hunch is added), small hungry tremble; hand drifts toward center-line.
    reach.rotation.x = damp(reach.rotation.x, 1.35 + Math.sin(this.phase * 0.9) * 0.12, 10, dt);
    reach.rotation.z = damp(reach.rotation.z, this.reachRight ? -0.18 : 0.18, 10, dt);
    // Swaying arm: lower, swings opposite the legs.
    sway.rotation.x = damp(sway.rotation.x, 0.6 - s * 0.35, 12, dt);
    sway.rotation.z = damp(sway.rotation.z, this.reachRight ? 0.24 : -0.24, 10, dt);

    // Hunched torso + shamble roll; runners lean forward harder.
    this.bTorso.rotation.x = damp(this.bTorso.rotation.x, -this.hunch, 10, dt);
    this.bTorso.rotation.z = damp(this.bTorso.rotation.z, s * (this.runner ? 0.05 : 0.09), 10, dt);
    this._faceHead(dt);
  }

  _settleLegs(dt) {
    this.bLegL.rotation.x = damp(this.bLegL.rotation.x, 0.12, 10, dt);
    this.bLegR.rotation.x = damp(this.bLegR.rotation.x, -0.08, 10, dt);
    this.bHips.position.y = damp(this.bHips.position.y, HIP_Y, 10, dt);
  }

  // Head: tips back up only partway (face stays hungry-low), plus the
  // permanent sideways tilt.
  _faceHead(dt) {
    this.head.rotation.x = damp(this.head.rotation.x, this.hunch * 0.45, 10, dt);
    this.head.rotation.z = damp(this.head.rotation.z, this.tiltZ, 10, dt);
  }
}

// =============================================================================
// ZombieSystem — pool manager, wave spawner, update driver.
// =============================================================================
export class ZombieSystem {
  constructor(scene, deps = {}) {
    this.scene = scene;
    this.audio = deps.audio || null;
    this.effects = deps.effects || null;
    this.getPlayerPos = deps.getPlayerPos || null;
    this.onPlayerDamage = deps.onPlayerDamage || null;
    this.onZombieDown = deps.onZombieDown || null;
    this.onPointsHit = deps.onPointsHit || null;

    this.root = new THREE.Group();
    this.root.name = "zombies";
    scene.add(this.root);

    this.wave = 1;
    this._queue = 0;
    this._spawnTimer = 0;
    this._gates = [];
    this._gateCursor = 0;
    this._obstacles = [];

    this._zombies = [];
    this.hittables = [];
    for (let i = 0; i < POOL; i++) {
      const z = new Zombie(this, i);
      this._zombies.push(z);
      this.root.add(z.group);
      this.hittables.push(z.bodyHittable, z.headHittable);
    }
  }

  setGates(positions) {
    this._gates = positions || [];
  }

  setObstacles(colliders) {
    this._obstacles = colliders || [];
  }

  // round(5 · 1.18^n + n) zombies, staggered from the gates; pool overflow
  // queues and streams in as slots free up.
  startWave(n) {
    this.wave = n;
    this._queue += Math.round(5 * Math.pow(1.18, n) + n);
    this._spawnTimer = 0.4;
  }

  // Remaining in the wave (walking + queued). Wave is over at aliveCount === 0.
  get aliveCount() {
    return this.activeCount + this._queue;
  }

  get activeCount() {
    let c = 0;
    for (let i = 0; i < POOL; i++) {
      if (this._zombies[i].state !== "inactive") c++;
    }
    return c;
  }

  get queuedCount() {
    return this._queue;
  }

  update(dt) {
    if (dt <= 0) return;
    if (this.getPlayerPos) this.getPlayerPos(_player);

    // Staggered gate spawning.
    if (this._queue > 0 && this._gates.length > 0) {
      this._spawnTimer -= dt;
      if (this._spawnTimer <= 0) {
        const z = this._freeSlot();
        if (z) {
          const gate = this._gates[this._gateCursor++ % this._gates.length];
          z.activate(gate, this.wave, this._rollRunner());
          this._queue--;
          this._spawnTimer = Math.max(0.35, 1.05 - this.wave * 0.06);
        } else {
          this._spawnTimer = 0.3; // pool saturated — retry shortly
        }
      }
    }

    for (let i = 0; i < POOL; i++) {
      const z = this._zombies[i];
      if (z.state !== "inactive") z.update(dt, _player);
    }
  }

  clear() {
    this._queue = 0;
    this._spawnTimer = 0;
    for (let i = 0; i < POOL; i++) this._zombies[i]._park();
  }

  dispose() {
    this.clear();
    this.scene.remove(this.root);
    // Dispose per-zombie materials; cached geometries are shared module-scope
    // (three re-uploads them if a new system is created later — same policy
    // as targets.js shared geometry).
    for (let i = 0; i < POOL; i++) {
      this._zombies[i].mat.dispose();
      this._zombies[i].body.skeleton.dispose();
    }
    this._zombies.length = 0;
    this.hittables.length = 0;
  }

  // ---- internals ----

  _freeSlot() {
    for (let i = 0; i < POOL; i++) {
      if (this._zombies[i].state === "inactive") return this._zombies[i];
    }
    return null;
  }

  _rollRunner() {
    if (this.wave < 3) return false;
    return Math.random() < Math.min(0.45, 0.12 * (this.wave - 2));
  }
}
