// Clearing course world: start box -> gate -> corridor (3 pop-ups) ->
// left turn into room A (4 pop-ups, one behind a ThinWall) -> hallway
// (2 MoverTargets sliding across side openings) -> final room (5 pop-ups,
// 2 noShoot) -> finish pad. Owner E.
//
// All solid walls/floor merge into ONE MeshLambertMaterial({vertexColors:true})
// mesh (single draw call); wallHittables points at that mesh so bullets stop
// on any wall. Physical player collision uses the individual THREE.Box3 list.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { disposeScene } from "../core/utils.js";
import { PopUpTarget, MoverTarget, ThinWall } from "../game/targets.js";

const COLOR = {
  concrete: 0x8a8d90,
  darkConcrete: 0x6b6e72,
  floor: 0x6b6e72,
  gate: 0xff8c3a,
  arrow: 0xffb347,
  finish: 0x5fbf4a,
};

const WALL_H = 3;
const WALL_T = 0.3;

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

// Convenience for a wall segment centered at (cx,cz) running along X (width
// sx) or along Z (depth sz) — just pushBox with fixed height/thickness.
function wallX(geos, colliders, cx, cz, widthX) {
  pushBox(geos, colliders, cx, WALL_H / 2, cz, widthX, WALL_H, WALL_T, COLOR.concrete);
}
function wallZ(geos, colliders, cx, cz, depthZ) {
  pushBox(geos, colliders, cx, WALL_H / 2, cz, WALL_T, WALL_H, depthZ, COLOR.concrete);
}

export function createCourseWorld() {
  const group = new THREE.Group();
  group.name = "courseWorld";

  const geos = [];
  const colliders = [];

  // (lighting is owned by the screen — worlds are pure geometry)

  // ---- floor: one slab covering the whole footprint --------------------
  pushBox(geos, colliders, -3.25, -0.15, -14, 12.5, 0.3, 40, COLOR.floor);

  // ================= START BOX: X:[-3,3] Z:[0,6] =========================
  wallX(geos, colliders, 0, 6, 6); // north wall
  wallZ(geos, colliders, -3, 3, 6); // west wall
  wallZ(geos, colliders, 3, 3, 6); // east wall
  // South wall with a 3m gate gap X:[-1.5,1.5]
  wallX(geos, colliders, -2.25, 0, 1.5);
  wallX(geos, colliders, 2.25, 0, 1.5);

  // Gate: two orange posts + overhead beam.
  pushBox(geos, colliders, -1.65, 1.3, 0, 0.3, 2.6, 0.3, COLOR.gate);
  pushBox(geos, colliders, 1.65, 1.3, 0, 0.3, 2.6, 0.3, COLOR.gate);
  pushBox(geos, colliders, 0, 2.75, 0, 3.6, 0.3, 0.3, COLOR.gate);
  const startGate = new THREE.Box3(
    new THREE.Vector3(-1.5, 0, -1),
    new THREE.Vector3(1.5, 3, 1)
  );

  // ================= CORRIDOR: X:[-1.5,1.5] Z:[0,-12] =====================
  wallZ(geos, colliders, 1.5, -6, 12); // east wall, full length
  wallZ(geos, colliders, -1.5, -4.5, 9); // west wall, solid Z:[0,-9]
  // gap Z:[-9,-12] on the west wall opens into Room A.
  wallX(geos, colliders, 0, -12, 3); // south cap closes the corridor dead end

  const targets = [];

  const corridorTriggers = [
    new THREE.Box3(new THREE.Vector3(-1.5, 0, -4), new THREE.Vector3(1.5, 3, 0)),
    new THREE.Box3(new THREE.Vector3(-1.5, 0, -7), new THREE.Vector3(1.5, 3, -3)),
    new THREE.Box3(new THREE.Vector3(-1.5, 0, -9.5), new THREE.Vector3(1.5, 3, -6)),
  ];
  targets.push(
    new PopUpTarget({
      position: new THREE.Vector3(-0.8, 1.1, -3),
      yaw: Math.PI,
      triggerZone: corridorTriggers[0],
    }),
    new PopUpTarget({
      position: new THREE.Vector3(0.8, 1.2, -6),
      yaw: Math.PI,
      triggerZone: corridorTriggers[1],
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-0.8, 1.0, -8.3),
      yaw: Math.PI,
      triggerZone: corridorTriggers[2],
    })
  );

  // ================= ROOM A: X:[-9.5,-1.5] Z:[-8,-16] ======================
  wallX(geos, colliders, -5.5, -8, 8); // north wall
  wallX(geos, colliders, -8.25, -16, 2.5); // south wall, west segment
  wallX(geos, colliders, -2.75, -16, 2.5); // south wall, east segment
  // gap X:[-7,-4] on the south wall leads to the hallway.
  wallZ(geos, colliders, -9.5, -12, 8); // west wall
  // East wall is the SAME wall plane as the corridor's west wall (x=-1.5).
  // Corridor already provides the solid segment Z:[0,-9]; only the
  // remaining south segment Z:[-16,-12] is needed here, leaving the
  // doorway gap Z:[-9,-12] open between the two.
  wallZ(geos, colliders, -1.5, -14, 4); // south segment Z:[-12,-16]

  // ThinWall (AP showcase) between the doorway and the target behind it.
  const roomAThinWall = new ThinWall({
    position: new THREE.Vector3(-4.8, 1.5, -11),
    size: new THREE.Vector3(2.4, 2.4, 0.25),
    yaw: Math.PI / 2,
  });
  targets.push(roomAThinWall);

  const roomAEntryTrigger = new THREE.Box3(
    new THREE.Vector3(-2.0, 0, -13),
    new THREE.Vector3(1.5, 3, -6)
  );
  targets.push(
    new PopUpTarget({
      position: new THREE.Vector3(-3.0, 1.0, -9.3),
      yaw: -Math.PI / 2,
      triggerZone: roomAEntryTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-8.7, 1.3, -9.3),
      yaw: -Math.PI / 2,
      triggerZone: roomAEntryTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-8.7, 1.0, -15.3),
      yaw: -Math.PI / 2,
      triggerZone: roomAEntryTrigger,
    }),
    new PopUpTarget({
      // behind the ThinWall — needs AP ammo to reliably drop.
      position: new THREE.Vector3(-7.0, 1.4, -12),
      yaw: -Math.PI / 2,
      triggerZone: roomAEntryTrigger,
    })
  );

  // ================= HALLWAY: X:[-7,-4] Z:[-16,-24] ========================
  // West wall (x=-7), gap Z:[-19,-17] for Mover1.
  wallZ(geos, colliders, -7, -16.5, 1);
  wallZ(geos, colliders, -7, -21.5, 5);
  // East wall (x=-4), gap Z:[-23,-21] for Mover2.
  wallZ(geos, colliders, -4, -18.5, 5);
  wallZ(geos, colliders, -4, -23.5, 1);

  targets.push(
    new MoverTarget({
      position: new THREE.Vector3(-7, 1.2, -18),
      yaw: -Math.PI / 2,
      axis: new THREE.Vector3(1, 0, 0),
      range: 1.5,
      speed: 1.2,
    }),
    new MoverTarget({
      position: new THREE.Vector3(-4, 1.3, -22),
      yaw: Math.PI / 2,
      axis: new THREE.Vector3(1, 0, 0),
      range: 1.5,
      speed: 1.6,
    })
  );

  // ================= FINAL ROOM: X:[-9,-1] Z:[-24,-34] =====================
  wallX(geos, colliders, -8, -24, 2); // north wall, west segment
  wallX(geos, colliders, -2.5, -24, 3); // north wall, east segment
  // gap X:[-7,-4] lines up with the hallway.
  wallX(geos, colliders, -5, -34, 8); // south wall
  wallZ(geos, colliders, -9, -29, 10); // west wall
  wallZ(geos, colliders, -1, -29, 10); // east wall

  const finalRoomTrigger = new THREE.Box3(
    new THREE.Vector3(-8, 0, -25),
    new THREE.Vector3(-3, 3, -22)
  );
  targets.push(
    new PopUpTarget({
      position: new THREE.Vector3(-7.5, 1.0, -27),
      yaw: Math.PI,
      triggerZone: finalRoomTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-2.5, 1.2, -27),
      yaw: Math.PI,
      noShoot: true,
      triggerZone: finalRoomTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-7.5, 1.5, -32),
      yaw: Math.PI,
      triggerZone: finalRoomTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-5, 1.8, -33),
      yaw: Math.PI,
      noShoot: true,
      triggerZone: finalRoomTrigger,
    }),
    new PopUpTarget({
      position: new THREE.Vector3(-2.5, 1.0, -32),
      yaw: Math.PI,
      triggerZone: finalRoomTrigger,
    })
  );

  // Finish pad: green 2x2 pad on the floor near the back of the final room.
  pushBox(geos, colliders, -5, -0.02, -32.5, 2, 0.05, 2, COLOR.finish, { collider: false });
  const finishPad = new THREE.Box3(
    new THREE.Vector3(-6, 0, -33.5),
    new THREE.Vector3(-4, 3, -31.5)
  );

  // ---- direction arrows painted on the floor (flat colored boxes) ------
  pushBox(geos, colliders, 0, 0.02, 3, 0.5, 0.04, 2, COLOR.arrow, { collider: false });
  pushBox(geos, colliders, -0.8, 0.02, -9.5, 1.6, 0.04, 0.5, COLOR.arrow, { collider: false });
  pushBox(geos, colliders, -5.5, 0.02, -15, 0.5, 0.04, 2, COLOR.arrow, { collider: false });
  pushBox(geos, colliders, -5.5, 0.02, -23, 0.5, 0.04, 2, COLOR.arrow, { collider: false });
  pushBox(geos, colliders, -5, 0.02, -29, 0.5, 0.04, 3, COLOR.arrow, { collider: false });

  // Parent every target's visual group into the world (screens only add
  // world.group to the scene — targets would otherwise never render).
  for (const t of targets) group.add(t.group);

  // ---- merge all solid geometry into one mesh --------------------------
  const mergedGeo = mergeGeometries(geos, false);
  const mergedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mergedMesh = new THREE.Mesh(mergedGeo, mergedMat);
  mergedMesh.name = "courseStatic";
  group.add(mergedMesh);

  const wallHittables = [
    {
      object3D: mergedMesh,
      penetrationCost: 1,
      onHit: () => ({ stopped: true, showNumber: false }),
    },
  ];

  const spawn = { position: new THREE.Vector3(0, 0, 4.5), yaw: 0 };

  // mandatory = non-noShoot PopUps + Movers = 3 (corridor) + 4 (room A)
  // + 2 (movers) + 3 (final room normal) = 12.
  const mandatoryTargets = 12;

  function dispose() {
    disposeScene(group);
  }

  return {
    group,
    colliders,
    wallHittables,
    targets,
    spawn,
    startGate,
    finishPad,
    mandatoryTargets,
    dispose,
  };
}
