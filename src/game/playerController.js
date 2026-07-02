// FPS player controller: mouse/touch look, WASD movement, jump/gravity,
// simple capsule-vs-Box3 collision, ADS/sprint FOV, and a recoil layer that
// sits on top of aim rotation without perturbing stored yaw/pitch.

import * as THREE from "three";
import { clamp, lerp, damp } from "../core/utils.js";

const EYE_HEIGHT = 1.65;
const RADIUS = 0.35;
const GRAVITY = 14;
const JUMP_SPEED = 4.6;
const PITCH_LIMIT = 1.55;
const BASE_FOV = 75;
const FOV_LAMBDA = 14;
const ACCEL_GROUND = 12;
const ACCEL_AIR = 3;
const WALK_SPEED = 4.8;
const SPRINT_SPEED = 7.2;
const RECOIL_PROPORTIONAL_LAMBDA = 6;
const DEG2RAD = Math.PI / 180;

// ---- headbob / landing-dip feel (additive local camera-y offsets) -------
const BOB_AMP_WALK = 0.012;
const BOB_AMP_SPRINT = 0.02;
const BOB_FREQ_BASE = 1.6; // Hz at WALK_SPEED, scaled by actual horizontal speed
const BOB_ADS_CUTOFF = 0.3; // adsAmount above this zeroes headbob
const BOB_LAMBDA = 10; // smoothing toward target bob amplitude/offset
const LAND_DIP_SPRING = 200; // spring constant recovering the dip to 0
const LAND_DIP_DAMPING = 24; // spring damping
const LAND_DIP_PER_MPS = 0.0055; // dip magnitude (m) per m/s of impact speed
const LAND_DIP_MAX_MAG = 0.12;
const TWO_PI = Math.PI * 2;

// Preallocated scratch — no per-frame allocations in the hot update path.
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wishDir = new THREE.Vector3();

// Decays a single recoil axis toward 0: reduce its magnitude by whichever is
// larger of a flat linear amount (so small kicks fully settle) or a
// proportional exponential-style amount (so big kicks bleed off fast).
function decayRecoilAxis(value, linearAmount, dt) {
  const mag = Math.abs(value);
  if (mag <= 1e-6) return 0;
  const sign = Math.sign(value);
  const proportionalMag = mag * Math.exp(-RECOIL_PROPORTIONAL_LAMBDA * dt);
  const proportionalDecrease = mag - proportionalMag;
  const decrease = Math.max(linearAmount, proportionalDecrease);
  const newMag = Math.max(0, mag - decrease);
  return sign * newMag;
}

export class PlayerController {
  constructor(camera, { input, colliders = [], spawn }) {
    this.camera = camera;
    this.input = input;
    this.colliders = colliders;

    this.position = new THREE.Vector3().copy(spawn.position);
    this.velocity = new THREE.Vector3();
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;

    // Recoil is a separate accumulator layered on top of aim each frame —
    // it never mutates this.yaw/this.pitch so ADS/ir-sight math stays clean.
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilRecoveryDegS = 20;

    this.onGround = false;
    this.isSprinting = false;
    this.isMoving = false;

    // Headbob + landing-dip: additive local camera-y offsets applied at the
    // same place rotation/position is written (_applyCameraTransform), so
    // they never touch this.position or fight recoil/FOV.
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._bobOffset = 0;
    this._landDipOffset = 0;
    this._landDipVel = 0;

    camera.rotation.order = "YXZ";
    this._fov = camera.isPerspectiveCamera ? camera.fov : BASE_FOV;

    this._applyCameraTransform();
  }

  addRecoil(vDeg, hDeg) {
    this.recoilPitch += vDeg * DEG2RAD;
    this.recoilYaw += hDeg * DEG2RAD;
  }

  teleport(position, yaw) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw || 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.onGround = false;
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._bobOffset = 0;
    this._landDipOffset = 0;
    this._landDipVel = 0;
    this._applyCameraTransform();
  }

  update(dt, { mobility = 1, adsAmount = 0, adsZoom = 1 } = {}) {
    const state = this.input.state;

    // ---- Look ----
    this.yaw -= state.lookDX;
    this.pitch = clamp(this.pitch - state.lookDY, -PITCH_LIMIT, PITCH_LIMIT);
    this._decayRecoil(dt);

    // ---- Movement ----
    const adsing = adsAmount > 0.1;
    const sprintHeld = state.sprint && state.moveZ > 0.5 && !adsing;
    this.isSprinting = sprintHeld;

    const adsMult = adsing ? lerp(1, 0.5, adsAmount) : 1;
    const speed = (sprintHeld ? SPRINT_SPEED : WALK_SPEED) * mobility * adsMult;

    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    _forward.set(-sinYaw, 0, -cosYaw);
    _right.set(cosYaw, 0, -sinYaw);
    _wishDir.set(0, 0, 0).addScaledVector(_right, state.moveX).addScaledVector(_forward, state.moveZ);
    if (_wishDir.lengthSq() > 1e-6) _wishDir.normalize();

    const accelLambda = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    this.velocity.x = damp(this.velocity.x, _wishDir.x * speed, accelLambda, dt);
    this.velocity.z = damp(this.velocity.z, _wishDir.z * speed, accelLambda, dt);
    this.isMoving = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z > 0.04;
    const horizSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);

    // ---- Jump / gravity ----
    if (state.jumpPressed && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    this.velocity.y -= GRAVITY * dt;

    // ---- Integrate + collide ----
    this._moveAndCollide(dt);

    // ---- FOV ----
    const targetFov = BASE_FOV * lerp(1, adsZoom, adsAmount) + (this.isSprinting ? 4 : 0);
    this._fov = damp(this._fov, targetFov, FOV_LAMBDA, dt);
    if (this.camera.isPerspectiveCamera && this.camera.fov !== this._fov) {
      this.camera.fov = this._fov;
      this.camera.updateProjectionMatrix();
    }

    this._updateBob(dt, horizSpeed, adsAmount);
    this._updateLandDip(dt);
    this._applyCameraTransform();
  }

  // Sine local-y bob while grounded + moving; amplitude smoothed toward 0
  // when idle/airborne/heavily ADS (>0.3), frequency scales with actual
  // horizontal speed so sprint strides read faster than a walk.
  _updateBob(dt, horizSpeed, adsAmount) {
    const moving = this.onGround && horizSpeed > 0.15 && adsAmount <= 0.3;
    const targetAmp = moving ? (this.isSprinting ? BOB_AMP_SPRINT : BOB_AMP_WALK) : 0;
    this._bobAmp = damp(this._bobAmp, targetAmp, BOB_LAMBDA, dt);
    if (moving) {
      this._bobPhase += dt * TWO_PI * BOB_FREQ_BASE * (horizSpeed / WALK_SPEED);
      if (this._bobPhase > 1e6) this._bobPhase %= TWO_PI; // guard unbounded growth
    }
    this._bobOffset = this._bobAmp > 1e-5 ? Math.sin(this._bobPhase) * this._bobAmp : 0;
  }

  // Critically-ish damped spring pulling the landing dip back to 0 every
  // frame; _registerLanding() (called from _moveAndCollide) kicks it
  // negative on impact.
  _updateLandDip(dt) {
    if (this._landDipOffset === 0 && this._landDipVel === 0) return;
    const accel = -LAND_DIP_SPRING * this._landDipOffset - LAND_DIP_DAMPING * this._landDipVel;
    this._landDipVel += accel * dt;
    this._landDipOffset += this._landDipVel * dt;
    if (Math.abs(this._landDipOffset) < 1e-4 && Math.abs(this._landDipVel) < 1e-4) {
      this._landDipOffset = 0;
      this._landDipVel = 0;
    }
  }

  // impactVelY is negative (falling speed at the instant of landing).
  _registerLanding(impactVelY) {
    const speed = -impactVelY;
    if (speed <= 0.5) return; // gentle step-downs don't warrant a dip
    const dipMag = Math.min(speed * LAND_DIP_PER_MPS, LAND_DIP_MAX_MAG);
    this._landDipOffset = -dipMag;
    this._landDipVel = 0;
  }

  _decayRecoil(dt) {
    const linearAmount = this.recoilRecoveryDegS * DEG2RAD * dt;
    this.recoilPitch = decayRecoilAxis(this.recoilPitch, linearAmount, dt);
    this.recoilYaw = decayRecoilAxis(this.recoilYaw, linearAmount, dt);
  }

  _moveAndCollide(dt) {
    // Vertical integration — land on box tops when falling; floor at y=0 is
    // always solid regardless of the collider list.
    const wasGrounded = this.onGround;
    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;
    this.onGround = false;

    if (this.position.y <= 0) {
      this.position.y = 0;
      if (!wasGrounded) this._registerLanding(this.velocity.y);
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.velocity.y <= 0) {
      for (const box of this.colliders) {
        if (
          prevY >= box.max.y &&
          this.position.y <= box.max.y &&
          this.position.x >= box.min.x - RADIUS &&
          this.position.x <= box.max.x + RADIUS &&
          this.position.z >= box.min.z - RADIUS &&
          this.position.z <= box.max.z + RADIUS
        ) {
          this.position.y = box.max.y;
          if (!wasGrounded) this._registerLanding(this.velocity.y);
          this.velocity.y = 0;
          this.onGround = true;
          break;
        }
      }
    }

    // Horizontal integration — resolve X then Z separately so corners don't
    // snag the capsule.
    this.position.x += this.velocity.x * dt;
    this._resolveHorizontal();
    this.position.z += this.velocity.z * dt;
    this._resolveHorizontal();
  }

  // Point-vs-expanded-box push-out: expand each collider by the capsule
  // radius in XZ, then if the capsule center lies inside that expanded
  // rectangle, shove it back out along whichever edge is closest.
  _resolveHorizontal() {
    const feetY = this.position.y;
    const eyeY = feetY + EYE_HEIGHT;
    const bodyBottom = feetY + 0.3;

    for (const box of this.colliders) {
      if (box.max.y <= bodyBottom || box.min.y >= eyeY) continue; // no vertical overlap

      const minX = box.min.x - RADIUS;
      const maxX = box.max.x + RADIUS;
      const minZ = box.min.z - RADIUS;
      const maxZ = box.max.z + RADIUS;
      if (
        this.position.x <= minX ||
        this.position.x >= maxX ||
        this.position.z <= minZ ||
        this.position.z >= maxZ
      ) {
        continue;
      }

      const penNegX = this.position.x - minX;
      const penPosX = maxX - this.position.x;
      const penNegZ = this.position.z - minZ;
      const penPosZ = maxZ - this.position.z;
      const smallest = Math.min(penNegX, penPosX, penNegZ, penPosZ);

      if (smallest === penNegX) {
        this.position.x = minX;
        this.velocity.x = Math.min(this.velocity.x, 0);
      } else if (smallest === penPosX) {
        this.position.x = maxX;
        this.velocity.x = Math.max(this.velocity.x, 0);
      } else if (smallest === penNegZ) {
        this.position.z = minZ;
        this.velocity.z = Math.min(this.velocity.z, 0);
      } else {
        this.position.z = maxZ;
        this.velocity.z = Math.max(this.velocity.z, 0);
      }
    }
  }

  _applyCameraTransform() {
    this.camera.position.set(
      this.position.x,
      this.position.y + EYE_HEIGHT + this._bobOffset + this._landDipOffset,
      this.position.z
    );
    this.camera.rotation.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0);
  }

  dispose() {
    // No listeners/resources owned directly by the controller (Input owns
    // its own DOM listeners); nothing to tear down beyond dropping refs.
    this.input = null;
    this.colliders = null;
  }
}
