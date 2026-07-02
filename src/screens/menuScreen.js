// MenuScreen — title screen with a slowly rotating gun backdrop.

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene, clamp } from "../core/utils.js";
import { buildGunMesh, disposeGun } from "../gun/gunFactory.js";
import { makeBlobShadow } from "../world/skybits.js";
import { DEFAULT_BUILD } from "../data/parts.js";
import { getLevel } from "../data/progression.js";
import { VERSION } from "../version.js";

function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

export class MenuScreen extends Screen {
  async enter(ctx) {
    this.ctx = ctx;
    ctx.input.setGameplayMode(false);

    const lastBuild = ctx.save.loadLastBuild() || DEFAULT_BUILD;

    // ---- Scene ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x14171c);
    this.scene.fog = new THREE.Fog(0x14171c, 3.5, 9);

    this.camera = new THREE.PerspectiveCamera(
      45, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 50
    );

    // Studio three-point-ish rig (tuned for ACES, see main.js): warm key,
    // cool hemisphere fill, and a cool rim that sweeps as the gun rotates.
    const dir = new THREE.DirectionalLight(0xfff2dd, 1.65);
    dir.position.set(2, 3, 2);
    this.scene.add(dir);
    this.scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x2a2e33, 1.25));
    const rim = new THREE.DirectionalLight(0x86a8d8, 1.1);
    rim.position.set(-2.5, 2.2, -2.5);
    this.scene.add(rim);

    // Studio floor disc so the blob shadow has a surface to read against.
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.02, 40),
      new THREE.MeshLambertMaterial({ color: 0x1c2028 })
    );
    floor.position.y = -0.01;
    this.scene.add(floor);

    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 1.15, 0);
    this.scene.add(this.pivot);

    this.gunGroup = buildGunMesh(copyBuild(lastBuild));
    this.pivot.add(this.gunGroup);

    // Frame the gun: distance based on its bounding sphere.
    const box = new THREE.Box3().setFromObject(this.gunGroup);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = clamp(sphere.radius * 3.4, 0.9, 2.4);
    this._camBase = new THREE.Vector3(0.12, 1.32, dist);
    this._camT = 0;
    this.camera.position.copy(this._camBase);
    this.camera.lookAt(0, 1.15, 0);

    // Soft blob shadow under the showcase gun.
    const blob = makeBlobShadow(clamp(sphere.radius * 1.2, 0.35, 0.9));
    this.scene.add(blob);

    // ---- DOM ----
    const ui = document.getElementById("ui");
    this.root = document.createElement("div");
    this.root.className = "gb-menu";
    Object.assign(this.root.style, {
      position: "absolute", inset: "0", display: "flex",
      flexDirection: "column", alignItems: "center",
      pointerEvents: "none", textAlign: "center",
    });

    const title = document.createElement("h1");
    title.textContent = "GUNBUILDER";
    Object.assign(title.style, {
      marginTop: "9vh", marginBottom: "0",
      fontSize: "clamp(40px, 9vw, 84px)", letterSpacing: "0.08em",
      color: "#f2f2f2", textShadow: "0 2px 14px rgba(0,0,0,0.6)",
    });
    this.root.appendChild(title);

    const sub = document.createElement("p");
    sub.textContent = "Assemble it. Test it. Clear the course.";
    Object.assign(sub.style, { marginTop: "10px", color: "#9aa3ad", fontSize: "15px" });
    this.root.appendChild(sub);

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    this.root.appendChild(spacer);

    const btnCol = document.createElement("div");
    Object.assign(btnCol.style, {
      display: "flex", flexDirection: "column", gap: "12px",
      marginBottom: "11vh", pointerEvents: "auto",
    });

    const mkBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.className = "gb-btn";
      b.textContent = label;
      b.style.minWidth = "240px";
      b.addEventListener("click", () => {
        ctx.audio.play("uiClick");
        onClick();
      });
      btnCol.appendChild(b);
      return b;
    };

    // Recompute level on every enter (XP may have changed mid-session).
    let level = 1;
    try {
      level = getLevel(ctx.save.loadProgress().xp).level;
    } catch (err) {
      console.error("MenuScreen: level lookup failed", err);
    }

    const careerBtn = mkBtn("CAREER", () => {
      ctx.manager.goTo("career");
    });
    careerBtn.classList.add("gb-btn-primary");
    const lvBadge = document.createElement("span");
    lvBadge.className = "gb-menu-lv";
    lvBadge.textContent = `Lv ${level}`;
    careerBtn.appendChild(lvBadge);

    mkBtn("BUILD A GUN", () => {
      const b = ctx.save.loadLastBuild() || DEFAULT_BUILD;
      ctx.manager.goTo("builder", { build: copyBuild(b) });
    });
    mkBtn("FREE RANGE", () => {
      const b = ctx.save.loadLastBuild() || DEFAULT_BUILD;
      ctx.manager.goTo("rangeSelect", { build: copyBuild(b) });
    });
    mkBtn("ZOMBIES", () => {
      const b = ctx.save.loadLastBuild() || DEFAULT_BUILD;
      ctx.manager.goTo("zombies", { build: copyBuild(b) });
    });
    this.root.appendChild(btnCol);

    const footer = document.createElement("div");
    footer.textContent = `v${VERSION}`;
    Object.assign(footer.style, {
      position: "absolute", bottom: "10px", left: "0", right: "0",
      color: "#5a626b", fontSize: "12px",
    });
    this.root.appendChild(footer);

    ui.appendChild(this.root);
  }

  update(dt) {
    if (!this.pivot) return;
    this.pivot.rotation.y += 0.35 * dt;
    // Slow camera drift — keeps the showcase alive without stealing focus.
    this._camT += dt;
    this.camera.position.set(
      this._camBase.x + Math.sin(this._camT * 0.21) * 0.07,
      this._camBase.y + Math.sin(this._camT * 0.13 + 1.7) * 0.045,
      this._camBase.z
    );
    this.camera.lookAt(0, 1.15, 0);
  }

  exit() {
    if (this.root) { this.root.remove(); this.root = null; }
    if (this.gunGroup) { disposeGun(this.gunGroup); this.gunGroup = null; }
    this.pivot = null;
    if (this.scene) { disposeScene(this.scene); }
    this.scene = null;
    this.camera = null;
  }
}
