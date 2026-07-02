// Zombies arena (Addendum v4): ~34×34 m dusk courtyard. Four gate arches
// (N/S/E/W) with dark opening panels the horde spills out of, scattered
// crates (some stacked), two low L-walls, a wrecked-car prop, a glowing
// mystery box and an ammo station. Owner: zombies core.
//
// Same construction pattern as rangeStaticWorld: every solid is a colored box
// merged into ONE MeshLambertMaterial({vertexColors:true}) mesh (single draw
// call + single wall hittable); player collision uses the THREE.Box3 list.
// `obstacles` is the SUBSET of cover pieces zombies steer around — gates and
// perimeter walls are deliberately NOT obstacles (zombies path straight at
// the player and only skirt cover). Lighting is owned by the screen (dusk:
// dim warm low-angle directional + cool hemisphere + fog looks right).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeScene } from "../core/utils.js";

const ARENA = 17; // half-extent; inner wall faces at ±16.7
const WALL_H = 3;
const GATE_W = 3.2; // opening width

const COLOR = {
  ground: 0x5d5a52,      // worn asphalt-dirt
  patch: 0x4f4c46,
  wall: 0x726a60,        // weathered masonry
  gate: 0x544c45,        // arch stone, darker
  gateDark: 0x131110,    // opening void panel
  crate: 0x8a7050,       // wood
  crateDark: 0x715a3f,
  crateBand: 0x5a4732,
  lwall: 0x7d8085,       // concrete
  car: 0x8a5644,         // rusted body
  carDark: 0x332d2a,     // tires / windows
  carRust: 0x684738,
  ammoGreen: 0x4c7f45,
  ammoStripe: 0xd9c24a,
  mystery: 0x3b3654,     // dark violet chest
  mysteryTrim: 0x9a6528,
  rubble: 0x6a655e,
};

function boxGeoWithColor(sx, sy, sz, color) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function box3At(cx, cy, cz, sx, sy, sz) {
  return new THREE.Box3(
    new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
    new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
  );
}

// Colored box → merge list (+ collider unless opts.collider === false).
function pushBox(geos, colliders, cx, cy, cz, sx, sy, sz, color, opts = {}) {
  const geo = boxGeoWithColor(sx, sy, sz, color);
  geo.translate(cx, cy, cz);
  geos.push(geo);
  if (opts.collider !== false) colliders.push(box3At(cx, cy, cz, sx, sy, sz));
}

function makeSignTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1c3018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#d9c24a";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = "#e8e2c8";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createZombiesWorld() {
  const group = new THREE.Group();
  group.name = "zombiesWorld";

  const geos = [];
  const colliders = [];
  const obstacles = [];

  // ---- ground -----------------------------------------------------------
  pushBox(geos, colliders, 0, -0.15, 0, ARENA * 2 + 4, 0.3, ARENA * 2 + 4, COLOR.ground);
  // Darker worn patches (visual only).
  const patches = [
    [-5, -4, 6, 5], [6, 3, 5, 7], [-2, 9, 7, 4], [3, -10, 4, 5], [-10, 4, 4, 4],
  ];
  for (const [px, pz, sx, sz] of patches) {
    pushBox(geos, colliders, px, 0.006, pz, sx, 0.012, sz, COLOR.patch, { collider: false });
  }

  // ---- perimeter walls with a gate opening centered on each side --------
  const seg = (ARENA * 2 - GATE_W) / 2;    // wall segment length beside a gate
  const segC = GATE_W / 2 + seg / 2;       // segment center offset from middle
  const t = 0.6;                           // wall thickness
  const wy = WALL_H / 2;
  // N (z = -ARENA) and S (z = +ARENA)
  for (const z of [-ARENA, ARENA]) {
    pushBox(geos, colliders, -segC, wy, z, seg, WALL_H, t, COLOR.wall);
    pushBox(geos, colliders, segC, wy, z, seg, WALL_H, t, COLOR.wall);
  }
  // W (x = -ARENA) and E (x = +ARENA)
  for (const x of [-ARENA, ARENA]) {
    pushBox(geos, colliders, x, wy, -segC, t, WALL_H, seg, COLOR.wall);
    pushBox(geos, colliders, x, wy, segC, t, WALL_H, seg, COLOR.wall);
  }

  // ---- gate arches: pillars + lintel + dark opening panel ---------------
  // Panel is solid (collider) — it blocks the player and stops bullets, but
  // zombies rise from the ground just inside it. Gates are NOT obstacles.
  const gates = [];
  const gateDefs = [
    { x: 0, z: -ARENA, horiz: true, inward: 1 },   // N
    { x: 0, z: ARENA, horiz: true, inward: -1 },   // S
    { x: ARENA, z: 0, horiz: false, inward: -1 },  // E
    { x: -ARENA, z: 0, horiz: false, inward: 1 },  // W
  ];
  for (const g of gateDefs) {
    const px = 2.1, pw = 0.75; // pillar offset from center, pillar width
    if (g.horiz) {
      pushBox(geos, colliders, g.x - px, 1.75, g.z, pw, 3.5, 1.1, COLOR.gate);
      pushBox(geos, colliders, g.x + px, 1.75, g.z, pw, 3.5, 1.1, COLOR.gate);
      pushBox(geos, colliders, g.x, 3.35, g.z, px * 2 + pw, 0.75, 1.15, COLOR.gate);
      pushBox(geos, colliders, g.x, 1.45, g.z, GATE_W + 0.3, 2.9, 0.18, COLOR.gateDark);
      gates.push(new THREE.Vector3(g.x, 0, g.z + g.inward * 1.4));
    } else {
      pushBox(geos, colliders, g.x, 1.75, g.z - px, 1.1, 3.5, pw, COLOR.gate);
      pushBox(geos, colliders, g.x, 1.75, g.z + px, 1.1, 3.5, pw, COLOR.gate);
      pushBox(geos, colliders, g.x, 3.35, g.z, 1.15, 0.75, px * 2 + pw, COLOR.gate);
      pushBox(geos, colliders, g.x, 1.45, g.z, 0.18, 2.9, GATE_W + 0.3, COLOR.gateDark);
      gates.push(new THREE.Vector3(g.x + g.inward * 1.4, 0, g.z));
    }
  }

  // ---- scattered crates (some stacked) — cover / obstacles ---------------
  // [x, z, size, stacked]
  const crateDefs = [
    [-6.5, -4.5, 1.15, true],
    [-5.4, -4.3, 1.0, false],
    [7, 5.5, 1.2, false],
    [7.9, 4.7, 0.95, true],
    [4.5, -8, 1.1, false],
    [-9, 6.5, 1.05, true],
    [1.5, 4.5, 1.0, false],
    [-3, -10.5, 1.15, false],
    [10.5, -3.5, 1.1, true],
  ];
  for (const [cx, cz, s, stacked] of crateDefs) {
    pushBox(geos, colliders, cx, s / 2, cz, s, s, s, COLOR.crate);
    pushBox(geos, colliders, cx, s / 2, cz, s + 0.04, s * 0.16, s + 0.04, COLOR.crateBand, { collider: false });
    let h = s;
    if (stacked) {
      const s2 = s * 0.8;
      pushBox(geos, colliders, cx + 0.06, s + s2 / 2, cz - 0.05, s2, s2, s2, COLOR.crateDark);
      h = s + s2;
    }
    obstacles.push(box3At(cx, h / 2, cz, s + 0.1, h, s + 0.1));
  }

  // ---- two low L-walls (waist-high cover) --------------------------------
  // Each leg is its own collider + obstacle box.
  const lWalls = [
    // [x, z of corner, legA along +X len, legB along +Z len]
    { cx: -4.5, cz: 6.0, ax: 3.4, bz: 2.6 },
    { cx: 4.0, cz: -3.5, ax: -3.2, bz: -2.4 },
  ];
  for (const w of lWalls) {
    const h = 1.15, th = 0.45;
    // leg A along X (corner at cx,cz)
    const acx = w.cx + w.ax / 2;
    pushBox(geos, colliders, acx, h / 2, w.cz, Math.abs(w.ax), h, th, COLOR.lwall);
    obstacles.push(box3At(acx, h / 2, w.cz, Math.abs(w.ax), h, th));
    // leg B along Z
    const bcz = w.cz + w.bz / 2;
    pushBox(geos, colliders, w.cx, h / 2, bcz, th, h, Math.abs(w.bz), COLOR.lwall);
    obstacles.push(box3At(w.cx, h / 2, bcz, th, h, Math.abs(w.bz)));
    // chipped top cap on the corner (visual)
    pushBox(geos, colliders, w.cx, h + 0.04, w.cz, th + 0.14, 0.08, th + 0.14, COLOR.rubble, { collider: false });
  }

  // ---- wrecked car (blocky prop, axis-aligned along Z) -------------------
  {
    const cx = -9.5, cz = -8.5;
    pushBox(geos, colliders, cx, 0.72, cz, 1.9, 0.75, 4.2, COLOR.car);          // body
    pushBox(geos, colliders, cx, 1.35, cz + 0.35, 1.7, 0.55, 2.0, COLOR.carRust); // cabin
    pushBox(geos, colliders, cx, 1.32, cz + 0.35, 1.74, 0.34, 1.6, COLOR.carDark, { collider: false }); // windows
    pushBox(geos, colliders, cx, 0.45, cz - 1.9, 1.92, 0.5, 0.5, COLOR.carRust, { collider: false });   // crumpled nose
    // tire stubs
    for (const [dx, dz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      pushBox(geos, colliders, cx + dx, 0.32, cz + dz, 0.28, 0.64, 0.64, COLOR.carDark, { collider: false });
    }
    obstacles.push(box3At(cx, 0.9, cz, 2.3, 1.8, 4.5));
  }

  // ---- mystery box: glowing accent chest ----------------------------------
  const mysteryPos = new THREE.Vector3(-13.2, 0, 10.8);
  pushBox(geos, colliders, mysteryPos.x, 0.42, mysteryPos.z, 1.3, 0.84, 0.85, COLOR.mystery);
  pushBox(geos, colliders, mysteryPos.x, 0.42, mysteryPos.z, 1.36, 0.14, 0.91, COLOR.mysteryTrim, { collider: false });
  obstacles.push(box3At(mysteryPos.x, 0.45, mysteryPos.z, 1.4, 0.95, 0.95));

  // ---- ammo station: green crate + wall sign ------------------------------
  const ammoPos = new THREE.Vector3(10.5, 0, 16.0);
  pushBox(geos, colliders, ammoPos.x, 0.35, ammoPos.z, 1.5, 0.7, 0.75, COLOR.ammoGreen);
  pushBox(geos, colliders, ammoPos.x, 0.52, ammoPos.z, 1.56, 0.14, 0.81, COLOR.ammoStripe, { collider: false });
  obstacles.push(box3At(ammoPos.x, 0.35, ammoPos.z, 1.6, 0.8, 0.85));

  // ---- merge all solids ---------------------------------------------------
  const mergedGeo = mergeGeometries(geos, false);
  const mergedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
  mergedMesh.name = "zombiesArena";
  group.add(mergedMesh);

  const wallHittables = [
    {
      object3D: mergedMesh,
      penetrationCost: 1,
      onHit: () => ({ stopped: true, showNumber: false }),
    },
  ];

  // Mystery box lid: separate emissive mesh (the glow accent).
  const lidMat = new THREE.MeshLambertMaterial({
    color: 0x6b4a1a,
    emissive: 0xffb347,
    emissiveIntensity: 0.85,
  });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.12, 0.89), lidMat);
  lid.position.set(mysteryPos.x, 0.9, mysteryPos.z);
  group.add(lid);
  wallHittables.push({
    object3D: lid,
    penetrationCost: 1,
    onHit: () => ({ stopped: true, showNumber: false }),
  });

  // Ammo sign on the south wall above the crate.
  const signTex = makeSignTexture("AMMO");
  const signMat = new THREE.MeshLambertMaterial({ map: signTex });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), signMat);
  sign.position.set(ammoPos.x, 1.9, ARENA - t / 2 - 0.02);
  sign.rotation.y = Math.PI; // face into the arena (-Z side of the south wall)
  group.add(sign);

  const spawn = { position: new THREE.Vector3(0, 0, 11), yaw: 0 }; // center-south, facing N

  function dispose() {
    disposeScene(group);
  }

  return {
    group,
    colliders,
    wallHittables,
    gates,
    obstacles,
    spawn,
    ammoCrate: { position: ammoPos, radius: 1.6, cost: 750 },
    mysteryBox: { position: mysteryPos, radius: 1.6, cost: 950 },
    dispose,
  };
}
