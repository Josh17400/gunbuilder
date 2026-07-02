// RangeSelectScreen — pick between the static test lanes and the timed
// clearing course. Pure DOM over a plain dark scene.

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene } from "../core/utils.js";
import { SLOTS, PARTS, DEFAULT_BUILD } from "../data/parts.js";

function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(3).padStart(6, "0")}`;
}

export class RangeSelectScreen extends Screen {
  async enter(ctx, params) {
    this.ctx = ctx;
    ctx.input.setGameplayMode(false);

    this.build = copyBuild(
      (params && params.build) || ctx.save.loadLastBuild() || DEFAULT_BUILD
    );

    // Minimal scene so the manager clears the previous screen's frame.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1116);
    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 10
    );

    const ui = document.getElementById("ui");
    this.root = document.createElement("div");
    this.root.className = "gb-range-select";
    Object.assign(this.root.style, {
      position: "absolute", inset: "0", display: "flex",
      alignItems: "center", justifyContent: "center",
      pointerEvents: "none",
    });

    const panel = document.createElement("div");
    panel.className = "gb-panel";
    Object.assign(panel.style, {
      width: "min(460px, 92vw)", maxHeight: "88vh", overflowY: "auto",
      padding: "18px", pointerEvents: "auto", textAlign: "center",
    });

    const h = document.createElement("h2");
    h.textContent = "CHOOSE A RANGE";
    Object.assign(h.style, { margin: "0 0 6px", letterSpacing: "0.08em" });
    panel.appendChild(h);

    // Build summary line
    const rcv = PARTS[this.build.receiver];
    const ammoPart = PARTS[this.build.ammo];
    const partCount = SLOTS.filter((s) => this.build[s]).length;
    const summary = document.createElement("div");
    summary.textContent =
      `${this.build.name || "Untitled"} — ${rcv ? rcv.name : this.build.receiver}` +
      ` · ${partCount} parts · ${ammoPart ? ammoPart.name : this.build.ammo}`;
    Object.assign(summary.style, {
      fontSize: "13px", opacity: "0.75", marginBottom: "16px",
    });
    panel.appendChild(summary);

    const mkCard = (title, sub, lines, onClick) => {
      const card = document.createElement("div");
      card.className = "gb-card";
      Object.assign(card.style, {
        cursor: "pointer", padding: "16px", margin: "10px 0",
        textAlign: "left",
      });
      const t = document.createElement("div");
      t.textContent = title;
      Object.assign(t.style, { fontWeight: "700", fontSize: "17px", letterSpacing: "0.04em" });
      card.appendChild(t);
      const s = document.createElement("div");
      s.textContent = sub;
      Object.assign(s.style, { fontSize: "13px", opacity: "0.75", marginTop: "4px" });
      card.appendChild(s);
      for (const line of lines) {
        const l = document.createElement("div");
        l.textContent = line;
        Object.assign(l.style, { fontSize: "12px", color: "#ffb347", marginTop: "6px" });
        card.appendChild(l);
      }
      card.addEventListener("click", () => {
        ctx.audio.play("uiClick");
        onClick();
      });
      panel.appendChild(card);
      return card;
    };

    mkCard(
      "TEST LANES",
      "Free shoot · damage readouts at range",
      [],
      () => ctx.manager.goTo("staticRange", { build: copyBuild(this.build) })
    );

    // Best times for the course card
    const bestLines = [];
    try {
      const bt = ctx.save.loadBestTimes();
      const course = (bt && bt.course) || {};
      if (course.global && typeof course.global.time === "number") {
        bestLines.push(`Best: ${fmtTime(course.global.time)} — ${course.global.buildName || "?"}`);
      } else {
        bestLines.push("No best time yet — set one!");
      }
      const mine = course.byBuild && course.byBuild[this.build.name];
      if (typeof mine === "number") {
        bestLines.push(`This build: ${fmtTime(mine)}`);
      }
    } catch (err) {
      console.error("RangeSelectScreen: loadBestTimes failed", err);
    }

    mkCard(
      "CLEARING COURSE",
      "Timed run · clear every target, avoid the white ones",
      bestLines,
      () => ctx.manager.goTo("course", { build: copyBuild(this.build) })
    );

    const back = document.createElement("button");
    back.className = "gb-btn";
    back.textContent = "‹ BACK TO BUILDER";
    back.style.marginTop = "10px";
    back.addEventListener("click", () => {
      ctx.audio.play("uiClick");
      ctx.manager.goTo("builder", { build: copyBuild(this.build) });
    });
    panel.appendChild(back);

    this.root.appendChild(panel);
    ui.appendChild(this.root);
  }

  exit() {
    if (this.root) { this.root.remove(); this.root = null; }
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
  }
}
