// Static firing range world: covered firing line, 4 lanes, target lines at
// 10/25/50/100 m, distance signboards, perimeter berms. Owner E.
//
// Everything solid (walls/floor/roof/berms) is merged into ONE
// MeshLambertMaterial({vertexColors:true}) mesh for a single draw call, plus
// a handful of separate small meshes for the CanvasTexture distance signs.
// Bullets are stopped by a single wallHittable that points at that merged
// mesh; physical player collision uses the individual THREE.Box3 list.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeScene } from "../core/utils.js";
import { RingTarget, SteelPlate } from "../game/targets.js";
import { makeBlobShadows, makeGroundPatches } from "./skybits.js";

const COLOR = {
  concrete: 0x8a8d90,
  darkConcrete: 0x6b6e72,
  wood: 0x9a7b4f,
  grass: 0x6fa05a,
  sand: 0xc9b98a,
  metal: 0x5a6068,
  ammoGreen: 0x3f6b3a,
  ammoStripe: 0xd9c24a,
  post: 0x6b6e72,
};

// --- geometry helpers (duplicated per-world on purpose, see brief) --------

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

// Pushes a colored box into `geos` (for merging) and, unless opts.collider
// is explicitly false, a matching THREE.Box3 into `colliders`.
function pushBox(geos, colliders, cx, cy, cz, sx, sy, sz, color, opts = {}) {
  const geo = boxGeoWithColor(sx, sy, sz, color);
  geo.translate(cx, cy, cz);
  geos.push(geo);
  if (opts.collider !== false) {
    colliders.push(
      new THREE.Box3(
        new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
        new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
      )
    );
  }
}

function pushInvisibleWall(colliders, cx, cy, cz, sx, sy, sz) {
  colliders.push(
    new THREE.Box3(
      new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
      new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2)
    )
  );
}

function makeSignTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#123018";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createStaticRangeWorld() {
  const group = new THREE.Group();
  group.name = "staticRangeWorld";

  const geos = [];
  const colliders = [];

  // (lighting is owned by the screen — worlds are pure geometry)

  // ---- ground ---------------------------------------------------------
  // Grass field, top surface at y=0, from the back berm to behind the pad.
  pushBox(geos, colliders, 0, -0.15, -58, 16, 0.3, 140, COLOR.grass);

  // Concrete firing pad: X:[-6,6], Z:[0,4] (Z=0 is the downrange edge).
  pushBox(geos, colliders, 0, -0.03, 2, 12, 0.06, 4, COLOR.concrete);

  // ---- covered firing line: roof on 4 posts --------------------------
  const postPositions = [
    [-5.7, 0.3],
    [5.7, 0.3],
    [-5.7, 3.7],
    [5.7, 3.7],
  ];
  for (const [px, pz] of postPositions) {
    pushBox(geos, colliders, px, 1.65, pz, 0.3, 3.3, 0.3, COLOR.post);
  }
  // Keep the roof well above eye height (1.65) — at 75° FOV a low slab
  // swallows the top of the frame from the firing line.
  pushBox(geos, colliders, 0, 3.45, 2, 12.6, 0.25, 4.6, COLOR.concrete);

  // Waist-high bench along the downrange edge of the pad.
  pushBox(geos, colliders, 0, 0.45, 0.6, 11, 0.9, 0.5, COLOR.wood);

  // Ammo crate (green box, yellow stripe) at the east end of the bench.
  const ammoCratePos = new THREE.Vector3(5.3, 0.3, 1.3);
  pushBox(geos, colliders, ammoCratePos.x, 0.3, ammoCratePos.z, 0.7, 0.6, 0.7, COLOR.ammoGreen);
  pushBox(geos, colliders, ammoCratePos.x, 0.45, ammoCratePos.z, 0.75, 0.12, 0.75, COLOR.ammoStripe, {
    collider: false,
  });

  // ---- lane dividers (low walls near the firing line only, first 5m) --
  for (const dx of [-3, 0, 3]) {
    pushBox(geos, colliders, dx, 0.5, -2.5, 0.15, 1.0, 5, COLOR.darkConcrete);
  }

  // ---- perimeter berms --------------------------------------------------
  const bermZStart = 4.5;
  const bermZEnd = -121;
  const bermLen = bermZStart - bermZEnd;
  const bermCenterZ = (bermZStart + bermZEnd) / 2;
  pushBox(geos, colliders, -7.5, 2, bermCenterZ, 1.5, 4, bermLen, COLOR.grass);
  pushBox(geos, colliders, 7.5, 2, bermCenterZ, 1.5, 4, bermLen, COLOR.grass);
  // Back berm at ~120m.
  pushBox(geos, colliders, 0, 3, -122, 16, 6, 2, COLOR.sand);
  // North cap sealing the gap behind the pad between the two side berms
  // (invisible boundary — player can walk downrange but not escape here).
  pushInvisibleWall(colliders, 0, 1.5, 4.55, 13.5, 3, 0.5);

  // ---- ground variation: worn grass patches (merged → 0 extra calls) ---
  geos.push(...makeGroundPatches([
    { x: -3.5, z: -14, sx: 5.5, sz: 4.5, color: 0x639454, rot: 0.4 },
    { x: 3.0, z: -30, sx: 6.5, sz: 5.0, color: 0x5e8a4e, rot: -0.3 },
    { x: -2.0, z: -46, sx: 5.0, sz: 7.0, color: 0x649051, rot: 0.7 },
    { x: 4.0, z: -66, sx: 7.0, sz: 5.5, color: 0x5c874d, rot: -0.6 },
    { x: -3.5, z: -84, sx: 6.0, sz: 6.0, color: 0x628f50, rot: 0.2 },
    { x: 1.5, z: -105, sx: 8.0, sz: 6.5, color: 0x5e8a4e, rot: -0.4 },
    { x: 0.0, z: -8, sx: 4.0, sz: 3.0, color: 0x67985a, rot: 1.1 },
  ]));

  // ---- merge all solid geometry into one mesh --------------------------
  const mergedGeo = mergeGeometries(geos, false);
  const mergedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
  mergedMesh.name = "rangeStatic";
  group.add(mergedMesh);

  const wallHittables = [
    {
      object3D: mergedMesh,
      penetrationCost: 1,
      onHit: () => ({ stopped: true, showNumber: false }),
    },
  ];

  // ---- distance signboards (separate meshes, own CanvasTexture) -------
  const signGeo = new THREE.PlaneGeometry(1.6, 0.8);
  const signMaterials = [];
  const distances = [10, 25, 50, 100];
  for (const d of distances) {
    const tex = makeSignTexture(`${d} m`);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    signMaterials.push(mat);
    const sign = new THREE.Mesh(signGeo, mat);
    sign.position.set(-6.7, 1.6, -d);
    sign.rotation.y = Math.PI / 2; // face +X, toward the lanes
    group.add(sign);
  }

  // ---- targets: RingTarget lanes 1&3, SteelPlate lanes 2&4, all 4 dist -
  const laneX = { 1: -4.5, 2: -1.5, 3: 1.5, 4: 4.5 };
  const targets = [];
  for (const d of distances) {
    targets.push(new RingTarget({ position: new THREE.Vector3(laneX[1], 1.3, -d), yaw: Math.PI }));
    targets.push(new SteelPlate({ position: new THREE.Vector3(laneX[2], 1.0, -d), yaw: Math.PI }));
    targets.push(new RingTarget({ position: new THREE.Vector3(laneX[3], 1.3, -d), yaw: Math.PI }));
    targets.push(new SteelPlate({ position: new THREE.Vector3(laneX[4], 1.0, -d), yaw: Math.PI }));
  }
  for (const t of targets) group.add(t.group);

  // Soft blob shadows under every target — ONE merged mesh (1 draw call).
  group.add(makeBlobShadows(targets.map((t) => ({
    x: t.group.position.x,
    z: t.group.position.z,
    r: t instanceof RingTarget ? 0.55 : 0.5,
  }))));

  const spawn = { position: new THREE.Vector3(0, 0, 2), yaw: 0 };

  function dispose() {
    // Disposes mergedMesh geometry/material + all sign meshes' geometry
    // (shared signGeo disposed once, harmless if called again) and their
    // CanvasTexture maps. Target disposal is the caller's responsibility.
    disposeScene(group);
  }

  return {
    group,
    colliders,
    wallHittables,
    targets,
    spawn,
    ammoCrate: { position: ammoCratePos, radius: 1.5 },
    dispose,
  };
}
