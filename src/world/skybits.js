// skybits.js — shared scene-dressing helpers for the visual pass: gradient
// sky domes, fake blob shadows, and ground-variation patches.
//
// Conventions honored: no shadow maps, no postprocessing, minimal draw calls.
// - makeSkyDome: ONE mesh (unlit, fog:false so fog never washes the sky).
// - makeBlobShadows: ONE merged mesh for all static shadow spots in a world.
// - makeGroundPatches: returns vertex-colored geometries meant to be pushed
//   into a world's static merge list — ZERO extra draw calls.
//
// The blob texture is a module-level shared CanvasTexture. disposeScene may
// dispose it on screen exit; that's safe — three re-uploads a texture whose
// image is still alive the next time it is used.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------- sky dome

// Inverted sphere with a vertical vertex-color gradient. `exponent` shapes
// the blend: <1 pulls the top color down fast (thin horizon band, good for
// dusk glows), >1 lets the horizon color climb higher (hazy mornings).
export function makeSkyDome(topColor, horizonColor, opts = {}) {
  const radius = opts.radius ?? 340;
  const exponent = opts.exponent ?? 1.0;
  const geo = new THREE.SphereGeometry(radius, 16, 12);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(topColor);
  const hor = new THREE.Color(horizonColor);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / radius); // below horizon = horizon color
    c.copy(hor).lerp(top, Math.pow(t, exponent));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,        // the dome IS the horizon — fog must not repaint it
    depthWrite: false, // background layer; never occludes anything
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "skyDome";
  mesh.renderOrder = -1; // paint first, world draws over it
  return mesh;
}

// ------------------------------------------------------------ blob shadows

let _blobTex = null;
function blobTexture() {
  if (!_blobTex) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, "rgba(0,0,0,0.40)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.26)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    _blobTex = new THREE.CanvasTexture(canvas);
  }
  return _blobTex;
}

function blobMaterial() {
  return new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false,
  });
}

// Single soft shadow plane (menu/builder showcase gun). Position it yourself;
// y defaults to just above the floor to dodge z-fighting.
export function makeBlobShadow(radius, y = 0.01) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, blobMaterial());
  mesh.position.y = y;
  mesh.name = "blobShadow";
  return mesh;
}

// All static blob shadows of a world merged into ONE mesh (1 draw call).
// spots: [{ x, z, r, sx?, sz? }] — sx/sz override the quad size (elongated
// shadows for movers). y sits above ground patches (top ≈ 0.012).
export function makeBlobShadows(spots, y = 0.02) {
  const geos = spots.map((s) => {
    const g = new THREE.PlaneGeometry(s.sx ?? s.r * 2, s.sz ?? s.r * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(s.x, y, s.z);
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, blobMaterial());
  mesh.name = "blobShadows";
  return mesh;
}

// ---------------------------------------------------------- ground patches

// Large, slightly-darker polygons that break up flat ground color. Returns
// vertex-colored BoxGeometries compatible with the worlds' merge pipeline:
//   geos.push(...makeGroundPatches([...]));
// spots: [{ x, z, sx, sz, color, rot? }] (rot = yaw radians).
export function makeGroundPatches(spots, y = 0.005) {
  return spots.map((s) => {
    const geo = new THREE.BoxGeometry(s.sx, 0.01, s.sz);
    const c = new THREE.Color(s.color);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (s.rot) geo.rotateY(s.rot);
    geo.translate(s.x, y, s.z);
    return geo;
  });
}
