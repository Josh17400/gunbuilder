// src/game/effects.js — pooled visual feedback: damage numbers, hit sparks,
// muzzle flash, explosions. All pools preallocated in the constructor; update()
// performs zero allocations. No lights — additive sprites only.

import * as THREE from "three";
import { clamp, lerp } from "../core/utils.js";

const DN_COUNT = 24;
const DN_LIFE = 0.7;   // s
const DN_RISE = 0.6;   // m
const SPARK_COUNT = 16;
const SPARK_LIFE = 0.12;
const EXPLO_COUNT = 4;
const EXPLO_LIFE = 0.15;
const FLASH_LIFE = 0.04;

const _v = new THREE.Vector3();

function makeRadialTexture(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // Optional: screens may set this for mild distance-scaling of damage numbers.
    this.camera = null;

    this.group = new THREE.Group();
    this.group.name = "effects";
    scene.add(this.group);

    // ---- damage numbers: 24 sprites, each with its own 96×48 canvas ----
    this._dn = new Array(DN_COUNT);
    this._dnCursor = 0;
    for (let i = 0; i < DN_COUNT; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 48;
      const ctx = canvas.getContext("2d");
      const texture = new THREE.CanvasTexture(canvas);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false, // always readable over geometry
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 1000;
      sprite.visible = false;
      this.group.add(sprite);
      this._dn[i] = { sprite, material, texture, ctx, life: 0 };
    }

    // ---- hit sparks: 16 additive sprites sharing one radial texture ----
    this._sparkTex = makeRadialTexture(64);
    this._sparks = new Array(SPARK_COUNT);
    this._sparkCursor = 0;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._sparkTex,
        color: 0xffd9a0,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this._sparks[i] = { sprite, material, life: 0 };
    }

    // ---- muzzle flash: single reused additive sprite ----
    {
      const material = new THREE.SpriteMaterial({
        map: this._sparkTex,
        color: 0xffc36b,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this._flash = { sprite, material, life: 0 };
    }

    // ---- explosions: 4 reused additive spheres ----
    this._exploGeo = new THREE.SphereGeometry(1, 16, 12);
    this._explos = new Array(EXPLO_COUNT);
    this._exploCursor = 0;
    for (let i = 0; i < EXPLO_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffa540,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this._exploGeo, material);
      mesh.visible = false;
      mesh.frustumCulled = false; // scale animates; skip bounds churn
      this.group.add(mesh);
      this._explos[i] = { mesh, material, life: 0, radius: 1 };
    }
  }

  damageNumber(pos, amount, crit) {
    const s = this._dn[this._dnCursor];
    this._dnCursor = (this._dnCursor + 1) % DN_COUNT;

    const ctx = s.ctx;
    ctx.clearRect(0, 0, 96, 48);
    ctx.font = crit ? "bold 40px sans-serif" : "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#000";
    const text = String(amount);
    ctx.strokeText(text, 48, 25);
    ctx.fillStyle = crit ? "#ffd24a" : "#ffffff";
    ctx.fillText(text, 48, 25);
    s.texture.needsUpdate = true;

    s.sprite.position.set(
      pos.x + (Math.random() - 0.5) * 0.12,
      pos.y,
      pos.z + (Math.random() - 0.5) * 0.12
    );
    let scale = crit ? 0.55 : 0.42;
    if (this.camera) {
      _v.setFromMatrixPosition(this.camera.matrixWorld);
      scale *= clamp(0.85 + _v.distanceTo(pos) * 0.03, 0.9, 2.6);
    }
    s.sprite.scale.set(scale, scale * 0.5, 1);
    s.material.opacity = 1;
    s.sprite.visible = true;
    s.life = DN_LIFE;
  }

  hitSpark(pos) {
    const s = this._sparks[this._sparkCursor];
    this._sparkCursor = (this._sparkCursor + 1) % SPARK_COUNT;
    s.sprite.position.copy(pos);
    s.sprite.scale.set(0.1, 0.1, 1);
    s.material.opacity = 1;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.sprite.visible = true;
    s.life = SPARK_LIFE;
  }

  muzzleFlash(worldPos, dir) {
    const f = this._flash;
    f.sprite.position.copy(worldPos);
    if (dir) f.sprite.position.addScaledVector(dir, 0.06);
    const scale = 0.2 + Math.random() * 0.12;
    f.sprite.scale.set(scale, scale, 1);
    f.material.rotation = Math.random() * Math.PI * 2;
    f.material.opacity = 1;
    f.sprite.visible = true;
    f.life = FLASH_LIFE;
  }

  explosion(pos, radius) {
    const e = this._explos[this._exploCursor];
    this._exploCursor = (this._exploCursor + 1) % EXPLO_COUNT;
    e.mesh.position.copy(pos);
    e.mesh.scale.setScalar(0.01);
    e.material.opacity = 0.85;
    e.mesh.visible = true;
    e.radius = radius;
    e.life = EXPLO_LIFE;
  }

  update(dt) {
    // damage numbers: rise + fade
    for (let i = 0; i < DN_COUNT; i++) {
      const s = this._dn[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.y += (DN_RISE / DN_LIFE) * dt;
      s.material.opacity = clamp(s.life / (DN_LIFE * 0.65), 0, 1);
    }

    // sparks: 120 ms scale-pop
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = this._sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.sprite.visible = false;
        continue;
      }
      const t = 1 - s.life / SPARK_LIFE;
      const ease = 1 - (1 - t) * (1 - t);
      const sc = lerp(0.1, 0.4, ease);
      s.sprite.scale.set(sc, sc, 1);
      s.material.opacity = 1 - t;
    }

    // muzzle flash
    if (this._flash.life > 0) {
      this._flash.life -= dt;
      if (this._flash.life <= 0) this._flash.sprite.visible = false;
    }

    // explosions: expanding fading spheres
    for (let i = 0; i < EXPLO_COUNT; i++) {
      const e = this._explos[i];
      if (e.life <= 0) continue;
      e.life -= dt;
      if (e.life <= 0) {
        e.mesh.visible = false;
        continue;
      }
      const t = 1 - e.life / EXPLO_LIFE;
      const sc = Math.max(0.01, e.radius * (1 - (1 - t) * (1 - t)));
      e.mesh.scale.setScalar(sc);
      e.material.opacity = 0.85 * (1 - t);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (let i = 0; i < DN_COUNT; i++) {
      this._dn[i].texture.dispose();
      this._dn[i].material.dispose();
    }
    for (let i = 0; i < SPARK_COUNT; i++) this._sparks[i].material.dispose();
    this._flash.material.dispose();
    this._sparkTex.dispose();
    for (let i = 0; i < EXPLO_COUNT; i++) this._explos[i].material.dispose();
    this._exploGeo.dispose();
  }
}
