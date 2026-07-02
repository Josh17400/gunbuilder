// src/game/targets.js — range targets implementing the Hittable interface.
// All classes expose: .group (add to scene), .hittables: Hittable[],
// .update(dt, playerPos), .reset(). Low-poly merged geometry, ≤3 draw calls each.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { audio } from "../core/audio.js";
import { clamp } from "../core/utils.js";

const HALF_PI = Math.PI / 2;
const RISE_TIME = 0.25;  // s, hinge -90° → 0 ease-out
const FALL_TIME = 0.3;   // s, tip-over on death

// ---- shared materials (module scope; three re-uploads after disposeScene) ----
const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const silhouetteMatBase = new THREE.MeshLambertMaterial({ vertexColors: true });
const thinWallMat = new THREE.MeshLambertMaterial({
  color: 0xb8c4cc,
  transparent: true,
  opacity: 0.85,
});

const _white = new THREE.Color(0xffffff);
const _burnTint = new THREE.Color(0xff7a2a);

// Reused onHit results (read immediately by ProjectileSystem, never retained).
const INERT_RESULT = { stopped: true, damage: 0, crit: false, showNumber: false };
const _hitResult = { stopped: true, damage: 0, crit: false, showNumber: true, sound: "hit" };

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

// Fill a flat per-vertex color attribute (Lambert + vertexColors flat-tone look).
function colorize(geom, hex) {
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  for (let i = 0; i < n; i++) {
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  }
  geom.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geom;
}

// ---- cached geometries (built once, shared across instances) ----
let _ringGeo = null;
function ringGeo() {
  if (!_ringGeo) {
    _ringGeo = mergeGeometries([
      colorize(new THREE.BoxGeometry(0.08, 1.2, 0.08).translate(0, 0.6, 0), 0x8a6a42), // post
      colorize(new THREE.CylinderGeometry(0.35, 0.35, 0.03, 24).rotateX(HALF_PI).translate(0, 1.35, 0), 0xf0ead8),
      colorize(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 20).rotateX(HALF_PI).translate(0, 1.35, -0.02), 0xcc4433),
      colorize(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16).rotateX(HALF_PI).translate(0, 1.35, -0.04), 0xe8b23c),
    ], false);
  }
  return _ringGeo;
}

let _plateFrameGeo = null;
function plateFrameGeo() {
  if (!_plateFrameGeo) {
    _plateFrameGeo = mergeGeometries([
      colorize(new THREE.BoxGeometry(0.06, 1.7, 0.06).translate(-0.34, 0.85, 0), 0x555a60),
      colorize(new THREE.BoxGeometry(0.06, 1.7, 0.06).translate(0.34, 0.85, 0), 0x555a60),
      colorize(new THREE.BoxGeometry(0.8, 0.06, 0.06).translate(0, 1.7, 0), 0x555a60),
    ], false);
  }
  return _plateFrameGeo;
}

let _plateGeo = null;
function plateGeo() {
  if (!_plateGeo) {
    _plateGeo = mergeGeometries([
      colorize(new THREE.BoxGeometry(0.025, 0.32, 0.025).translate(-0.1, -0.16, 0), 0x3a3d40), // chain
      colorize(new THREE.BoxGeometry(0.025, 0.32, 0.025).translate(0.1, -0.16, 0), 0x3a3d40),  // chain
      colorize(new THREE.CylinderGeometry(0.19, 0.19, 0.025, 20).rotateX(HALF_PI).translate(0, -0.5, 0), 0x9aa0a6),
    ], false);
  }
  return _plateGeo;
}

const SILHOUETTE_TAN = 0xd8c49a;
let _torsoGeoTan = null;
let _torsoGeoNoShoot = null;
function torsoGeo(noShoot) {
  if (noShoot) {
    if (!_torsoGeoNoShoot) {
      _torsoGeoNoShoot = mergeGeometries([
        colorize(new THREE.BoxGeometry(0.45, 0.6, 0.04).translate(0, 0.3, 0), 0xf4f4f4),
        // red X stripe: two thin crossed boxes, slightly thicker than the torso
        colorize(new THREE.BoxGeometry(0.52, 0.07, 0.05).rotateZ(Math.PI / 4).translate(0, 0.3, 0), 0xcc2222),
        colorize(new THREE.BoxGeometry(0.52, 0.07, 0.05).rotateZ(-Math.PI / 4).translate(0, 0.3, 0), 0xcc2222),
      ], false);
    }
    return _torsoGeoNoShoot;
  }
  if (!_torsoGeoTan) {
    _torsoGeoTan = colorize(new THREE.BoxGeometry(0.45, 0.6, 0.04).translate(0, 0.3, 0), SILHOUETTE_TAN);
  }
  return _torsoGeoTan;
}

let _headGeoTan = null;
let _headGeoNoShoot = null;
function headGeo(noShoot) {
  if (noShoot) {
    if (!_headGeoNoShoot) {
      _headGeoNoShoot = colorize(new THREE.BoxGeometry(0.18, 0.18, 0.04).translate(0, 0.69, 0), 0xf4f4f4);
    }
    return _headGeoNoShoot;
  }
  if (!_headGeoTan) {
    _headGeoTan = colorize(new THREE.BoxGeometry(0.18, 0.18, 0.04).translate(0, 0.69, 0), SILHOUETTE_TAN);
  }
  return _headGeoTan;
}

let _popupBaseGeo = null;
function popupBaseGeo() {
  if (!_popupBaseGeo) {
    _popupBaseGeo = colorize(new THREE.BoxGeometry(0.5, 0.05, 0.28).translate(0, 0.025, 0), 0x55504a);
  }
  return _popupBaseGeo;
}

let _cartGeo = null;
function cartGeo() {
  if (!_cartGeo) {
    _cartGeo = mergeGeometries([
      colorize(new THREE.BoxGeometry(0.55, 0.14, 0.34).translate(0, 0.11, 0), 0x556066),
      colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10).rotateZ(HALF_PI).translate(0, 0.05, 0.12), 0x2f3236),
      colorize(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10).rotateZ(HALF_PI).translate(0, 0.05, -0.12), 0x2f3236),
    ], false);
  }
  return _cartGeo;
}

// =============================================================================
// RingTarget — 3 nested rings on a post; bullseye ×2 crit; never dies.
// =============================================================================
export class RingTarget {
  constructor({ position, yaw = 0 }) {
    this.group = new THREE.Group();
    if (position) this.group.position.copy(position);
    this.group.rotation.y = yaw; // faces -Z by default

    this._mesh = new THREE.Mesh(ringGeo(), flatMat);
    this.group.add(this._mesh);

    this._centerObj = new THREE.Object3D();
    this._centerObj.position.set(0, 1.35, 0);
    this.group.add(this._centerObj);
    this._center = new THREE.Vector3();

    const self = this;
    this.hittables = [{
      object3D: this.group,
      penetrationCost: 0.4,
      center() { return self._centerObj.getWorldPosition(self._center); },
      onHit(info) { return self._onHit(info); },
    }];
  }

  _onHit(info) {
    const c = this._centerObj.getWorldPosition(this._center);
    const d = info.point.distanceTo(c); // discs are thin, 3D distance ≈ radial
    if (d > 0.37) return INERT_RESULT;  // post hit — stops, no score
    const crit = d <= 0.1;              // gold bullseye r 0.09 (+epsilon) → ×2
    _hitResult.damage = info.damage * (crit ? 2 : 1);
    _hitResult.crit = crit;
    _hitResult.sound = "hit";
    return _hitResult;
  }

  update(dt, playerPos) {}
  reset() {}
}

// =============================================================================
// SteelPlate — gray disc on chains; "ding" + spring-damped swing; solid (cost 1).
// =============================================================================
export class SteelPlate {
  constructor({ position, yaw = 0 }) {
    this.group = new THREE.Group();
    if (position) this.group.position.copy(position);
    this.group.rotation.y = yaw;

    this._frame = new THREE.Mesh(plateFrameGeo(), flatMat);
    this.group.add(this._frame);

    this._pivot = new THREE.Group();
    this._pivot.position.set(0, 1.7, 0);
    this.group.add(this._pivot);
    this._plate = new THREE.Mesh(plateGeo(), flatMat);
    this._pivot.add(this._plate);

    this._centerObj = new THREE.Object3D();
    this._centerObj.position.set(0, -0.5, 0);
    this._pivot.add(this._centerObj);
    this._center = new THREE.Vector3();

    this._ang = 0;
    this._angVel = 0;

    const self = this;
    this.hittables = [{
      object3D: this._pivot, // plate + chains; frame posts don't ding
      penetrationCost: 1,    // bullets never pass steel
      center() { return self._centerObj.getWorldPosition(self._center); },
      onHit(info) { return self._onHit(info); },
    }];
  }

  _onHit(info) {
    // Rotation impulse on the hinge, spring-damped back in update().
    this._angVel += clamp(1.5 + info.damage * 0.05, 1.5, 6);
    _hitResult.damage = info.damage;
    _hitResult.crit = false;
    _hitResult.sound = "ding";
    return _hitResult;
  }

  update(dt, playerPos) {
    const acc = -30 * this._ang - 3.5 * this._angVel; // spring-damper
    this._angVel += acc * dt;
    this._ang += this._angVel * dt;
    this._pivot.rotation.x = this._ang;
  }

  reset() {
    this._ang = 0;
    this._angVel = 0;
    this._pivot.rotation.x = 0;
  }
}

// =============================================================================
// Silhouette base (not exported) — shared by PopUpTarget and MoverTarget.
// Torso + head sub-meshes, each its own Hittable entry: crit is decided exactly
// by which sub-mesh the ray intersected (head ×1.8). Only the torso entry
// exposes center(), so explosive AoE hits a silhouette exactly once.
// Per-target cloned material → incendiary burn tint per instance.
// =============================================================================
class SilhouetteTarget {
  constructor({ position, yaw = 0, hp = 60, noShoot = false }) {
    this.group = new THREE.Group();
    if (position) this.group.position.copy(position);
    this.group.rotation.y = yaw;

    this.hp = hp;
    this.maxHp = hp;
    this.noShoot = noShoot;
    this.wasShot = false;
    this.onFall = null;
    this.state = "up";

    this._mat = silhouetteMatBase.clone();
    this._hinge = new THREE.Group();
    this.group.add(this._hinge);
    this._torso = new THREE.Mesh(torsoGeo(noShoot), this._mat);
    this._head = new THREE.Mesh(headGeo(noShoot), this._mat);
    this._hinge.add(this._torso);
    this._hinge.add(this._head);

    this._centerObj = new THREE.Object3D();
    this._centerObj.position.set(0, 0.34, 0);
    this._hinge.add(this._centerObj);
    this._center = new THREE.Vector3();

    this._fallT = 1;
    this._fallTilt = 0;
    this._burnDps = 0;
    this._burnUntil = 0;
    this._burnGlow = 0;
    this._time = 0;

    const self = this;
    this.hittables = [
      {
        object3D: this._torso,
        penetrationCost: 0.4,
        center() { return self._centerObj.getWorldPosition(self._center); },
        onHit(info) { return self._hit(info, false); },
      },
      {
        object3D: this._head,
        penetrationCost: 0.4,
        // no center(): AoE is applied through the torso entry only
        onHit(info) { return self._hit(info, true); },
      },
    ];
  }

  _hit(info, isHead) {
    if (this.state !== "up") return INERT_RESULT; // flat boards soak, no score
    const crit = isHead;
    const dmg = info.damage * (crit ? 1.8 : 1);
    this.wasShot = true;
    this.hp -= dmg;
    if (info.incendiary) {
      this._burnDps = info.incendiary.dps || 0;
      this._burnUntil = this._time + (info.incendiary.duration || 0);
    }
    if (this.hp <= 0) this._fall();
    _hitResult.damage = dmg;
    _hitResult.crit = crit;
    _hitResult.sound = "hit";
    return _hitResult;
  }

  _fall() {
    if (this.state === "fallen") return;
    this.state = "fallen";
    this._fallT = 0;
    this._fallTilt = (Math.random() - 0.5) * 0.5;
    audio.play("fall");
    if (this.onFall) this.onFall(this);
  }

  _updateBody(dt) {
    this._time += dt;

    // Incendiary DoT (targets tick it themselves per contract).
    if (this.state === "up" && this._burnDps > 0 && this._time < this._burnUntil) {
      this.hp -= this._burnDps * dt;
      this._burnGlow = Math.min(1, this._burnGlow + dt * 5);
      if (this.hp <= 0) this._fall();
    } else if (this._burnGlow > 0) {
      this._burnGlow = Math.max(0, this._burnGlow - dt * 3);
    }
    // Tint toward orange while burning (per-target material instance).
    this._mat.color.copy(_white).lerp(_burnTint, this._burnGlow);

    // Fall animation: rotate down + slight random tilt.
    if (this.state === "fallen" && this._fallT < 1) {
      this._fallT = Math.min(1, this._fallT + dt / FALL_TIME);
      const k = this._fallT * this._fallT; // ease-in
      this._hinge.rotation.x = -HALF_PI * k;
      this._hinge.rotation.z = this._fallTilt * k;
    }
  }

  _resetBody() {
    this.hp = this.maxHp;
    this.state = "up";
    this.wasShot = false;
    this._burnDps = 0;
    this._burnUntil = 0;
    this._burnGlow = 0;
    this._fallT = 1;
    this._fallTilt = 0;
    this._hinge.rotation.set(0, 0, 0);
    this._mat.color.copy(_white);
  }
}

// =============================================================================
// PopUpTarget — hinged silhouette; rises when the player enters triggerZone.
// States: "down" | "up" | "fallen". Head hit = crit ×1.8. noShoot = white + red X.
// =============================================================================
export class PopUpTarget extends SilhouetteTarget {
  constructor({ position, yaw = 0, hp = 60, noShoot = false, triggerZone = null }) {
    super({ position, yaw, hp, noShoot });
    this.triggerZone = triggerZone;

    this._base = new THREE.Mesh(popupBaseGeo(), flatMat);
    this.group.add(this._base);
    this._hinge.position.y = 0.04;

    this.state = "down";
    this._riseT = 0;
    this._hinge.rotation.x = -HALF_PI; // flat
  }

  update(dt, playerPos) {
    if (this.state === "down" && playerPos &&
        (!this.triggerZone || this.triggerZone.containsPoint(playerPos))) {
      this.state = "up";
      this._riseT = 0;
      audio.play("popup");
    }
    if (this.state === "up" && this._riseT < 1) {
      this._riseT = Math.min(1, this._riseT + dt / RISE_TIME);
      this._hinge.rotation.x = -HALF_PI * (1 - easeOutCubic(this._riseT));
    }
    this._updateBody(dt);
  }

  reset() {
    this._resetBody();
    this.state = "down";
    this._riseT = 0;
    this._hinge.rotation.x = -HALF_PI;
  }
}

// =============================================================================
// MoverTarget — silhouette on a cart, slides base + axis·sin(t·speed)·range.
// Always up (no trigger); stops sliding once fallen.
// =============================================================================
export class MoverTarget extends SilhouetteTarget {
  constructor({ position, yaw = 0, axis, range = 2, speed = 1, hp = 60 }) {
    super({ position, yaw, hp, noShoot: false });
    this._basePos = position ? position.clone() : new THREE.Vector3();
    this._axis = axis ? axis.clone().normalize() : new THREE.Vector3(1, 0, 0);
    this._range = range;
    this._speed = speed;

    this._cart = new THREE.Mesh(cartGeo(), flatMat);
    this.group.add(this._cart);
    this._hinge.position.y = 0.18;

    this._slideT = 0;
  }

  update(dt, playerPos) {
    if (this.state === "up") {
      this._slideT += dt;
      this.group.position
        .copy(this._basePos)
        .addScaledVector(this._axis, Math.sin(this._slideT * this._speed) * this._range);
    }
    this._updateBody(dt);
  }

  reset() {
    this._resetBody();
    this._slideT = 0;
    this.group.position.copy(this._basePos);
  }
}

// =============================================================================
// ThinWall — penetrable panel (cost 0.5); stops weak rounds, no damage shown.
// position = center of the panel's base on the ground.
// =============================================================================
export class ThinWall {
  constructor({ position, size = null, yaw = 0 }) {
    this.group = new THREE.Group();
    if (position) this.group.position.copy(position);
    this.group.rotation.y = yaw;

    const sx = size ? size.x : 1.8;
    const sy = size ? size.y : 1.2;
    const sz = size ? size.z : 0.04;
    this._mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), thinWallMat);
    this._mesh.position.y = sy / 2;
    this.group.add(this._mesh);

    // No center() → excluded from explosive AoE (walls don't take splash).
    this.hittables = [{
      object3D: this.group,
      penetrationCost: 0.5,
      onHit() { return INERT_RESULT; },
    }];
  }

  update(dt, playerPos) {}
  reset() {}
}
