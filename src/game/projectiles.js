// src/game/projectiles.js — pooled projectile simulation, segment raycasting,
// penetration, explosive AoE, and tracer rendering (single LineSegments).
// Zero per-frame allocations: fixed pool of 192 slots, module-scope scratch vectors.

import * as THREE from "three";
import { clamp, lerp, invLerp } from "../core/utils.js";

const MAX = 192;
const DEG2RAD = Math.PI / 180;
const GRAVITY = 9.81;      // m/s² for projectiles (spec)
const MAX_LIFE = 3;        // s
const MAX_RANGE = 500;     // m cumulative travel
const KILL_Y = -2;         // m
const MAX_SEG = 20;        // m — substep so each raycast segment stays exact enough
const NUDGE = 0.05;        // m pushed past a penetrated surface
const TRACER_TAIL = 0.012; // s of travel drawn as the tracer tail
const DEFAULT_TRACER = 0xffcc55;

// ---- module scratch (never allocated in hot paths) ----
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _aoePoint = new THREE.Vector3();

// Shared onHit info object (contract: { point, damage, distance, ammo, incendiary? }).
const _info = {
  point: new THREE.Vector3(),
  damage: 0,
  distance: 0,
  ammo: null,
  incendiary: null,
};
const _defaultResult = { stopped: true };

class Slot {
  constructor(index) {
    this.index = index;
    this.active = false;
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.damage = 0;
    this.falloffStart = 0;
    this.falloffEnd = 1;
    this.falloffMult = 0.4;
    this.pen = 0;
    this.ammo = null;
    this.traveled = 0;
    this.life = 0;
    // premultiplied tracer color (tracer hex × tracerAlpha)
    this.r = 1;
    this.g = 1;
    this.b = 1;
  }
}

export class ProjectileSystem {
  constructor(scene, { effects, hud, audio } = {}) {
    this.scene = scene;
    this.effects = effects || null;
    this.hud = hud || null;
    this.audio = audio || null;

    // Updated on every damaging hit (contract). Reused object — read, don't retain.
    this.lastHitInfo = null;
    this._lastHit = { damage: 0, distance: 0, flightTime: 0 };
    // Optional callback: onAnyHit(info, result) on every hit (damaging or not).
    this.onAnyHit = null;

    this._pool = new Array(MAX);
    for (let i = 0; i < MAX; i++) this._pool[i] = new Slot(i);
    this._cursor = 0;

    this._hittables = [];
    this._objects = [];             // raycast targets (hittable.object3D)
    this._map = new Map();          // object3D → hittable
    this._raycaster = new THREE.Raycaster();
    this._hits = [];                // reused intersection target array

    // ---- tracers: ONE LineSegments, 192 segments rewritten each frame ----
    const geo = new THREE.BufferGeometry();
    this._posAttr = new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3);
    this._posAttr.setUsage(THREE.DynamicDrawUsage);
    this._colAttr = new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3);
    this._colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this._posAttr);
    geo.setAttribute("color", this._colAttr);
    // Huge bounding sphere set once — never recomputed.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this._tracerMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this._tracers = new THREE.LineSegments(geo, this._tracerMat);
    this._tracers.frustumCulled = false;
    this._tracers.matrixAutoUpdate = false;
    this._colorsDirty = false;
    scene.add(this._tracers);
  }

  setHittables(list) {
    this._hittables = list || [];
    this._objects.length = 0;
    this._map.clear();
    for (let i = 0; i < this._hittables.length; i++) {
      const h = this._hittables[i];
      if (!h || !h.object3D) continue;
      this._objects.push(h.object3D);
      this._map.set(h.object3D, h);
    }
  }

  // shot = { origin, dir (normalized), spreadDeg, pellets, velocity, damage,
  //          falloffStart, falloffEnd, falloffMult, penetration, ammo }
  spawn(shot) {
    if (this.effects) this.effects.muzzleFlash(shot.origin, shot.dir);

    const pellets = Math.max(1, shot.pellets | 0);
    const spreadRad = (shot.spreadDeg || 0) * DEG2RAD;

    // Orthonormal basis perpendicular to dir (scratch, no allocs).
    if (Math.abs(shot.dir.y) < 0.99) _u.set(0, 1, 0);
    else _u.set(1, 0, 0);
    _v.crossVectors(shot.dir, _u).normalize();
    _u.crossVectors(_v, shot.dir).normalize();

    const ammo = shot.ammo || null;
    const tracer = ammo && ammo.tracer !== undefined ? ammo.tracer : DEFAULT_TRACER;
    const alpha = ammo && ammo.tracerAlpha !== undefined ? ammo.tracerAlpha : 1;
    const r = (((tracer >> 16) & 255) / 255) * alpha;
    const g = (((tracer >> 8) & 255) / 255) * alpha;
    const b = ((tracer & 255) / 255) * alpha;

    for (let p = 0; p < pellets; p++) {
      const slot = this._acquire();
      if (!slot) return;

      // Uniform random direction inside cone of half-angle spreadRad.
      const theta = spreadRad * Math.sqrt(Math.random());
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sin(theta);
      _dir.copy(shot.dir).multiplyScalar(Math.cos(theta))
        .addScaledVector(_u, s * Math.cos(phi))
        .addScaledVector(_v, s * Math.sin(phi));

      slot.active = true;
      slot.pos.copy(shot.origin);
      slot.prev.copy(shot.origin);
      slot.vel.copy(_dir).multiplyScalar(shot.velocity);
      slot.damage = shot.damage;
      slot.falloffStart = shot.falloffStart;
      slot.falloffEnd = shot.falloffEnd;
      slot.falloffMult = shot.falloffMult !== undefined ? shot.falloffMult : 0.4;
      slot.pen = shot.penetration || 0;
      slot.ammo = ammo;
      slot.traveled = 0;
      slot.life = 0;
      slot.r = r;
      slot.g = g;
      slot.b = b;

      const base = slot.index * 6;
      const col = this._colAttr.array;
      col[base] = r; col[base + 1] = g; col[base + 2] = b;
      col[base + 3] = r; col[base + 4] = g; col[base + 5] = b;
      this._colorsDirty = true;
    }
  }

  update(dt) {
    if (dt > 0) {
      const pool = this._pool;
      for (let i = 0; i < MAX; i++) {
        const slot = pool[i];
        if (!slot.active) continue;

        const speed = slot.vel.length();
        const dist = speed * dt;
        let steps = dist > MAX_SEG ? Math.ceil(dist / MAX_SEG) : 1;
        if (dt > 0.025 && steps < 2) steps = 2; // gravity accuracy at low fps
        if (steps > 8) steps = 8;
        const h = dt / steps;

        for (let s = 0; s < steps && slot.active; s++) {
          slot.prev.copy(slot.pos);
          slot.vel.y -= GRAVITY * h;
          slot.pos.addScaledVector(slot.vel, h);
          slot.life += h;

          const segLen = slot.prev.distanceTo(slot.pos);
          this._raySegment(slot, segLen);
          if (!slot.active) break;

          slot.traveled += segLen;
          if (slot.life >= MAX_LIFE || slot.traveled >= MAX_RANGE || slot.pos.y < KILL_Y) {
            this._release(slot);
          }
        }
      }
    }
    this._writeTracers();
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      if (this._pool[i].active) this._release(this._pool[i]);
    }
    this.lastHitInfo = null;
    this._writeTracers();
  }

  dispose() {
    this.clear();
    this.scene.remove(this._tracers);
    this._tracers.geometry.dispose();
    this._tracerMat.dispose();
    this._map.clear();
    this._objects.length = 0;
    this._hittables = [];
  }

  // ---- internals ----

  _acquire() {
    const pool = this._pool;
    for (let i = 0; i < MAX; i++) {
      const idx = (this._cursor + i) % MAX;
      if (!pool[idx].active) {
        this._cursor = (idx + 1) % MAX;
        return pool[idx];
      }
    }
    return null; // pool exhausted — drop the pellet
  }

  _release(slot) {
    slot.active = false;
    slot.ammo = null;
    const base = slot.index * 6;
    const col = this._colAttr.array;
    col[base] = 0; col[base + 1] = 0; col[base + 2] = 0;
    col[base + 3] = 0; col[base + 4] = 0; col[base + 5] = 0;
    this._colorsDirty = true;
  }

  _resolve(obj) {
    // Walk up the parent chain until we find a registered hittable root.
    let o = obj;
    while (o) {
      const h = this._map.get(o);
      if (h) return h;
      o = o.parent;
    }
    return null;
  }

  _raySegment(slot, segLen) {
    if (segLen < 1e-6 || this._objects.length === 0) return;

    _segDir.subVectors(slot.pos, slot.prev).multiplyScalar(1 / segLen);
    const rc = this._raycaster;
    rc.set(slot.prev, _segDir);
    rc.near = 0;
    rc.far = segLen;
    const hits = this._hits;
    hits.length = 0;
    rc.intersectObjects(this._objects, true, hits); // sorted near→far

    let skipUntil = -1;
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (hit.distance <= skipUntil) continue;
      const h = this._resolve(hit.object);
      if (!h) continue;

      const hitDist = slot.traveled + hit.distance;
      const fall = clamp(invLerp(slot.falloffStart, slot.falloffEnd, hitDist), 0, 1);
      _info.point.copy(hit.point);
      _info.damage = slot.damage * lerp(1, slot.falloffMult, fall);
      // Addendum v2: frangible rounds hit fleshy hittables (zombies) harder.
      if (h.fleshy && slot.ammo && slot.ammo.fleshBonus) {
        _info.damage *= slot.ammo.fleshBonus;
      }
      _info.distance = hitDist;
      _info.ammo = slot.ammo;
      _info.incendiary = slot.ammo && slot.ammo.incendiary ? slot.ammo.incendiary : null;

      const result = h.onHit(_info) || _defaultResult;
      this._afterHit(_info, result, slot.life, true);

      if (!result.stopped) continue; // pass-through hittable

      const cost = h.penetrationCost !== undefined ? h.penetrationCost : 1;
      if (slot.pen >= cost) {
        // Penetrate: pay cost, skip everything within the 0.05 m nudge.
        slot.pen -= cost;
        skipUntil = hit.distance + NUDGE;
      } else {
        // Stopped for good — explosive ammo detonates on any stop.
        if (slot.ammo && slot.ammo.explosive) {
          this._explode(hit.point, slot.ammo, hitDist, slot.life);
        }
        this._release(slot);
        return;
      }
    }
  }

  _afterHit(info, result, flightTime, spark) {
    if (spark && this.effects) this.effects.hitSpark(info.point);
    const dealt = result.damage || 0;
    if (dealt > 0) {
      this._lastHit.damage = dealt;
      this._lastHit.distance = info.distance;
      this._lastHit.flightTime = flightTime;
      this.lastHitInfo = this._lastHit;
      if (result.showNumber !== false) {
        if (this.effects) this.effects.damageNumber(info.point, Math.round(dealt), !!result.crit);
        if (this.hud) this.hud.hitmarker(!!result.crit);
      }
    }
    if (result.sound && this.audio) this.audio.play(result.sound);
    if (this.onAnyHit) this.onAnyHit(info, result);
  }

  _explode(point, ammo, hitDist, flightTime) {
    const exp = ammo.explosive;
    if (this.effects) this.effects.explosion(point, exp.radius);
    if (this.audio) this.audio.play("explosion");

    const r2 = exp.radius * exp.radius;
    const list = this._hittables;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      // AoE only touches hittables that expose center() — targets do, walls
      // don't. This also dedupes multi-hittable targets (only the torso entry
      // of a silhouette provides center()).
      if (!h || typeof h.center !== "function") continue;
      const c = h.center();
      if (!c || c.distanceToSquared(point) > r2) continue;

      _aoePoint.copy(c);
      _info.point.copy(_aoePoint);
      _info.damage = exp.damage; // flat AoE damage, no falloff
      _info.distance = hitDist;
      _info.ammo = ammo;
      _info.incendiary = null;
      const result = h.onHit(_info) || _defaultResult;
      this._afterHit(_info, result, flightTime, false);
    }
  }

  _writeTracers() {
    const pos = this._posAttr.array;
    const pool = this._pool;
    for (let i = 0; i < MAX; i++) {
      const slot = pool[i];
      const base = i * 6;
      if (slot.active) {
        const p = slot.pos;
        const vel = slot.vel;
        pos[base] = p.x;
        pos[base + 1] = p.y;
        pos[base + 2] = p.z;
        pos[base + 3] = p.x - vel.x * TRACER_TAIL;
        pos[base + 4] = p.y - vel.y * TRACER_TAIL;
        pos[base + 5] = p.z - vel.z * TRACER_TAIL;
      } else {
        pos[base] = 0; pos[base + 1] = 0; pos[base + 2] = 0;
        pos[base + 3] = 0; pos[base + 4] = 0; pos[base + 5] = 0;
      }
    }
    this._posAttr.needsUpdate = true;
    if (this._colorsDirty) {
      this._colAttr.needsUpdate = true;
      this._colorsDirty = false;
    }
  }
}
