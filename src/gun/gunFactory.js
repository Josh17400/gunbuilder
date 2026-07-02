// Assembles a build object into a single THREE.Group by parenting part meshes
// into the receiver's sockets. See CONTRACTS.md (src/gun/gunFactory.js).

import * as THREE from "three";
import { makePartMesh, gunMaterial } from "./partMeshes.js";

// Slots whose parts parent directly into a same-named receiver socket.
// (barrel handled explicitly for muzzle chaining; muzzle parents into the
// barrel's muzzle socket; ammo has no visual on the gun.)
const DIRECT_SLOTS = ["optic", "mag", "stock", "grip", "underbarrel", "laser"];

export function buildGunMesh(build) {
  const group = new THREE.Group();
  group.name = "gun";

  const receiver = makePartMesh(build.receiver);
  group.add(receiver.object);

  const attach = (slot) => {
    const id = build[slot];
    const socket = receiver.sockets[slot];
    if (!id || !socket) return null;
    const part = makePartMesh(id);
    socket.add(part.object);
    return part;
  };

  const barrel = attach("barrel");

  let muzzle = null;
  if (build.muzzle && barrel && barrel.sockets.muzzle) {
    muzzle = makePartMesh(build.muzzle);
    barrel.sockets.muzzle.add(muzzle.object);
  }

  let optic = null;
  let laser = null;
  for (const slot of DIRECT_SLOTS) {
    const part = attach(slot);
    if (slot === "optic") optic = part;
    if (slot === "laser") laser = part;
  }

  // Deepest muzzle point: muzzle device tip, else barrel tip, else fallback.
  let muzzleTip = (muzzle && muzzle.sockets.tip) || (barrel && barrel.sockets.muzzle) || null;
  if (!muzzleTip) {
    muzzleTip = new THREE.Object3D();
    muzzleTip.name = "socket_muzzleFallback";
    muzzleTip.position.set(0, 0, -0.3);
    group.add(muzzleTip);
  }

  // Sighting point: optic's eye socket, else receiver iron-sight eye, else fallback.
  let eyePoint = (optic && optic.sockets.eye) || receiver.sockets.eye || null;
  if (!eyePoint) {
    eyePoint = new THREE.Object3D();
    eyePoint.name = "socket_eyeFallback";
    eyePoint.position.set(0, 0.06, 0.03);
    group.add(eyePoint);
  }

  // Laser beam: thin additive shaft from the emitter nub along -Z, off by default.
  let beam = null;
  let beamMat = null;
  if (laser) {
    const beamGeo = new THREE.BoxGeometry(0.004, 0.004, 30);
    beamGeo.translate(0, 0, -15); // extend forward from the nub
    beamMat = new THREE.MeshBasicMaterial({
      color: laser.object.userData.laserColor ?? 0xff2a2a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    beam = new THREE.Mesh(beamGeo, beamMat);
    beam.frustumCulled = false;
    beam.visible = false;
    (laser.sockets.beam || laser.object).add(beam);
  }

  group.userData = {
    muzzleTip,
    eyePoint,
    build,
    hasLaser: !!laser,
    beamMat, // exposed so the viewmodel can animate lsr_disco
    disco: build.laser === "lsr_disco",
    setLaser(on) {
      if (beam) beam.visible = !!on;
    },
  };
  return group;
}

export function disposeGun(group) {
  if (!group) return;
  group.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.geometry) obj.geometry.dispose();
    const mat = obj.material;
    if (!mat || mat === gunMaterial) return; // shared material — never dispose
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (m !== gunMaterial) m.dispose();
      }
    } else {
      mat.dispose();
    }
  });
  if (group.parent) group.parent.remove(group);
}
