// BuilderScreen — assemble a gun: slot tabs, part cards, stat panel with
// live diff previews, save/load, orbit view of the current build.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Screen } from "../core/screens.js";
import { disposeScene, clamp, invLerp } from "../core/utils.js";
import { buildGunMesh, disposeGun } from "../gun/gunFactory.js";
import { SLOTS, PARTS, PARTS_BY_SLOT, DEFAULT_BUILD } from "../data/parts.js";
import { STAT_DEFS, composeStats, diffStats } from "../data/stats.js";
import { isCompatible, sanitizeBuild } from "../data/compat.js";

const SLOT_LABELS = {
  receiver: "Receiver", barrel: "Barrel", muzzle: "Muzzle", optic: "Optic",
  mag: "Mag", stock: "Stock", grip: "Grip", underbarrel: "Under",
  laser: "Laser", ammo: "Ammo",
};
const NULLABLE_SLOTS = new Set(["muzzle", "stock", "underbarrel", "laser"]);
const ACCENT = "#ffb347";
const GOOD = "#7ddf7d";
const BAD = "#ff7d7d";

function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

export class BuilderScreen extends Screen {
  async enter(ctx, params) {
    this.ctx = ctx;
    ctx.input.setGameplayMode(false);

    this.build = copyBuild((params && params.build) || ctx.save.loadLastBuild() || DEFAULT_BUILD);
    this.slot = "receiver";
    this.previewValue = undefined;   // part id | null (None) | undefined (no preview)
    this.pendingTapValue = undefined; // touch two-tap tracking
    this.statOpen = false;
    this._timers = [];

    // ---- Scene ----
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1e24);

    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.02, 48),
      new THREE.MeshLambertMaterial({ color: 0x22262c })
    );
    floor.position.y = -0.01;
    this.scene.add(floor);

    this.scene.add(new THREE.HemisphereLight(0xbfd6e8, 0x3a3f46, 0.8));
    const key = new THREE.DirectionalLight(0xfff2dd, 0.9);
    key.position.set(2, 3, 1.5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899bb, 0.4);
    fill.position.set(-2, 2, -2);
    this.scene.add(fill);

    this.camera = new THREE.PerspectiveCamera(
      45, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 60
    );
    this.camera.position.set(0.7, 1.5, 1.1);

    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 1.2, 0);
    this.scene.add(this.pivot);
    this.gunGroup = null;

    this.controls = new OrbitControls(this.camera, ctx.renderer.domElement);
    this.controls.target.set(0, 1.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 3;
    this.controls.enablePan = false;

    // ---- DOM ----
    this._buildDom();
    this._rebuildGun(true);
    this._renderTabs();
    this._renderCards();
    this._renderPanel();

    this._mq = window.matchMedia("(max-width: 900px)");
    this._mqHandler = () => this._applyLayout();
    this._mq.addEventListener("change", this._mqHandler);
    this._applyLayout();
  }

  // ------------------------------------------------------------------ DOM

  _buildDom() {
    const ui = document.getElementById("ui");
    this.root = document.createElement("div");
    this.root.className = "gb-builder";
    Object.assign(this.root.style, {
      position: "absolute", inset: "0", display: "flex",
      flexDirection: "column", pointerEvents: "none",
    });

    // Header row
    const header = document.createElement("div");
    header.className = "gb-panel";
    Object.assign(header.style, {
      display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap",
      margin: "8px", padding: "8px 10px", pointerEvents: "auto",
    });

    const menuBtn = this._mkBtn("‹", () => {
      this.ctx.save.saveLastBuild(this.build);
      this.ctx.manager.goTo("menu");
    });
    menuBtn.title = "Back to menu";
    header.appendChild(menuBtn);

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.maxLength = 24;
    this.nameInput.value = this.build.name || "";
    this.nameInput.placeholder = "Build name";
    Object.assign(this.nameInput.style, {
      flex: "1", minWidth: "90px", background: "#22262c",
      border: "1px solid #3a3f46", color: "#eee", padding: "8px 10px",
      borderRadius: "6px", fontSize: "15px",
    });
    this.nameInput.addEventListener("input", () => {
      this.build.name = this.nameInput.value.trim() || "Untitled";
    });
    header.appendChild(this.nameInput);

    header.appendChild(this._mkBtn("SAVE", () => this._saveBuild()));
    header.appendChild(this._mkBtn("LOAD", () => this._openLoad()));
    header.appendChild(this._mkBtn("TEST →", () => {
      this.ctx.save.saveLastBuild(this.build);
      this.ctx.manager.goTo("rangeSelect", { build: copyBuild(this.build) });
    }));
    this.root.appendChild(header);

    // Middle spacer — orbit area (canvas beneath receives events).
    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    this.root.appendChild(spacer);

    // Stat panel
    this.statPanel = document.createElement("div");
    this.statPanel.className = "gb-panel";
    Object.assign(this.statPanel.style, {
      pointerEvents: "auto", overflowY: "auto", padding: "10px 12px",
    });
    this.root.appendChild(this.statPanel);

    // Bottom dock: card strip + tab row
    const dock = document.createElement("div");
    Object.assign(dock.style, { pointerEvents: "auto" });

    this.cardStrip = document.createElement("div");
    Object.assign(this.cardStrip.style, {
      display: "flex", gap: "8px", overflowX: "auto",
      padding: "6px 10px", WebkitOverflowScrolling: "touch",
    });
    dock.appendChild(this.cardStrip);

    const tabRow = document.createElement("div");
    Object.assign(tabRow.style, {
      display: "flex", gap: "6px", alignItems: "center",
      padding: "2px 10px 10px",
    });
    this.tabScroller = document.createElement("div");
    Object.assign(this.tabScroller.style, {
      display: "flex", gap: "6px", overflowX: "auto", flex: "1",
      WebkitOverflowScrolling: "touch",
    });
    tabRow.appendChild(this.tabScroller);

    this.statToggle = this._mkBtn("STATS", () => {
      this.statOpen = !this.statOpen;
      this._applyLayout();
    });
    this.statToggle.style.flex = "0 0 auto";
    tabRow.appendChild(this.statToggle);

    dock.appendChild(tabRow);
    this.root.appendChild(dock);

    ui.appendChild(this.root);
  }

  _mkBtn(label, onClick) {
    const b = document.createElement("button");
    b.className = "gb-btn";
    b.textContent = label;
    b.addEventListener("click", () => {
      this.ctx.audio.play("uiClick");
      onClick();
    });
    return b;
  }

  _applyLayout() {
    const mobile = this._mq.matches;
    if (mobile) {
      Object.assign(this.statPanel.style, {
        position: "absolute", left: "8px", right: "8px", top: "auto",
        bottom: "175px", width: "auto", maxHeight: "38vh",
        display: this.statOpen ? "block" : "none", zIndex: "5",
      });
      this.statToggle.style.display = "";
      this.statToggle.textContent = this.statOpen ? "STATS ▾" : "STATS ▴";
    } else {
      Object.assign(this.statPanel.style, {
        position: "absolute", right: "12px", top: "70px", left: "auto",
        bottom: "auto", width: "264px", maxHeight: "calc(100% - 290px)",
        display: "block", zIndex: "5",
      });
      this.statToggle.style.display = "none";
    }
  }

  // ------------------------------------------------------------------ 3D

  _rebuildGun(first = false) {
    if (this.gunGroup) {
      this.pivot.remove(this.gunGroup);
      disposeGun(this.gunGroup);
      this.gunGroup = null;
    }
    this.gunGroup = buildGunMesh(copyBuild(this.build));
    this.pivot.add(this.gunGroup);
    this._autoFrame(first);
  }

  _autoFrame(snap = false) {
    // Box3.setFromObject does not refresh ancestor transforms; before the first
    // render the pivot's matrixWorld is still identity, which would frame the
    // gun's local-space box ~1.2m below where it actually renders.
    this.pivot.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(this.gunGroup);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = (sphere.radius * 1.35) / Math.tan(fov / 2);
    dist = clamp(dist, 0.55, 2.8);

    this.controls.target.copy(sphere.center);
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.5, 0.25, 1);
    dir.normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    if (snap) this.controls.update();
  }

  // ------------------------------------------------------------------ Tabs / cards

  _renderTabs() {
    this.tabScroller.textContent = "";
    for (const slot of SLOTS) {
      const t = document.createElement("button");
      t.className = "gb-tab";
      t.textContent = SLOT_LABELS[slot] || slot;
      Object.assign(t.style, { whiteSpace: "nowrap", cursor: "pointer", flex: "0 0 auto" });
      if (slot === this.slot) {
        t.classList.add("gb-active");
        t.style.borderBottom = `2px solid ${ACCENT}`;
        t.style.color = ACCENT;
      }
      t.addEventListener("click", () => {
        if (this.slot === slot) return;
        this.ctx.audio.play("uiClick");
        this.slot = slot;
        this._clearPreview();
        this._renderTabs();
        this._renderCards();
      });
      this.tabScroller.appendChild(t);
    }
  }

  _cardEntries() {
    const parts = PARTS_BY_SLOT[this.slot] || [];
    const entries = [];
    if (NULLABLE_SLOTS.has(this.slot)) {
      entries.push({ value: null, name: "None", blurb: "Leave slot empty", note: "" });
    }
    for (const p of parts) {
      let note = "";
      if (this.slot === "receiver" && p.caliberFamily) note = `caliber: ${p.caliberFamily}`;
      if (this.slot === "ammo" && p.ammo && p.ammo.families) note = `fits: ${p.ammo.families.join(" / ")}`;
      entries.push({ value: p.id, name: p.name, blurb: p.blurb || "", note });
    }
    return entries;
  }

  _renderCards() {
    this.cardStrip.textContent = "";
    const equippedValue = this.build[this.slot];

    for (const entry of this._cardEntries()) {
      const card = document.createElement("div");
      card.className = "gb-card";
      Object.assign(card.style, {
        flex: "0 0 auto", width: "150px", cursor: "pointer",
        padding: "8px 10px", boxSizing: "border-box",
      });

      const nameEl = document.createElement("div");
      nameEl.textContent = entry.name;
      Object.assign(nameEl.style, { fontWeight: "600", fontSize: "14px" });
      card.appendChild(nameEl);

      const blurbEl = document.createElement("div");
      blurbEl.textContent = entry.blurb;
      Object.assign(blurbEl.style, { fontSize: "12px", opacity: "0.75", marginTop: "2px" });
      card.appendChild(blurbEl);

      if (entry.note) {
        const noteEl = document.createElement("div");
        noteEl.textContent = entry.note;
        Object.assign(noteEl.style, { fontSize: "11px", opacity: "0.6", marginTop: "2px" });
        card.appendChild(noteEl);
      }

      // Compatibility (receiver slot & "None" are always allowed).
      let compat = { ok: true };
      if (entry.value !== null && this.slot !== "receiver") {
        compat = isCompatible(this.build.receiver, this.slot, entry.value);
      }

      const equipped = equippedValue === entry.value;
      if (equipped) {
        card.classList.add("gb-active");
        card.style.outline = `2px solid ${ACCENT}`;
      }

      if (!compat.ok) {
        card.classList.add("gb-disabled");
        card.style.opacity = "0.45";
        const reasonEl = document.createElement("div");
        reasonEl.textContent = compat.reason || "Incompatible";
        Object.assign(reasonEl.style, { fontSize: "11px", color: BAD, marginTop: "3px" });
        card.appendChild(reasonEl);
        card.addEventListener("click", () => {
          this._toast(compat.reason || "Incompatible with this receiver");
        });
        this.cardStrip.appendChild(card);
        continue;
      }

      // Desktop hover preview
      if (!this.ctx.input.isTouch) {
        card.addEventListener("mouseenter", () => {
          if (!equipped) this._setPreview(entry.value);
        });
        card.addEventListener("mouseleave", () => this._clearPreview());
      }

      card.addEventListener("click", () => {
        if (equipped) return;
        if (this.ctx.input.isTouch && this.pendingTapValue !== entry.value) {
          // first tap: preview
          this.pendingTapValue = entry.value;
          this._setPreview(entry.value);
          for (const c of this.cardStrip.children) c.style.boxShadow = "";
          card.style.boxShadow = `0 0 0 2px ${ACCENT} inset`;
          if (this._mq.matches && !this.statOpen) {
            this.statOpen = true;
            this._applyLayout();
          }
          return;
        }
        this._equip(entry.value);
      });

      this.cardStrip.appendChild(card);
    }
  }

  // ------------------------------------------------------------------ Preview / equip

  _previewBuildFor(value) {
    const pb = copyBuild(this.build);
    pb[this.slot] = value;
    if (this.slot === "receiver") {
      const res = sanitizeBuild(pb);
      return res && res.build ? res.build : res || pb;
    }
    return pb;
  }

  _setPreview(value) {
    this.previewValue = value;
    const pb = this._previewBuildFor(value);
    this._renderPanel(pb);
  }

  _clearPreview() {
    this.previewValue = undefined;
    this.pendingTapValue = undefined;
    for (const c of this.cardStrip.children) c.style.boxShadow = "";
    this._renderPanel();
  }

  _equip(value) {
    this.ctx.audio.play("uiClick");
    this.build[this.slot] = value;

    // Sanitize after EVERY equip, not just receiver swaps — cross-slot rules
    // (e.g. an integrally-suppressed barrel dropping the muzzle device) only
    // live in sanitizeBuild, not in the per-slot isCompatible check.
    {
      let dropped = [];
      const res = sanitizeBuild(this.build);
      if (res && res.build) {
        this.build = res.build;
        dropped = res.dropped || [];
      } else if (res) {
        this.build = res;
      }
      if (dropped.length) this._toast(`Dropped: ${dropped.join(", ")}`);
    }

    this.previewValue = undefined;
    this.pendingTapValue = undefined;
    this._rebuildGun();
    this._renderCards();
    this._renderPanel();
  }

  // ------------------------------------------------------------------ Stat panel

  _renderPanel(previewBuild) {
    this.statPanel.textContent = "";

    const title = document.createElement("div");
    title.textContent = previewBuild ? "STATS — PREVIEW" : "STATS";
    Object.assign(title.style, {
      fontWeight: "700", fontSize: "13px", letterSpacing: "0.06em",
      color: previewBuild ? ACCENT : "#dfe3e8", marginBottom: "6px",
    });
    this.statPanel.appendChild(title);

    let baseStats, showStats, diff = null;
    try {
      baseStats = composeStats(this.build);
      showStats = previewBuild ? composeStats(previewBuild) : baseStats;
      if (previewBuild) diff = diffStats(this.build, previewBuild);
    } catch (err) {
      console.error("BuilderScreen: composeStats failed", err);
      return;
    }

    for (const [stat, def] of Object.entries(STAT_DEFS)) {
      if (!def.showInPanel) continue;
      const v = showStats[stat];
      if (typeof v !== "number" || !isFinite(v)) continue;

      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid", gridTemplateColumns: "88px 1fr 84px",
        gap: "8px", alignItems: "center", margin: "5px 0", fontSize: "12px",
      });

      const label = document.createElement("div");
      label.textContent = def.label;
      label.style.opacity = "0.8";
      row.appendChild(label);

      const changed = diff && diff[stat];
      const bar = document.createElement("div");
      Object.assign(bar.style, {
        height: "6px", background: "#333840", borderRadius: "3px", overflow: "hidden",
      });
      const fill = document.createElement("div");
      const frac = clamp(invLerp(def.min, def.max, v), 0, 1);
      Object.assign(fill.style, {
        height: "100%", width: `${(frac * 100).toFixed(1)}%`,
        borderRadius: "3px",
        background: changed
          ? (changed.better === true ? GOOD : changed.better === false ? BAD : "#9aa3ad")
          : ACCENT,
      });
      bar.appendChild(fill);
      row.appendChild(bar);

      const valEl = document.createElement("div");
      Object.assign(valEl.style, { textAlign: "right", whiteSpace: "nowrap" });
      let text = "";
      try { text = def.format ? def.format(v) : String(v); } catch { text = String(v); }
      if (changed) {
        const arrow = changed.to > changed.from ? "▲" : "▼";
        const color = changed.better === true ? GOOD : changed.better === false ? BAD : "#9aa3ad";
        valEl.innerHTML = "";
        const arrowEl = document.createElement("span");
        arrowEl.textContent = arrow + " ";
        arrowEl.style.color = color;
        valEl.appendChild(arrowEl);
        valEl.appendChild(document.createTextNode(text));
      } else {
        valEl.textContent = text;
      }
      row.appendChild(valEl);

      this.statPanel.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ Save / load

  _saveBuild() {
    this.build.name = (this.nameInput.value || "").trim() || "Untitled";
    this.nameInput.value = this.build.name;
    const builds = this.ctx.save.loadBuilds() || [];
    const idx = builds.findIndex((b) => b && b.name === this.build.name);
    if (idx >= 0) {
      builds[idx] = copyBuild(this.build);
    } else {
      if (builds.length >= 20) {
        this._toast("Storage full — 20 builds max. Delete one first.");
        return;
      }
      builds.push(copyBuild(this.build));
    }
    this.ctx.save.saveBuilds(builds);
    this.ctx.save.saveLastBuild(this.build);
    this._toast(`Saved “${this.build.name}”`);
  }

  _openLoad() {
    if (this.loadOverlay) this.loadOverlay.remove();
    const overlay = document.createElement("div");
    this.loadOverlay = overlay;
    Object.assign(overlay.style, {
      position: "absolute", inset: "0", background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      pointerEvents: "auto", zIndex: "20",
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeLoad();
    });

    const panel = document.createElement("div");
    panel.className = "gb-panel";
    Object.assign(panel.style, {
      width: "min(420px, 92vw)", maxHeight: "70vh", overflowY: "auto",
      padding: "14px",
    });

    const head = document.createElement("div");
    Object.assign(head.style, {
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: "8px",
    });
    const h = document.createElement("div");
    h.textContent = "SAVED BUILDS";
    Object.assign(h.style, { fontWeight: "700", letterSpacing: "0.06em" });
    head.appendChild(h);
    head.appendChild(this._mkBtn("✕", () => this._closeLoad()));
    panel.appendChild(head);

    const renderList = () => {
      // clear old rows (everything after header)
      while (panel.children.length > 1) panel.lastChild.remove();
      const builds = this.ctx.save.loadBuilds() || [];
      if (!builds.length) {
        const empty = document.createElement("div");
        empty.textContent = "No saved builds yet.";
        empty.style.opacity = "0.7";
        empty.style.padding = "10px 0";
        panel.appendChild(empty);
        return;
      }
      builds.forEach((b, i) => {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex", gap: "8px", alignItems: "center", margin: "6px 0",
        });

        const main = document.createElement("div");
        main.className = "gb-card";
        Object.assign(main.style, { flex: "1", cursor: "pointer", padding: "8px 10px" });
        const nm = document.createElement("div");
        nm.textContent = b.name || "Untitled";
        nm.style.fontWeight = "600";
        main.appendChild(nm);
        const rcv = PARTS[b.receiver];
        const subEl = document.createElement("div");
        subEl.textContent = rcv ? rcv.name : b.receiver;
        Object.assign(subEl.style, { fontSize: "12px", opacity: "0.7" });
        main.appendChild(subEl);
        main.addEventListener("click", () => {
          this.ctx.audio.play("uiClick");
          this.build = copyBuild(b);
          this.nameInput.value = this.build.name || "";
          this._clearPreview();
          this._rebuildGun();
          this._renderCards();
          this._renderPanel();
          this._closeLoad();
          this._toast(`Loaded “${this.build.name}”`);
        });
        row.appendChild(main);

        const del = this._mkBtn("✕", () => {
          if (del.dataset.confirm) {
            const arr = this.ctx.save.loadBuilds() || [];
            arr.splice(i, 1);
            this.ctx.save.saveBuilds(arr);
            renderList();
          } else {
            del.dataset.confirm = "1";
            del.textContent = "sure?";
            const t = setTimeout(() => {
              delete del.dataset.confirm;
              del.textContent = "✕";
            }, 1600);
            this._timers.push(t);
          }
        });
        row.appendChild(del);
        panel.appendChild(row);
      });
    };

    renderList();
    overlay.appendChild(panel);
    this.root.appendChild(overlay);
  }

  _closeLoad() {
    if (this.loadOverlay) {
      this.loadOverlay.remove();
      this.loadOverlay = null;
    }
  }

  // ------------------------------------------------------------------ misc

  _toast(text) {
    const t = document.createElement("div");
    t.className = "gb-toast";
    t.textContent = text;
    Object.assign(t.style, {
      position: "absolute", left: "50%", top: "72px",
      transform: "translateX(-50%)", pointerEvents: "none", zIndex: "30",
    });
    this.root.appendChild(t);
    this._timers.push(setTimeout(() => t.remove(), 2200));
  }

  update() {
    if (this.controls) this.controls.update();
  }

  exit() {
    for (const t of this._timers || []) clearTimeout(t);
    this._timers = [];
    if (this._mq && this._mqHandler) {
      this._mq.removeEventListener("change", this._mqHandler);
      this._mq = null;
      this._mqHandler = null;
    }
    if (this.controls) { this.controls.dispose(); this.controls = null; }
    if (this.root) { this.root.remove(); this.root = null; }
    this.loadOverlay = null;
    if (this.gunGroup) { disposeGun(this.gunGroup); this.gunGroup = null; }
    this.pivot = null;
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
  }
}
