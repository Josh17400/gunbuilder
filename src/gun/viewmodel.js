// First-person view model: parents the gun to the camera and blends between
// hip / ADS / sprint poses, with spring-damped recoil kick and cheap idle sway.
// See CONTRACTS.md (src/gun/viewmodel.js).

import * as THREE from "three";
import { buildGunMesh, disposeGun } from "./gunFactory.js";
import { composeStats } from "../data/stats.js";
import { clamp, lerp, damp } from "../core/utils.js";

const HIP_POS = new THREE.Vector3(0.17, -0.15, -0.35);
const HIP_ROT = new THREE.Euler(0.02, 0.06, 0.04); // slight inward yaw + roll
const SPRINT_POS = new THREE.Vector3(0.12, -0.24, -0.3);
const SPRINT_ROT = new THREE.Euler(-0.32, 0.52, 0.15); // lowered, ~30° tilt
const ADS_ROT = new THREE.Euler(0, 0, 0); // sight axis parallel to view axis
const EYE_DIST = 0.22; // eyePoint sits at camera-local (0, 0, -EYE_DIST) at full ADS

// Kick spring constants (stiff spring, damped return).
const KICK_K = 140;
const KICK_C = 16;
const KICK_BACK = 0.02; // m per unit intensity
const KICK_PITCH = 2 * (Math.PI / 180); // rad per unit intensity

// Magnified scopes (opt_4x/opt_8x) hand the sight picture to the HUD's DOM
// vignette (shown at adsAmount>0.8 && adsZoom<=0.45 — see hud.js). Once the
// vignette covers the screen the opaque tube mesh would only block the world,
// so the whole gun is hidden at deep ADS and restored on the way back down.
const SCOPE_HIDE_ZOOM = 0.45;
const SCOPE_HIDE_ADS = 0.85;

export class ViewModel {
  constructor(camera, build) {
    this.camera = camera;
    this.gun = buildGunMesh(build);

    // Measure the eyePoint's offset in gun-local space (gun is at identity and
    // unparented here, so world position == gun-local position). The ADS pose
    // places the gun so this point lands exactly on the view axis.
    this.gun.updateWorldMatrix(false, true);
    this._eyeLocal = new THREE.Vector3();
    this.gun.userData.eyePoint.getWorldPosition(this._eyeLocal);
    this._adsPos = new THREE.Vector3(
      -this._eyeLocal.x,
      -this._eyeLocal.y,
      -EYE_DIST - this._eyeLocal.z
    );

    camera.add(this.gun);

    // Composed optic zoom decides whether deep ADS hides the gun (scopes).
    this._opticZoom = composeStats(build).adsZoom;

    this.adsAmount = 0;
    this._sprintTarget = 0;
    this._sprint = 0;

    // Kick spring state (displacement back along +Z, pitch up).
    this._kickZ = 0;
    this._kickZV = 0;
    this._kickP = 0;
    this._kickPV = 0;

    this._t = Math.random() * 100; // desync sway phase between spawns
    this._pos = new THREE.Vector3();
  }

  setADS(amount) {
    // Weapon already ramps adsAmount at 1/adsTime — use it directly.
    this.adsAmount = clamp(amount, 0, 1);
  }

  kick(intensity = 1) {
    this._kickZ = Math.min(this._kickZ + KICK_BACK * intensity, 0.08);
    this._kickP = Math.min(this._kickP + KICK_PITCH * intensity, 0.14);
  }

  setSprint(amount) {
    this._sprintTarget = clamp(amount ? +amount : 0, 0, 1);
  }

  update(dt) {
    this._t += dt;
    this._sprint = damp(this._sprint, this._sprintTarget, 10, dt);

    // Kick spring (semi-implicit Euler).
    this._kickZV += (-KICK_K * this._kickZ - KICK_C * this._kickZV) * dt;
    this._kickZ += this._kickZV * dt;
    this._kickPV += (-KICK_K * this._kickP - KICK_C * this._kickPV) * dt;
    this._kickP += this._kickPV * dt;

    const ads = this.adsAmount;
    const spr = this._sprint;

    // Scope handoff: gun invisible only while fully scoped in (vignette up).
    this.gun.visible = !(this._opticZoom <= SCOPE_HIDE_ZOOM && ads >= SCOPE_HIDE_ADS);

    // Position: hip -> ADS, then -> sprint, plus sway and kick.
    this._pos.copy(HIP_POS).lerp(this._adsPos, ads).lerp(SPRINT_POS, spr);
    const swayAmp = 0.003 * (1 - 0.92 * ads) * (1 + 1.6 * spr);
    this._pos.x += Math.cos(this._t * 1.7) * swayAmp;
    this._pos.y += Math.sin(this._t * 3.4) * swayAmp;
    this._pos.z += this._kickZ;
    this.gun.position.copy(this._pos);

    // Rotation: blend euler components (all angles are small except sprint).
    this.gun.rotation.set(
      lerp(lerp(HIP_ROT.x, ADS_ROT.x, ads), SPRINT_ROT.x, spr) + this._kickP,
      lerp(lerp(HIP_ROT.y, ADS_ROT.y, ads), SPRINT_ROT.y, spr),
      lerp(lerp(HIP_ROT.z, ADS_ROT.z, ads), SPRINT_ROT.z, spr)
    );

    // Laser beam shows from the hip only (viewmodel owns this decision).
    const ud = this.gun.userData;
    if (ud.hasLaser) {
      ud.setLaser(ads < 0.3);
      if (ud.disco && ud.beamMat) {
        ud.beamMat.color.setHSL((this._t * 0.25) % 1, 1, 0.55);
      }
    }
  }

  getMuzzleWorld(outV3) {
    return this.gun.userData.muzzleTip.getWorldPosition(outV3);
  }

  dispose() {
    this.camera.remove(this.gun);
    disposeGun(this.gun);
    this.gun = null;
  }
}
