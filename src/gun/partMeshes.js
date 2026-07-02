// Part mesh library. Every canonical part ID gets a distinct low-poly mesh
// built from 2-6 Box/Cylinder primitives merged into ONE geometry with
// per-vertex colors (flat multi-tone look, single shared material).
//
// Conventions (see CONTRACTS.md):
//   - Origin = mount point. Muzzle direction = -Z. +Y up, +X right. Meters.
//   - Receivers expose sockets: barrel, mag, stock, grip, optic, underbarrel,
//     laser, eye (iron-sight fallback). Barrels expose: muzzle. Optics: eye.
//   - Extra sockets used internally by gunFactory: muzzle devices expose "tip"
//     (deepest -Z point), lasers expose "beam" (beam emit point).

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const gunMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const GUNMETAL = 0x2e3238;
const MID = 0x4a505a;
const BLACK = 0x1a1c20;
const TAN = 0xa08055;
const TEAL = 0x3fd8c8;
const LIGHT = 0x6a7078;
const ORANGE = 0xe07a1f; // nailer industrial
const YELLOW = 0xf2c14e; // nailer hazard
const BRASS = 0xc8a24a;
const COPPER = 0xb87333;
const RED = 0xd83a3a;
const RUBBER = 0x3d352e; // dark recoil-pad rubber (warmer than GUNMETAL/BLACK)
const WOOD = 0x8a6a42; // AK / bolt-rifle furniture
const CARBON = 0x24272c; // carbon-fiber weave tone
const PALE_BLUE = 0xa8cfe8; // frangible tip
const FDE = 0x9a7b52; // flat dark earth accent panels

// ---------------------------------------------------------------------------
// Primitive helpers — build, rotate, translate, color, all BEFORE merging.
// Every geometry is made non-indexed and given an identical "color" attribute
// so mergeGeometries sees consistent attribute sets.
// ---------------------------------------------------------------------------
const _color = new THREE.Color();

function paint(geo, hex) {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  if (nonIndexed !== geo) geo.dispose();
  _color.setHex(hex);
  const count = nonIndexed.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = _color.r;
    colors[i * 3 + 1] = _color.g;
    colors[i * 3 + 2] = _color.b;
  }
  nonIndexed.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return nonIndexed;
}

function place(geo, x, y, z, rot) {
  if (rot) {
    if (rot.rx) geo.rotateX(rot.rx);
    if (rot.ry) geo.rotateY(rot.ry);
    if (rot.rz) geo.rotateZ(rot.rz);
  }
  geo.translate(x, y, z);
  return geo;
}

// Box primitive: width (x), height (y), depth (z), centered at (x,y,z).
function makeBox(w, h, d, x, y, z, color, rot) {
  return paint(place(new THREE.BoxGeometry(w, h, d), x, y, z, rot), color);
}

// Cylinder primitive, axis +Y by default (use rot to reorient), centered at (x,y,z).
function makeCyl(rTop, rBot, h, x, y, z, color, opts = {}) {
  const { seg = 10, ...rot } = opts;
  return paint(place(new THREE.CylinderGeometry(rTop, rBot, h, seg), x, y, z, rot), color);
}

// Tube along the muzzle axis (-Z): rFront faces -Z, rBack faces +Z.
// zCenter is the tube's center; a barrel of length L mounted at z=0 uses zCenter=-L/2.
function makeTube(rFront, rBack, len, x, y, zCenter, color, seg = 10) {
  // CylinderGeometry top (+Y) maps to +Z after rotateX(PI/2).
  return makeCyl(rBack, rFront, len, x, y, zCenter, color, { seg, rx: Math.PI / 2 });
}

// Open ring facing the muzzle axis (torus lies in XY plane, axis = Z).
// Unlike a capped cylinder this leaves the center genuinely open — used for
// sight rings you look through and barrel-cluster support rings.
function makeRing(radius, tube, x, y, z, color) {
  return paint(place(new THREE.TorusGeometry(radius, tube, 5, 12), x, y, z), color);
}

// Merge primitives into one mesh using the shared material.
function fuse(geos) {
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mesh = new THREE.Mesh(merged, gunMaterial);
  mesh.frustumCulled = false; // viewmodel gun lives at the camera; never cull
  return mesh;
}

// Small unlit accent piece (optic dots, laser nubs). Own material — disposeGun
// disposes any material that is not the shared gunMaterial.
function accent(size, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color })
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// def = { name: [x, y, z], ... }
function addSockets(root, def) {
  const sockets = {};
  for (const name of Object.keys(def)) {
    const [x, y, z] = def[name];
    const o = new THREE.Object3D();
    o.name = "socket_" + name;
    o.position.set(x, y, z);
    root.add(o);
    sockets[name] = o;
  }
  return sockets;
}

// ---------------------------------------------------------------------------
// Builders — one per part ID. Each returns { object, sockets }.
// ---------------------------------------------------------------------------
const BUILDERS = {
  // ========================= RECEIVERS =========================
  rcv_pistol() {
    const root = fuse([
      makeBox(0.034, 0.036, 0.19, 0, 0.016, -0.015, GUNMETAL), // slide
      makeBox(0.03, 0.035, 0.13, 0, -0.012, -0.01, BLACK), // frame
      makeBox(0.036, 0.1, 0.058, 0, -0.068, 0.045, BLACK, { rx: -0.25 }), // grip / mag well column
      makeBox(0.008, 0.006, 0.05, 0, -0.038, 0.005, MID), // trigger guard bar
      makeBox(0.008, 0.008, 0.01, 0, 0.038, 0.06, MID), // rear sight nub
      makeBox(0.005, 0.009, 0.006, 0, 0.038, -0.1, MID), // front sight nub
      makeBox(0.003, 0.016, 0.04, 0.0175, 0.022, -0.03, BLACK), // ejection port (right)
      makeBox(0.037, 0.026, 0.026, 0, 0.014, 0.062, MID), // rear slide serration block
      makeBox(0.006, 0.02, 0.006, 0, -0.03, -0.005, MID), // trigger blade
      makeBox(0.024, 0.007, 0.045, 0, -0.033, -0.05, MID), // dust-cover rail
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.11],
      mag: [0, -0.024, 0.036],
      stock: [0, 0, 0.075],
      grip: [0, -0.03, 0.05],
      optic: [0, 0.034, 0.02],
      underbarrel: [0, -0.03, -0.06],
      laser: [0.02, -0.005, -0.05],
      eye: [0, 0.054, 0.03],
    });
    // Mags insert down the grip column: mags bake in a +0.1 forward cant, so
    // -0.35 here yields a net -0.25 — exactly the grip rake above.
    sockets.mag.rotation.x = -0.35;
    return { object: root, sockets };
  },

  rcv_smg() {
    const root = fuse([
      makeBox(0.055, 0.07, 0.28, 0, 0.01, -0.02, GUNMETAL), // body
      makeBox(0.03, 0.012, 0.24, 0, 0.051, -0.02, BLACK), // top rail
      makeBox(0.042, 0.03, 0.055, 0, -0.04, -0.05, MID), // mag well
      makeBox(0.032, 0.09, 0.04, 0, -0.07, 0.07, BLACK, { rx: -0.25 }), // grip
      makeBox(0.014, 0.018, 0.03, -0.035, 0.02, 0.02, MID), // charging handle
      makeBox(0.008, 0.006, 0.05, 0, -0.032, 0.03, MID), // trigger guard
      makeBox(0.0035, 0.02, 0.04, 0.028, 0.015, -0.045, BLACK), // ejection port (right)
      makeBox(0.032, 0.006, 0.014, 0, 0.058, -0.1, MID), // rail notch
      makeBox(0.032, 0.006, 0.014, 0, 0.058, -0.02, MID), // rail notch
      makeBox(0.032, 0.006, 0.014, 0, 0.058, 0.06, MID), // rail notch
      makeBox(0.042, 0.052, 0.012, 0, 0.01, 0.116, BLACK), // stock connector plate
      makeBox(0.006, 0.02, 0.006, 0, -0.026, 0.025, BLACK), // trigger blade
      makeBox(0.057, 0.018, 0.13, 0, -0.008, -0.04, LIGHT), // side accent stripe
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.16],
      mag: [0, -0.055, -0.05],
      stock: [0, 0.01, 0.12],
      grip: [0, -0.045, 0.07],
      optic: [0, 0.057, -0.02],
      underbarrel: [0, -0.025, -0.12],
      laser: [0.03, 0.02, -0.1],
      eye: [0, 0.077, 0.05],
    });
    return { object: root, sockets };
  },

  rcv_ar() {
    const root = fuse([
      makeBox(0.055, 0.05, 0.35, 0, 0.015, -0.03, GUNMETAL), // upper
      makeBox(0.05, 0.045, 0.2, 0, -0.025, 0.01, MID), // lower
      makeBox(0.03, 0.014, 0.3, 0, 0.047, -0.03, BLACK), // carry rail
      makeBox(0.044, 0.04, 0.055, 0, -0.055, -0.06, GUNMETAL), // mag well
      makeBox(0.032, 0.095, 0.042, 0, -0.085, 0.09, BLACK, { rx: -0.3 }), // grip
      makeBox(0.008, 0.006, 0.055, 0, -0.052, 0.03, BLACK), // trigger guard
      makeBox(0.0035, 0.022, 0.05, 0.028, 0.012, -0.045, BLACK), // ejection port (right)
      makeBox(0.01, 0.024, 0.012, 0.031, 0.008, -0.012, MID), // brass deflector
      makeBox(0.03, 0.007, 0.02, 0, 0.042, 0.128, MID), // charging handle T
      makeBox(0.034, 0.006, 0.014, 0, 0.052, -0.14, MID), // rail notch
      makeBox(0.034, 0.006, 0.014, 0, 0.052, -0.05, MID), // rail notch
      makeBox(0.034, 0.006, 0.014, 0, 0.052, 0.04, MID), // rail notch
      makeBox(0.006, 0.022, 0.006, 0, -0.044, 0.022, MID), // trigger blade
      makeBox(0.048, 0.014, 0.05, 0, -0.078, -0.06, MID), // flared magwell lip
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.205],
      mag: [0, -0.075, -0.06],
      stock: [0, 0.005, 0.145],
      grip: [0, -0.055, 0.09],
      optic: [0, 0.054, -0.05],
      underbarrel: [0, -0.045, -0.15],
      laser: [0.03, 0.02, -0.15],
      eye: [0, 0.074, 0.05],
    });
    return { object: root, sockets };
  },

  rcv_dmr() {
    const root = fuse([
      makeBox(0.05, 0.075, 0.42, 0, 0.005, -0.04, GUNMETAL), // long slab body
      makeBox(0.028, 0.012, 0.36, 0, 0.049, -0.05, BLACK), // full-length rail
      makeBox(0.04, 0.035, 0.05, 0, -0.048, -0.08, MID), // mag well
      makeBox(0.03, 0.09, 0.04, 0, -0.08, 0.1, BLACK, { rx: -0.28 }), // grip
      makeBox(0.008, 0.006, 0.05, 0, -0.046, 0.04, MID), // trigger guard
      makeBox(0.0035, 0.02, 0.05, 0.0255, 0.008, -0.08, BLACK), // ejection port (right)
      makeBox(0.052, 0.012, 0.02, 0, 0.012, -0.19, BLACK), // side vent slot
      makeBox(0.052, 0.012, 0.02, 0, 0.012, -0.15, BLACK), // side vent slot
      makeBox(0.03, 0.006, 0.014, 0, 0.053, -0.16, MID), // rail notch
      makeBox(0.03, 0.006, 0.014, 0, 0.053, -0.02, MID), // rail notch
      makeBox(0.052, 0.02, 0.11, 0, 0.014, 0.09, LIGHT), // rear accent panel
      makeBox(0.006, 0.022, 0.006, 0, -0.038, 0.032, BLACK), // trigger blade
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.25],
      mag: [0, -0.065, -0.08],
      stock: [0, 0, 0.17],
      grip: [0, -0.05, 0.1],
      optic: [0, 0.055, -0.05],
      underbarrel: [0, -0.033, -0.18],
      laser: [0.027, 0.02, -0.18],
      eye: [0, 0.075, 0.05],
    });
    return { object: root, sockets };
  },

  rcv_shotgun() {
    const root = fuse([
      makeBox(0.055, 0.075, 0.2, 0, 0.005, 0.03, GUNMETAL), // receiver box
      makeTube(0.014, 0.014, 0.2, 0, -0.03, -0.15, MID), // under mag tube
      makeBox(0.05, 0.04, 0.1, 0, -0.03, -0.12, TAN), // pump
      makeBox(0.032, 0.09, 0.042, 0, -0.075, 0.09, TAN, { rx: -0.26 }), // grip
      makeBox(0.008, 0.006, 0.05, 0, -0.036, 0.04, BLACK), // trigger guard
      makeBox(0.024, 0.01, 0.12, 0, 0.048, 0.03, BLACK), // top plate/rail
      makeBox(0.0035, 0.026, 0.05, 0.028, 0.005, 0.03, BLACK), // ejection port (right)
      makeBox(0.052, 0.008, 0.014, 0, -0.03, -0.095, BLACK), // pump rib
      makeBox(0.052, 0.008, 0.014, 0, -0.03, -0.145, BLACK), // pump rib
      makeBox(0.005, 0.032, 0.1, -0.03, 0.012, 0.04, TAN), // side shell saddle
      makeBox(0.007, 0.024, 0.014, -0.034, 0.012, 0.02, BRASS), // saddle shell
      makeBox(0.007, 0.024, 0.014, -0.034, 0.012, 0.055, BRASS), // saddle shell
      makeBox(0.006, 0.02, 0.006, 0, -0.028, 0.045, MID), // trigger blade
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.07],
      mag: [0, -0.038, 0.01],
      stock: [0, 0, 0.13],
      grip: [0, -0.04, 0.09],
      optic: [0, 0.053, 0.05],
      underbarrel: [0, -0.052, -0.12],
      laser: [0.03, 0.01, -0.02],
      eye: [0, 0.073, 0.07],
    });
    return { object: root, sockets };
  },

  rcv_lmg() {
    const root = fuse([
      makeBox(0.065, 0.1, 0.4, 0, 0, -0.02, GUNMETAL), // chunky body
      makeBox(0.05, 0.022, 0.22, 0, 0.061, -0.04, MID), // top cover
      makeBox(0.014, 0.014, 0.11, 0, 0.098, -0.02, BLACK), // carry handle bar
      makeBox(0.012, 0.03, 0.014, 0, 0.083, 0.02, BLACK), // handle post
      makeBox(0.034, 0.095, 0.044, 0, -0.09, 0.12, BLACK, { rx: -0.28 }), // grip
      makeBox(0.008, 0.006, 0.055, 0, -0.053, 0.06, BLACK), // trigger guard
      makeBox(0.004, 0.026, 0.06, -0.033, -0.02, -0.02, BLACK), // ejection chute (left)
      makeBox(0.014, 0.012, 0.02, 0.036, 0.045, -0.09, MID), // feed cover latch
      makeBox(0.067, 0.016, 0.024, 0, 0.01, -0.19, BLACK), // shroud vent slot
      makeBox(0.067, 0.016, 0.024, 0, 0.01, -0.14, BLACK), // shroud vent slot
      makeBox(0.04, 0.006, 0.014, 0, 0.075, -0.12, BLACK), // front rail notch
      makeBox(0.067, 0.02, 0.14, 0, -0.03, 0.08, MID), // lower accent band
      makeBox(0.006, 0.022, 0.006, 0, -0.045, 0.052, MID), // trigger blade
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.22],
      mag: [0, -0.05, -0.04],
      stock: [0, 0, 0.18],
      grip: [0, -0.05, 0.12],
      optic: [0, 0.072, 0.02],
      underbarrel: [0, -0.05, -0.16],
      laser: [0.035, 0.02, -0.14],
      eye: [0, 0.092, 0.07],
    });
    return { object: root, sockets };
  },

  rcv_nailer() {
    const root = fuse([
      makeBox(0.05, 0.09, 0.26, 0, 0.01, -0.03, ORANGE), // industrial body
      makeBox(0.06, 0.06, 0.06, 0, -0.005, -0.17, YELLOW), // hazard nose block
      makeBox(0.026, 0.012, 0.2, 0, 0.062, -0.03, BLACK), // top rail
      makeBox(0.032, 0.09, 0.042, 0, -0.075, 0.07, BLACK, { rx: -0.3 }), // grip
      makeCyl(0.012, 0.012, 0.04, 0, 0.02, 0.115, MID, { rx: Math.PI / 2 }), // air fitting
      makeBox(0.008, 0.006, 0.05, 0, -0.04, 0.03, BLACK), // trigger guard
      makeBox(0.062, 0.014, 0.062, 0, 0.02, -0.17, BLACK), // hazard stripe
      makeBox(0.062, 0.014, 0.062, 0, -0.024, -0.17, BLACK), // hazard stripe
      makeBox(0.052, 0.016, 0.03, 0, 0.03, -0.06, BLACK), // vent slit
      makeBox(0.052, 0.016, 0.03, 0, 0.03, 0.0, BLACK), // vent slit
      makeCyl(0.008, 0.008, 0.05, 0.02, -0.005, 0.11, RUBBER, { rx: 1.1 }), // drooping air hose
      makeBox(0.03, 0.022, 0.014, 0, -0.015, 0.099, YELLOW), // warning tag
      makeBox(0.006, 0.02, 0.006, 0, -0.032, 0.022, MID), // trigger blade
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.2],
      mag: [0, -0.035, -0.02],
      stock: [0, 0.01, 0.1],
      grip: [0, -0.045, 0.07],
      optic: [0, 0.068, -0.03],
      underbarrel: [0, -0.035, -0.13],
      laser: [0.027, 0.01, -0.1],
      eye: [0, 0.088, 0.03],
    });
    return { object: root, sockets };
  },

  rcv_gauss() {
    const root = fuse([
      makeBox(0.045, 0.06, 0.42, 0, 0, -0.05, GUNMETAL), // core slab
      makeTube(0.045, 0.045, 0.03, 0, 0, -0.2, TEAL), // coil ring (front)
      makeTube(0.045, 0.045, 0.03, 0, 0, -0.13, MID), // coil ring (mid)
      makeTube(0.045, 0.045, 0.03, 0, 0, -0.06, TEAL), // coil ring (rear)
      makeBox(0.026, 0.012, 0.28, 0, 0.052, -0.08, BLACK), // bridged top rail
      makeBox(0.032, 0.09, 0.04, 0, -0.075, 0.1, BLACK, { rx: -0.28 }), // grip
      makeBox(0.04, 0.045, 0.11, 0, -0.048, 0.02, BLACK), // capacitor pack
      makeBox(0.048, 0.008, 0.008, 0, -0.062, 0.02, TEAL), // capacitor charge band
      makeBox(0.008, 0.008, 0.2, 0.026, 0.024, 0.0, BLACK), // cable run (right)
      makeBox(0.036, 0.05, 0.012, 0, 0.005, 0.11, MID), // rear heatsink fin
      makeBox(0.036, 0.05, 0.012, 0, 0.005, 0.13, MID), // rear heatsink fin
      makeBox(0.008, 0.006, 0.05, 0, -0.042, 0.055, BLACK), // trigger guard
      makeBox(0.006, 0.02, 0.006, 0, -0.034, 0.047, MID), // trigger blade
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.26],
      mag: [0, -0.03, 0],
      stock: [0, 0, 0.16],
      grip: [0, -0.045, 0.1],
      optic: [0, 0.058, -0.02],
      underbarrel: [0, -0.048, -0.16],
      laser: [0.05, 0.01, -0.1],
      eye: [0, 0.078, 0.05],
    });
    return { object: root, sockets };
  },

  rcv_ak() {
    // Classic AK: stamped receiver, wood furniture, sloped front sight block.
    const root = fuse([
      makeBox(0.05, 0.062, 0.25, 0, 0.008, 0, GUNMETAL), // stamped receiver box
      makeBox(0.044, 0.014, 0.2, 0, 0.045, -0.01, MID), // dust cover
      makeBox(0.03, 0.02, 0.03, 0, 0.055, -0.1, BLACK), // rear sight block
      makeBox(0.02, 0.006, 0.055, 0, 0.068, -0.085, MID), // sight leaf
      makeBox(0.046, 0.046, 0.13, 0, -0.018, -0.19, WOOD), // lower handguard (wood)
      makeBox(0.034, 0.026, 0.1, 0, 0.036, -0.19, WOOD), // upper handguard (wood)
      makeBox(0.026, 0.052, 0.04, 0, 0.038, -0.245, GUNMETAL, { rx: 0.22 }), // sloped front sight block
      makeBox(0.006, 0.026, 0.006, 0, 0.075, -0.25, MID), // front post
      makeBox(0.044, 0.032, 0.06, 0, -0.046, -0.045, GUNMETAL, { rx: 0.16 }), // curved mag well hint
      makeBox(0.008, 0.006, 0.05, 0, -0.048, 0.03, BLACK), // trigger guard
      makeBox(0.006, 0.022, 0.006, 0, -0.04, 0.02, MID), // trigger blade
      makeBox(0.004, 0.018, 0.045, 0.026, 0.02, -0.02, BLACK), // ejection port (right)
      makeBox(0.016, 0.012, 0.022, 0.031, 0.02, 0.02, MID), // charging handle knob
      makeBox(0.003, 0.012, 0.085, 0.026, -0.006, 0.04, LIGHT), // safety lever (right)
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.26],
      mag: [0, -0.06, -0.045],
      stock: [0, 0.005, 0.125],
      grip: [0, -0.052, 0.07],
      optic: [0, 0.052, 0.03],
      underbarrel: [0, -0.042, -0.19],
      laser: [0.028, 0.02, -0.16],
      eye: [0, 0.074, 0.05],
    });
    // AK mags cant hard forward: baked +0.1 in the mag + 0.15 here = net +0.25.
    sockets.mag.rotation.x = 0.15;
    return { object: root, sockets };
  },

  rcv_vector() {
    // Kriss Vector: high bore axis over a deep lower that rakes down-forward
    // (the delta recoil housing), grip set well back.
    const root = fuse([
      makeBox(0.048, 0.05, 0.34, 0, 0.03, -0.03, GUNMETAL), // upper slab (high bore)
      makeBox(0.028, 0.01, 0.3, 0, 0.062, -0.03, BLACK), // top rail
      makeBox(0.03, 0.006, 0.014, 0, 0.068, -0.14, MID), // rail notch
      makeBox(0.03, 0.006, 0.014, 0, 0.068, -0.04, MID), // rail notch
      makeBox(0.046, 0.06, 0.17, 0, -0.02, -0.035, BLACK), // lower mid body
      makeBox(0.046, 0.13, 0.08, 0, -0.06, -0.115, BLACK, { rx: 0.45 }), // delta chin (rakes forward)
      makeBox(0.05, 0.03, 0.05, 0, -0.095, -0.145, MID, { rx: 0.45 }), // mag well collar
      makeBox(0.03, 0.08, 0.038, 0, -0.062, 0.075, GUNMETAL, { rx: -0.2 }), // grip core
      makeBox(0.008, 0.006, 0.07, 0, -0.052, 0.02, MID), // trigger guard bottom
      makeBox(0.008, 0.03, 0.006, 0, -0.038, -0.015, MID), // trigger guard front post
      makeBox(0.006, 0.022, 0.006, 0, -0.038, 0.035, LIGHT), // trigger blade
      makeBox(0.004, 0.02, 0.05, 0.025, 0.035, -0.06, BLACK), // ejection port (right)
      makeBox(0.05, 0.016, 0.1, 0, 0.012, -0.15, LIGHT), // side accent chevron
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0.03, -0.2],
      mag: [0, -0.11, -0.155],
      stock: [0, 0.03, 0.14],
      grip: [0, -0.045, 0.08],
      optic: [0, 0.067, -0.02],
      underbarrel: [0, -0.05, -0.17],
      laser: [0.027, 0.045, -0.12],
      eye: [0, 0.087, 0.05],
    });
    sockets.mag.rotation.x = 0.15; // cant forward with the chin rake (net +0.25)
    return { object: root, sockets };
  },

  rcv_p90() {
    // Bullpup loaf with the mag lying flat on top. The mag socket is rotated
    // so any box mag lies horizontally in the top tray, P90-style.
    const root = fuse([
      makeBox(0.05, 0.07, 0.42, 0, -0.005, 0.06, GUNMETAL), // smooth loaf body
      makeBox(0.054, 0.09, 0.06, 0, -0.012, 0.29, MID), // integral butt block
      makeBox(0.005, 0.016, 0.24, -0.024, 0.038, 0.02, MID), // top mag tray rail L
      makeBox(0.005, 0.016, 0.24, 0.024, 0.038, 0.02, MID), // top mag tray rail R
      makeBox(0.024, 0.02, 0.07, 0, 0.048, -0.075, BLACK), // sight bridge
      makeBox(0.02, 0.01, 0.05, 0, 0.062, -0.075, BLACK), // bridge rail
      makeBox(0.042, 0.05, 0.03, 0, -0.002, -0.165, MID), // nose block
      makeBox(0.014, 0.05, 0.022, 0, -0.062, -0.1, GUNMETAL), // front loop post
      makeBox(0.014, 0.02, 0.14, 0, -0.078, -0.035, GUNMETAL), // thumbhole bottom bar
      makeBox(0.006, 0.024, 0.006, 0, -0.05, 0.005, MID), // trigger blade
      makeBox(0.024, 0.008, 0.04, 0, -0.042, 0.13, BLACK), // downward eject chute
      makeBox(0.003, 0.014, 0.05, -0.026, 0.01, -0.11, LIGHT), // charging handle (left)
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0.01, -0.18],
      mag: [0, 0.048, -0.02],
      stock: [0, 0, 0.32],
      grip: [0, -0.045, 0.055],
      optic: [0, 0.067, -0.075],
      underbarrel: [0, -0.088, -0.05],
      laser: [0.027, 0.02, -0.14],
      eye: [0, 0.087, -0.03],
    });
    // Lay mags flat on top, base plate forward (mags bake +0.1 cant; cancel it).
    sockets.mag.rotation.x = -(Math.PI / 2) - 0.1;
    return { object: root, sockets };
  },

  rcv_deagle() {
    // Desert Eagle: huge slab slide, tall profile, big raked grip.
    const root = fuse([
      makeBox(0.042, 0.05, 0.24, 0, 0.02, -0.03, GUNMETAL), // slab slide
      makeBox(0.02, 0.01, 0.22, 0, 0.05, -0.03, BLACK), // top rib
      makeBox(0.038, 0.042, 0.16, 0, -0.018, -0.01, BLACK), // frame
      makeBox(0.042, 0.115, 0.064, 0, -0.085, 0.05, BLACK, { rx: -0.22 }), // big grip column
      makeBox(0.045, 0.028, 0.028, 0, 0.018, 0.062, MID), // rear serration block
      makeBox(0.004, 0.026, 0.055, 0.022, 0.022, -0.025, BLACK), // huge ejection port (right)
      makeBox(0.008, 0.006, 0.06, 0, -0.047, -0.005, MID), // trigger guard
      makeBox(0.007, 0.024, 0.007, 0, -0.038, -0.01, MID), // trigger blade
      makeBox(0.01, 0.009, 0.012, 0, 0.058, 0.07, MID), // rear sight
      makeBox(0.006, 0.011, 0.008, 0, 0.058, -0.135, MID), // front sight blade
      makeBox(0.028, 0.008, 0.05, 0, -0.036, -0.09, MID), // dust-cover rail
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0.02, -0.15],
      mag: [0, -0.035, 0.042],
      stock: [0, 0, 0.09],
      grip: [0, -0.038, 0.056],
      optic: [0, 0.055, 0.0],
      underbarrel: [0, -0.04, -0.09],
      laser: [0.024, 0.0, -0.08],
      eye: [0, 0.07, 0.04],
    });
    // Same trick as rcv_pistol: mags bake +0.1; net -0.22 matches the grip rake.
    sockets.mag.rotation.x = -0.32;
    return { object: root, sockets };
  },

  rcv_bolt() {
    // Long heavy bolt action: cylindrical action in a walnut chassis, bolt
    // handle swept back-right with a ball knob.
    const root = fuse([
      makeCyl(0.024, 0.024, 0.28, 0, 0.018, 0.03, GUNMETAL, { seg: 12, rx: Math.PI / 2 }), // action tube
      makeCyl(0.02, 0.02, 0.05, 0, 0.018, 0.185, MID, { seg: 10, rx: Math.PI / 2 }), // bolt shroud
      makeBox(0.05, 0.008, 0.012, 0.036, 0.008, 0.1, MID, { rz: -0.55 }), // bolt handle arm
      makeBox(0.02, 0.02, 0.02, 0.058, -0.012, 0.1, BLACK), // bolt knob
      makeBox(0.048, 0.056, 0.36, 0, -0.032, -0.02, WOOD), // walnut chassis
      makeBox(0.042, 0.044, 0.13, 0, -0.026, -0.24, WOOD), // tapered forend
      makeBox(0.034, 0.012, 0.09, 0, -0.064, -0.03, BLACK), // magazine floorplate
      makeBox(0.008, 0.006, 0.05, 0, -0.062, 0.06, BLACK), // trigger guard
      makeBox(0.006, 0.024, 0.006, 0, -0.052, 0.05, MID), // trigger blade
      makeBox(0.022, 0.01, 0.04, 0, 0.047, -0.04, BLACK), // scope base (front)
      makeBox(0.022, 0.01, 0.04, 0, 0.047, 0.08, BLACK), // scope base (rear)
      makeBox(0.004, 0.016, 0.04, 0.024, 0.02, -0.01, BLACK), // ejection port (right)
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0.018, -0.29],
      mag: [0, -0.055, -0.03],
      stock: [0, -0.01, 0.16],
      grip: [0, -0.06, 0.1],
      optic: [0, 0.052, 0.02],
      underbarrel: [0, -0.05, -0.24],
      laser: [0.026, 0.03, -0.2],
      eye: [0, 0.072, 0.06],
    });
    return { object: root, sockets };
  },

  rcv_burst() {
    // Modern angular AR: FDE accent deck/panels, triple front vents.
    const root = fuse([
      makeBox(0.052, 0.05, 0.36, 0, 0.015, -0.04, GUNMETAL), // angular upper
      makeBox(0.04, 0.018, 0.28, 0, 0.046, -0.02, FDE), // accent top deck
      makeBox(0.028, 0.012, 0.32, 0, 0.058, -0.04, BLACK), // full rail
      makeBox(0.032, 0.006, 0.014, 0, 0.065, -0.15, MID), // rail notch
      makeBox(0.032, 0.006, 0.014, 0, 0.065, -0.05, MID), // rail notch
      makeBox(0.032, 0.006, 0.014, 0, 0.065, 0.05, MID), // rail notch
      makeBox(0.048, 0.045, 0.2, 0, -0.025, 0.01, MID), // lower
      makeBox(0.058, 0.018, 0.1, 0, 0.008, -0.13, FDE), // side accent panels
      makeBox(0.056, 0.014, 0.02, 0, 0.02, -0.155, BLACK), // front vent 1
      makeBox(0.056, 0.014, 0.02, 0, 0.02, -0.185, BLACK), // front vent 2
      makeBox(0.056, 0.014, 0.02, 0, 0.02, -0.215, BLACK), // front vent 3
      makeBox(0.046, 0.042, 0.058, 0, -0.055, -0.06, GUNMETAL), // mag well
      makeBox(0.032, 0.095, 0.042, 0, -0.085, 0.09, BLACK, { rx: -0.3 }), // grip
      makeBox(0.008, 0.006, 0.055, 0, -0.052, 0.03, BLACK), // trigger guard
      makeBox(0.006, 0.022, 0.006, 0, -0.044, 0.022, MID), // trigger blade
      makeBox(0.0035, 0.022, 0.05, 0.028, 0.012, -0.05, BLACK), // ejection port (right)
      makeBox(0.03, 0.007, 0.02, 0, 0.045, 0.13, MID), // charging handle T
    ]);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.22],
      mag: [0, -0.075, -0.06],
      stock: [0, 0.005, 0.14],
      grip: [0, -0.055, 0.09],
      optic: [0, 0.064, -0.05],
      underbarrel: [0, -0.045, -0.16],
      laser: [0.03, 0.02, -0.14],
      eye: [0, 0.084, 0.05],
    });
    return { object: root, sockets };
  },

  rcv_minigun() {
    // Rotary cluster IS the receiver: 6 thin barrels around the axis, motor
    // housing at the rear, feed box on the right. The barrel socket sits at
    // the cluster front so barrel parts read as a bore extension.
    const geos = [
      makeBox(0.09, 0.11, 0.16, 0, 0, 0.08, GUNMETAL), // motor housing
      makeBox(0.07, 0.08, 0.05, 0, 0, 0.185, MID), // rear cap
      makeBox(0.05, 0.075, 0.1, 0.068, -0.008, 0.08, MID), // side feed box (right)
      makeBox(0.012, 0.05, 0.08, 0.096, -0.008, 0.08, BRASS), // belt hint on feed box
      makeCyl(0.045, 0.045, 0.06, 0, 0, -0.028, BLACK, { seg: 12, rx: Math.PI / 2 }), // rotor hub
      makeBox(0.03, 0.012, 0.12, 0, 0.066, 0.08, BLACK), // top rail
      makeBox(0.03, 0.006, 0.014, 0, 0.074, 0.05, MID), // rail notch
      makeBox(0.03, 0.006, 0.014, 0, 0.074, 0.11, MID), // rail notch
      makeRing(0.037, 0.006, 0, 0, -0.24, BLACK), // mid support ring (open)
      makeRing(0.037, 0.006, 0, 0, -0.385, MID), // front support ring (open)
    ];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      geos.push(
        makeCyl(0.0085, 0.0085, 0.34, Math.cos(a) * 0.029, Math.sin(a) * 0.029, -0.225,
          k % 2 ? MID : GUNMETAL, { seg: 6, rx: Math.PI / 2 })
      );
    }
    const root = fuse(geos);
    const sockets = addSockets(root, {
      barrel: [0, 0, -0.4],
      mag: [0, -0.058, 0.08],
      stock: [0, 0, 0.21],
      grip: [0, -0.055, 0.15],
      optic: [0, 0.072, 0.08],
      underbarrel: [0, -0.05, -0.2],
      laser: [0.05, 0.035, -0.1],
      eye: [0, 0.092, 0.13],
    });
    return { object: root, sockets };
  },

  // ========================= BARRELS =========================
  brl_stub() {
    const root = fuse([
      makeTube(0.015, 0.015, 0.12, 0, 0, -0.06, GUNMETAL),
      makeTube(0.019, 0.019, 0.02, 0, 0, -0.11, MID), // muzzle collar
      makeTube(0.0165, 0.0165, 0.006, 0, 0, -0.117, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.12] }) };
  },

  brl_carbine() {
    const root = fuse([
      makeTube(0.013, 0.013, 0.2, 0, 0, -0.1, GUNMETAL),
      makeBox(0.024, 0.03, 0.025, 0, 0.004, -0.15, BLACK), // gas block
      makeBox(0.006, 0.02, 0.006, 0, 0.028, -0.15, MID), // front post
      makeTube(0.0155, 0.0155, 0.008, 0, 0, -0.195, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.2] }) };
  },

  brl_standard() {
    const root = fuse([
      makeTube(0.013, 0.013, 0.28, 0, 0, -0.14, GUNMETAL),
      makeTube(0.018, 0.018, 0.035, 0, 0, -0.02, MID), // barrel nut collar
      makeBox(0.024, 0.03, 0.025, 0, 0.004, -0.2, BLACK), // gas block
      makeBox(0.006, 0.02, 0.006, 0, 0.028, -0.2, MID), // front post
      makeTube(0.0155, 0.0155, 0.008, 0, 0, -0.275, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.28] }) };
  },

  brl_bull() {
    const root = fuse([
      makeTube(0.022, 0.022, 0.3, 0, 0, -0.15, GUNMETAL), // thick full profile
      makeTube(0.027, 0.027, 0.05, 0, 0, -0.03, MID), // step collar
      makeTube(0.023, 0.023, 0.012, 0, 0, -0.294, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.3] }) };
  },

  brl_long() {
    const root = fuse([
      makeTube(0.012, 0.012, 0.45, 0, 0, -0.225, GUNMETAL),
      makeTube(0.017, 0.017, 0.03, 0, 0, -0.15, MID), // mid support ring
      makeBox(0.022, 0.028, 0.022, 0, 0.004, -0.31, BLACK), // gas block
      makeBox(0.006, 0.022, 0.006, 0, 0.029, -0.31, MID), // front post
      makeTube(0.0145, 0.0145, 0.008, 0, 0, -0.444, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.45] }) };
  },

  brl_suppressed() {
    const root = fuse([
      makeTube(0.013, 0.013, 0.1, 0, 0, -0.05, GUNMETAL), // rear barrel section
      makeTube(0.028, 0.028, 0.24, 0, 0, -0.2, BLACK), // integrated fat can
      makeTube(0.022, 0.022, 0.012, 0, 0, -0.315, MID), // front cap ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.32] }) };
  },

  brl_pepperbox() {
    const r = 0.017; // cluster radius
    const root = fuse([
      makeTube(0.008, 0.008, 0.18, 0, 0, -0.09, GUNMETAL), // center tube
      makeTube(0.008, 0.008, 0.18, 0, r, -0.09, MID),
      makeTube(0.008, 0.008, 0.18, 0, -r, -0.09, MID),
      makeTube(0.008, 0.008, 0.18, r, 0, -0.09, MID),
      makeTube(0.008, 0.008, 0.18, -r, 0, -0.09, MID),
      makeTube(0.028, 0.028, 0.015, 0, 0, -0.165, BLACK), // front cluster plate
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.18] }) };
  },

  brl_carbon() {
    // Slim carbon-weave tube with copper accent wrap rings.
    const root = fuse([
      makeTube(0.014, 0.014, 0.3, 0, 0, -0.15, CARBON, 12),
      makeTube(0.0165, 0.0165, 0.03, 0, 0, -0.02, BLACK), // barrel nut
      makeTube(0.016, 0.016, 0.012, 0, 0, -0.08, COPPER), // accent ring
      makeTube(0.016, 0.016, 0.012, 0, 0, -0.16, COPPER), // accent ring
      makeTube(0.016, 0.016, 0.012, 0, 0, -0.24, COPPER), // accent ring
      makeTube(0.0155, 0.0155, 0.008, 0, 0, -0.295, BLACK), // crown ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.3] }) };
  },

  brl_shorty() {
    // Stubby wide-bore tube: big crown, barely clears the receiver.
    const root = fuse([
      makeTube(0.021, 0.021, 0.09, 0, 0, -0.045, GUNMETAL),
      makeTube(0.025, 0.025, 0.02, 0, 0, -0.012, MID), // seat collar
      makeTube(0.026, 0.026, 0.02, 0, 0, -0.08, BLACK), // fat crown collar
      makeTube(0.019, 0.019, 0.006, 0, 0, -0.089, BLACK), // bore ring
    ]);
    return { object: root, sockets: addSockets(root, { muzzle: [0, 0, -0.09] }) };
  },

  // ========================= MUZZLES ========================
  // Origin at barrel muzzle socket, extend -Z. "tip" socket = deepest point.
  mzl_comp() {
    const root = fuse([
      makeTube(0.016, 0.016, 0.06, 0, 0, -0.03, MID),
      makeBox(0.038, 0.01, 0.012, 0, 0, -0.02, BLACK), // side slot
      makeBox(0.038, 0.01, 0.012, 0, 0, -0.042, BLACK), // side slot
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.06] }) };
  },

  mzl_brake() {
    const root = fuse([
      makeBox(0.034, 0.028, 0.07, 0, 0, -0.035, GUNMETAL),
      makeBox(0.052, 0.016, 0.014, 0, 0, -0.02, MID), // vent baffle
      makeBox(0.052, 0.016, 0.014, 0, 0, -0.046, MID), // vent baffle
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.07] }) };
  },

  mzl_flash() {
    const root = fuse([
      makeTube(0.014, 0.014, 0.025, 0, 0, -0.0125, GUNMETAL), // base collar
      makeTube(0.022, 0.012, 0.035, 0, 0, -0.0425, MID), // flared cone
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.06] }) };
  },

  mzl_suppressor() {
    const root = fuse([
      makeTube(0.026, 0.026, 0.14, 0, 0, -0.07, BLACK), // fat tube
      makeTube(0.02, 0.02, 0.015, 0, 0, -0.008, MID), // rear collar
      makeTube(0.02, 0.02, 0.01, 0, 0, -0.135, MID), // end cap
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.14] }) };
  },

  mzl_choke() {
    const root = fuse([
      makeTube(0.024, 0.017, 0.03, 0, 0, -0.015, MID), // short flare
      makeTube(0.018, 0.018, 0.01, 0, 0, -0.004, BLACK), // seat ring
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.03] }) };
  },

  mzl_boost() {
    // Recoil booster: seat collar, converging throat, flared venturi cone.
    const root = fuse([
      makeTube(0.016, 0.016, 0.015, 0, 0, -0.0075, BLACK), // seat collar
      makeTube(0.012, 0.015, 0.022, 0, 0, -0.026, MID), // converging throat
      makeTube(0.024, 0.012, 0.045, 0, 0, -0.0595, GUNMETAL), // venturi cone (flares out)
      makeTube(0.025, 0.025, 0.008, 0, 0, -0.078, BLACK), // front lip
    ]);
    return { object: root, sockets: addSockets(root, { tip: [0, 0, -0.082] }) };
  },

  // ========================= OPTICS =========================
  // Origin sits on the receiver's optic rail. "eye" socket = sighting axis.
  opt_irons() {
    // Thin posts only — no rear slab. Sight line (eye y=0.027) grazes the tips
    // of the rear ears and front post, so the alignment reads at screen center
    // with nothing solid crossing the view axis.
    const root = fuse([
      makeBox(0.024, 0.006, 0.02, 0, 0.003, 0.01, BLACK), // rear base
      makeBox(0.004, 0.021, 0.008, -0.008, 0.0165, 0.01, MID), // rear notch ear L
      makeBox(0.004, 0.021, 0.008, 0.008, 0.0165, 0.01, MID), // rear notch ear R
      makeBox(0.02, 0.006, 0.016, 0, 0.003, -0.09, BLACK), // front base
      makeBox(0.004, 0.021, 0.004, 0, 0.0165, -0.09, MID), // front post
    ]);
    return { object: root, sockets: addSockets(root, { eye: [0, 0.027, 0.03] }) };
  },

  opt_reddot() {
    // Low emitter housing you look OVER: sight line (eye y=0.032) clears the
    // housing top (y=0.022); the dot floats in an open thin-frame window.
    const root = fuse([
      makeBox(0.03, 0.008, 0.05, 0, 0.004, 0, BLACK), // base plate
      makeBox(0.026, 0.014, 0.036, 0, 0.015, 0.005, GUNMETAL), // low housing
      makeBox(0.004, 0.024, 0.006, -0.014, 0.032, -0.015, BLACK), // window post L
      makeBox(0.004, 0.024, 0.006, 0.014, 0.032, -0.015, BLACK), // window post R
      makeBox(0.032, 0.004, 0.006, 0, 0.046, -0.015, BLACK), // window top bar
      makeBox(0.003, 0.012, 0.003, 0, 0.024, 0.008, BLACK), // dot stalk
    ]);
    root.add(accent(0.006, 0xff3040, 0, 0.032, 0.008)); // glowing dot on eye axis
    return { object: root, sockets: addSockets(root, { eye: [0, 0.032, 0.04] }) };
  },

  opt_holo() {
    // Genuinely open rectangular window — thin bars (5mm), nothing in the
    // middle; emissive-green reticle dot on a thin stalk at the eye axis
    // (window center), so the dot floats at screen center during ADS.
    const root = fuse([
      makeBox(0.036, 0.008, 0.055, 0, 0.004, 0, BLACK), // base plate
      makeBox(0.056, 0.005, 0.01, 0, 0.0105, 0, GUNMETAL), // hoop bottom
      makeBox(0.056, 0.005, 0.01, 0, 0.0535, 0, GUNMETAL), // hoop top
      makeBox(0.005, 0.048, 0.01, -0.0255, 0.032, 0, GUNMETAL), // hoop left
      makeBox(0.005, 0.048, 0.01, 0.0255, 0.032, 0, GUNMETAL), // hoop right
      makeBox(0.003, 0.016, 0.003, 0, 0.021, 0, BLACK), // reticle stalk
    ]);
    root.add(accent(0.006, 0x39ff6a, 0, 0.032, 0)); // emissive-green holo dot
    return { object: root, sockets: addSockets(root, { eye: [0, 0.032, 0.04] }) };
  },

  opt_4x() {
    const root = fuse([
      makeBox(0.03, 0.008, 0.06, 0, 0.004, 0, BLACK), // base plate
      makeBox(0.016, 0.02, 0.02, 0, 0.016, 0, MID), // mount post
      makeTube(0.016, 0.016, 0.1, 0, 0.036, 0, GUNMETAL), // scope tube
      makeTube(0.02, 0.02, 0.016, 0, 0.036, -0.048, BLACK), // objective ring
      makeTube(0.018, 0.018, 0.016, 0, 0.036, 0.046, BLACK), // ocular ring
    ]);
    return { object: root, sockets: addSockets(root, { eye: [0, 0.036, 0.07] }) };
  },

  opt_8x() {
    const root = fuse([
      makeBox(0.03, 0.008, 0.08, 0, 0.004, 0, BLACK), // base plate
      makeBox(0.016, 0.024, 0.022, 0, 0.018, 0.01, MID), // mount post
      makeTube(0.016, 0.016, 0.16, 0, 0.04, -0.01, GUNMETAL), // long tube
      makeTube(0.027, 0.026, 0.045, 0, 0.04, -0.08, BLACK), // big objective bell
      makeTube(0.02, 0.02, 0.022, 0, 0.04, 0.062, BLACK), // ocular
      makeCyl(0.008, 0.008, 0.014, 0, 0.062, -0.01, MID), // elevation turret
    ]);
    return { object: root, sockets: addSockets(root, { eye: [0, 0.04, 0.09] }) };
  },

  opt_2x() {
    // Compact 2x magnifier: an OPEN bracket-mounted ring (torus — no caps, no
    // glass) with a 42 mm clear center. Zoom 0.6 gets no DOM vignette, so the
    // whole sight picture is this physically open ring; eye sits at its center.
    const root = fuse([
      makeBox(0.03, 0.008, 0.05, 0, 0.004, 0, BLACK), // base plate
      makeBox(0.014, 0.016, 0.016, 0, 0.014, -0.008, GUNMETAL), // riser stem
      makeRing(0.026, 0.005, 0, 0.038, -0.008, GUNMETAL), // magnifier ring (open center r=21mm)
      makeBox(0.012, 0.008, 0.014, 0, 0.071, -0.008, BLACK), // top adjustment cap
      makeBox(0.008, 0.01, 0.016, -0.032, 0.038, -0.008, BLACK), // side battery pod
    ]);
    return { object: root, sockets: addSockets(root, { eye: [0, 0.038, 0.04] }) };
  },

  opt_tritium() {
    // Night irons: thick posts with self-luminous green tritium dots (classic
    // 3-dot picture). Fully open — nothing crosses the sight axis but the dots.
    const root = fuse([
      makeBox(0.026, 0.008, 0.022, 0, 0.004, 0.012, BLACK), // rear base
      makeBox(0.005, 0.02, 0.01, -0.009, 0.017, 0.012, GUNMETAL), // rear post L
      makeBox(0.005, 0.02, 0.01, 0.009, 0.017, 0.012, GUNMETAL), // rear post R
      makeBox(0.022, 0.008, 0.018, 0, 0.004, -0.09, BLACK), // front base
      makeBox(0.005, 0.022, 0.005, 0, 0.018, -0.09, GUNMETAL), // front post
    ]);
    root.add(accent(0.004, 0x4dff88, -0.009, 0.0255, 0.008)); // tritium dot rear L
    root.add(accent(0.004, 0x4dff88, 0.009, 0.0255, 0.008)); // tritium dot rear R
    root.add(accent(0.0045, 0x4dff88, 0, 0.0275, -0.0925)); // tritium dot front
    return { object: root, sockets: addSockets(root, { eye: [0, 0.031, 0.03] }) };
  },

  // ========================= MAGS =========================
  // Origin at mag well (receiver "mag" socket), body extends -Y.
  // Slight forward tilt (bottom toward -Z) reads nicely.
  mag_compact() {
    const tilt = { rx: 0.1 };
    const root = fuse([
      makeBox(0.024, 0.1, 0.05, 0, -0.05, 0, GUNMETAL, tilt),
      makeBox(0.028, 0.012, 0.056, 0, -0.104, -0.0104, BLACK, tilt),
    ]);
    return { object: root, sockets: {} };
  },

  mag_standard() {
    const tilt = { rx: 0.1 };
    const root = fuse([
      makeBox(0.024, 0.15, 0.052, 0, -0.075, 0, GUNMETAL, tilt),
      makeBox(0.028, 0.012, 0.058, 0, -0.155, -0.0155, BLACK, tilt),
    ]);
    return { object: root, sockets: {} };
  },

  mag_extended() {
    const tilt = { rx: 0.12 };
    const root = fuse([
      makeBox(0.024, 0.22, 0.052, 0, -0.11, 0, GUNMETAL, tilt),
      makeBox(0.027, 0.014, 0.056, 0, -0.11, -0.0132, MID, tilt), // mid band
      makeBox(0.028, 0.012, 0.058, 0, -0.225, -0.027, BLACK, tilt),
    ]);
    return { object: root, sockets: {} };
  },

  mag_drum() {
    const root = fuse([
      makeBox(0.024, 0.055, 0.05, 0, -0.0275, 0, GUNMETAL), // feed tower
      makeCyl(0.056, 0.056, 0.044, 0, -0.095, 0.012, MID, { rz: Math.PI / 2 }), // drum (flat side out)
      makeCyl(0.016, 0.016, 0.052, 0, -0.095, 0.012, BLACK, { rz: Math.PI / 2 }), // hub
    ]);
    return { object: root, sockets: {} };
  },

  mag_belt() {
    const root = fuse([
      makeBox(0.06, 0.075, 0.07, 0, -0.038, 0, GUNMETAL), // box housing
      makeBox(0.062, 0.014, 0.072, 0, -0.008, 0, MID), // lid rim
      makeBox(0.012, 0.055, 0.05, 0.04, -0.095, 0.005, TAN, { rz: 0.25 }), // dangling belt
      makeBox(0.014, 0.016, 0.052, 0.052, -0.122, 0.005, BRASS, { rz: 0.25 }), // brass row hint
    ]);
    return { object: root, sockets: {} };
  },

  mag_quickpull() {
    const tilt = { rx: 0.1 };
    const root = fuse([
      makeBox(0.024, 0.14, 0.052, 0, -0.07, 0, GUNMETAL, tilt),
      makeBox(0.028, 0.012, 0.058, 0, -0.145, -0.0145, BLACK, tilt),
      makeBox(0.02, 0.04, 0.014, 0, -0.172, 0.012, RED, tilt), // pull tab loop
    ]);
    return { object: root, sockets: {} };
  },

  mag_casket() {
    // Quad-stack casket: notably thick, ribbed spines front and back.
    const tilt = { rx: 0.1 };
    const root = fuse([
      makeBox(0.038, 0.16, 0.054, 0, -0.08, 0, GUNMETAL, tilt), // fat quad-stack body
      makeBox(0.042, 0.13, 0.012, 0, -0.085, -0.03, MID, tilt), // front rib spine
      makeBox(0.042, 0.13, 0.012, 0, -0.085, 0.03, MID, tilt), // rear rib spine
      makeBox(0.042, 0.016, 0.058, 0, -0.075, -0.0075, BLACK, tilt), // mid witness band
      makeBox(0.044, 0.014, 0.06, 0, -0.166, -0.0166, BLACK, tilt), // base plate
    ]);
    return { object: root, sockets: {} };
  },

  mag_speed() {
    // Slim competition stick with a bright pull loop hanging off the base.
    const tilt = { rx: 0.1 };
    const root = fuse([
      makeBox(0.02, 0.17, 0.046, 0, -0.085, 0, LIGHT, tilt), // slim stick body
      makeBox(0.024, 0.012, 0.05, 0, -0.175, -0.0175, BLACK, tilt), // base plate
      makeBox(0.008, 0.034, 0.008, 0, -0.198, -0.036, ORANGE, tilt), // loop front leg
      makeBox(0.008, 0.034, 0.008, 0, -0.196, -0.006, ORANGE, tilt), // loop rear leg
      makeBox(0.008, 0.01, 0.038, 0, -0.216, -0.022, ORANGE, tilt), // loop bottom bar
    ]);
    return { object: root, sockets: {} };
  },

  // ========================= STOCKS =========================
  // Origin at receiver rear face, extend +Z (rearward).
  stk_none() {
    const root = fuse([
      makeBox(0.045, 0.07, 0.012, 0, 0, 0.006, BLACK), // buffer plate
      makeBox(0.012, 0.02, 0.008, 0, -0.03, 0.014, MID), // sling loop
    ]);
    return { object: root, sockets: {} };
  },

  stk_wire() {
    const root = fuse([
      makeBox(0.014, 0.014, 0.24, 0, 0.01, 0.12, MID), // top wire strut
      makeBox(0.014, 0.06, 0.014, 0, -0.02, 0.233, MID), // vertical strut
      makeBox(0.02, 0.095, 0.014, 0, -0.015, 0.248, BLACK), // buttplate
    ]);
    return { object: root, sockets: {} };
  },

  stk_folding() {
    const root = fuse([
      makeBox(0.032, 0.032, 0.03, 0, 0, 0.015, BLACK), // hinge block
      makeBox(0.02, 0.026, 0.2, 0, 0.004, 0.13, GUNMETAL), // arm tube
      makeBox(0.035, 0.1, 0.02, 0, -0.012, 0.24, BLACK), // buttpad
    ]);
    return { object: root, sockets: {} };
  },

  stk_standard() {
    // Classic solid rifle stock: sloped wrist into a dropped belly, straight
    // comb line, raised cheek-rest step, contrast butt plate.
    const root = fuse([
      makeBox(0.03, 0.05, 0.09, 0, -0.022, 0.04, TAN, { rx: 0.42 }), // wrist wedge
      makeBox(0.032, 0.036, 0.23, 0, 0.006, 0.115, TAN, { rx: 0.05 }), // comb spine
      makeBox(0.034, 0.088, 0.17, 0, -0.036, 0.158, TAN, { rx: 0.2 }), // belly (drops to butt)
      makeBox(0.037, 0.018, 0.095, 0, 0.026, 0.178, RUBBER, { rx: 0.05 }), // cheek-rest step
      makeBox(0.038, 0.126, 0.018, 0, -0.028, 0.246, BLACK, { rx: 0.1 }), // butt plate
    ]);
    return { object: root, sockets: {} };
  },

  stk_heavy() {
    const root = fuse([
      makeBox(0.045, 0.1, 0.24, 0, -0.015, 0.13, GUNMETAL), // thick body
      makeBox(0.04, 0.03, 0.13, 0, 0.048, 0.15, BLACK), // cheek riser
      makeBox(0.05, 0.12, 0.025, 0, -0.01, 0.262, BLACK), // big buttpad
    ]);
    return { object: root, sockets: {} };
  },

  stk_cushion() {
    // Recoil-absorbing pad stock: metal arm into a fat rubber cushion built
    // from slightly-inset stacked slabs (rounded feel) with a retention strap.
    const root = fuse([
      makeBox(0.032, 0.06, 0.13, 0, -0.006, 0.065, GUNMETAL, { rx: 0.08 }), // arm
      makeBox(0.044, 0.1, 0.016, 0, -0.012, 0.138, BLACK, { rx: 0.06 }), // pad base plate
      makeBox(0.05, 0.112, 0.046, 0, -0.013, 0.168, RUBBER, { rx: 0.06 }), // cushion slab
      makeBox(0.043, 0.098, 0.036, 0, -0.014, 0.207, RUBBER, { rx: 0.06 }), // cushion mid (inset)
      makeBox(0.034, 0.08, 0.022, 0, -0.015, 0.234, RUBBER, { rx: 0.06 }), // cushion tail
      makeBox(0.054, 0.118, 0.013, 0, -0.013, 0.182, TAN, { rx: 0.06 }), // retention strap
    ]);
    return { object: root, sockets: {} };
  },

  stk_recon() {
    // Skeletonized recon stock: open triangle of spine + diagonal brace with
    // an angular butt frame — daylight through the middle.
    const root = fuse([
      makeBox(0.034, 0.04, 0.028, 0, 0, 0.014, BLACK), // mount block
      makeBox(0.016, 0.022, 0.22, 0, 0.012, 0.135, GUNMETAL), // top spine
      makeBox(0.014, 0.014, 0.18, 0, -0.042, 0.12, LIGHT, { rx: -0.38 }), // diagonal brace
      makeBox(0.016, 0.115, 0.016, 0, -0.035, 0.235, GUNMETAL), // rear vertical frame
      makeBox(0.03, 0.125, 0.016, 0, -0.028, 0.25, BLACK), // angular butt pad
      makeBox(0.026, 0.012, 0.075, 0, 0.028, 0.17, BLACK), // cheek riser blade
    ]);
    return { object: root, sockets: {} };
  },

  // ========================= GRIPS =========================
  // Cosmetic wrap/panels over the receiver's built-in grip. Origin at the
  // receiver's grip socket (top of grip); raked back like the built-ins.
  grp_standard() {
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.038, 0.085, 0.046, 0, -0.045, 0.008, MID, rake),
      makeBox(0.04, 0.014, 0.05, 0, -0.088, 0.019, BLACK, rake), // base flare
    ]);
    return { object: root, sockets: {} };
  },

  grp_rubber() {
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.04, 0.09, 0.05, 0, -0.045, 0.008, BLACK, rake),
      makeBox(0.042, 0.012, 0.052, 0, -0.02, -0.001, MID, rake), // finger ridge
      makeBox(0.042, 0.012, 0.052, 0, -0.05, -0.006, MID, rake), // finger ridge
    ]);
    return { object: root, sockets: {} };
  },

  grp_skeleton() {
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.036, 0.095, 0.012, 0, -0.048, -0.012, LIGHT, rake), // front strap
      makeBox(0.036, 0.095, 0.012, 0, -0.048, 0.028, LIGHT, rake), // rear strap
      makeBox(0.036, 0.012, 0.05, 0, -0.093, -0.001, LIGHT, rake), // bottom rung
    ]);
    return { object: root, sockets: {} };
  },

  grp_target() {
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.048, 0.098, 0.056, 0, -0.048, 0.008, TAN, rake), // chunky wrap
      makeBox(0.05, 0.014, 0.034, 0.03, -0.014, 0.002, TAN, rake), // thumb shelf
      makeBox(0.05, 0.018, 0.06, 0, -0.098, 0.016, BLACK, rake), // magwell base
    ]);
    return { object: root, sockets: {} };
  },

  grp_bare() {
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.004, 0.07, 0.04, -0.019, -0.045, 0.008, MID, rake), // left panel
      makeBox(0.004, 0.07, 0.04, 0.019, -0.045, 0.008, MID, rake), // right panel
    ]);
    return { object: root, sockets: {} };
  },

  grp_ergo() {
    // Contoured ergonomic wrap: palm swell, finger grooves, beavertail.
    const rake = { rx: -0.27 };
    const root = fuse([
      makeBox(0.042, 0.092, 0.05, 0, -0.046, 0.01, RUBBER, rake), // palm swell body
      makeBox(0.044, 0.011, 0.02, 0, -0.022, -0.014, MID, rake), // finger groove ridge
      makeBox(0.044, 0.011, 0.02, 0, -0.047, -0.017, MID, rake), // finger groove ridge
      makeBox(0.044, 0.011, 0.02, 0, -0.072, -0.02, MID, rake), // finger groove ridge
      makeBox(0.036, 0.012, 0.032, 0, -0.004, 0.032, RUBBER, rake), // beavertail
      makeBox(0.044, 0.014, 0.054, 0, -0.094, 0.012, BLACK, rake), // flared base
    ]);
    return { object: root, sockets: {} };
  },

  // ========================= UNDERBARREL =========================
  // Origin at receiver's under rail, extend -Y.
  ub_vert() {
    const root = fuse([
      makeBox(0.03, 0.008, 0.05, 0, -0.004, 0, BLACK), // rail foot
      makeCyl(0.015, 0.017, 0.085, 0, -0.05, 0, GUNMETAL), // vertical grip
      makeCyl(0.019, 0.019, 0.012, 0, -0.095, 0, BLACK), // bottom cap
    ]);
    return { object: root, sockets: {} };
  },

  ub_angled() {
    const root = fuse([
      makeBox(0.03, 0.008, 0.06, 0, -0.004, 0, BLACK), // rail foot
      makeBox(0.03, 0.07, 0.042, 0, -0.036, -0.018, GUNMETAL, { rx: 0.55 }), // angled fin
    ]);
    return { object: root, sockets: {} };
  },

  ub_bipod() {
    const root = fuse([
      makeBox(0.034, 0.014, 0.045, 0, -0.007, 0, BLACK), // clamp base
      makeBox(0.011, 0.011, 0.11, -0.016, -0.03, -0.045, MID, { rx: 1.25 }), // folded leg L
      makeBox(0.011, 0.011, 0.11, 0.016, -0.03, -0.045, MID, { rx: 1.25 }), // folded leg R
    ]);
    return { object: root, sockets: {} };
  },

  ub_shield() {
    const root = fuse([
      makeBox(0.03, 0.008, 0.05, 0, -0.004, 0, BLACK), // rail foot
      makeBox(0.02, 0.05, 0.014, 0, -0.03, -0.02, MID), // mount post
      makeBox(0.16, 0.12, 0.01, 0, -0.045, -0.032, GUNMETAL), // shield plate
    ]);
    return { object: root, sockets: {} };
  },

  ub_light() {
    // Compact weapon light: stubby cylinder lamp with a warm emissive lens.
    const root = fuse([
      makeBox(0.03, 0.008, 0.045, 0, -0.004, 0, BLACK), // rail foot
      makeTube(0.013, 0.013, 0.05, 0, -0.025, -0.002, GUNMETAL), // lamp body
      makeTube(0.016, 0.016, 0.014, 0, -0.025, -0.024, MID), // front bezel
      makeBox(0.01, 0.008, 0.012, 0, -0.041, 0.014, MID), // tail switch
    ]);
    root.add(accent(0.011, 0xffd9a0, 0, -0.025, -0.028)); // warm lens dot
    return { object: root, sockets: {} };
  },

  // ========================= LASERS =========================
  // Origin on receiver side rail (+X side). Beam emits -Z from the nub.
  lsr_red() {
    return laserUnit(GUNMETAL, 0xff2a2a);
  },
  lsr_green() {
    return laserUnit(GUNMETAL, 0x39ff6a);
  },
  lsr_disco() {
    return laserUnit(0x5a3a7a, 0xff3af0); // playful purple housing
  },

  // ========================= AMMO =========================
  // Display cartridges (builder/menu preview only — never attached to the gun).
  // Origin at case base, standing upright (+Y).
  amo_fmj() {
    return cartridge(BRASS, COPPER, {});
  },
  amo_hollow() {
    const parts = cartridge(BRASS, MID, {});
    parts.object.add(accent(0.008, BLACK, 0, 0.078, 0)); // hollow cavity
    return parts;
  },
  amo_ap() {
    return cartridge(BRASS, BLACK, { tipLen: 0.042 }); // long sharp black tip
  },
  amo_explosive() {
    return cartridge(BRASS, RED, { band: 0xf08030 });
  },
  amo_incendiary() {
    return cartridge(BRASS, 0xf08030, { band: 0xf2c14e });
  },
  amo_subsonic() {
    return cartridge(0x3a3a3e, 0x2f5240, { caseLen: 0.036, tipLen: 0.022 }); // stubby & dark
  },
  amo_slug() {
    // Fat red shotshell: brass head, red hull, rolled crimp.
    const root = fuse([
      makeCyl(0.017, 0.017, 0.006, 0, 0.003, 0, MID), // rim
      makeCyl(0.0165, 0.0165, 0.018, 0, 0.015, 0, BRASS), // brass head
      makeCyl(0.016, 0.016, 0.048, 0, 0.048, 0, RED), // red hull
      makeCyl(0.0135, 0.0135, 0.008, 0, 0.076, 0, 0x8f2424), // rolled crimp
    ]);
    return { object: root, sockets: {} };
  },
  amo_frangible() {
    return cartridge(BRASS, PALE_BLUE, {}); // pale blue frangible tip
  },
};

// Shared laser designator: housing + rail foot merged, bright nub separate.
function laserUnit(bodyColor, laserColor) {
  const root = fuse([
    makeBox(0.02, 0.022, 0.055, 0.012, 0, -0.005, bodyColor), // housing
    makeBox(0.012, 0.01, 0.03, 0.001, -0.008, 0, BLACK), // rail foot
  ]);
  root.add(accent(0.009, laserColor, 0.012, 0.002, -0.034)); // emitter nub
  root.userData.laserColor = laserColor;
  const sockets = addSockets(root, { beam: [0.012, 0.002, -0.04] });
  return { object: root, sockets };
}

// Shared cartridge builder for ammo display meshes.
function cartridge(caseColor, tipColor, { caseLen = 0.05, tipLen = 0.03, band = null }) {
  const geos = [
    makeCyl(0.013, 0.014, caseLen, 0, caseLen / 2, 0, caseColor), // case
    makeCyl(0.015, 0.015, 0.006, 0, 0.003, 0, MID), // rim
    makeCyl(0.003, 0.012, tipLen, 0, caseLen + tipLen / 2, 0, tipColor), // projectile
  ];
  if (band) geos.push(makeCyl(0.0135, 0.0135, 0.008, 0, caseLen - 0.006, 0, band));
  const root = fuse(geos);
  return { object: root, sockets: {} };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function makePartMesh(partId) {
  const builder = BUILDERS[partId];
  if (!builder) throw new Error(`partMeshes: unknown part id "${partId}"`);
  return builder();
}
