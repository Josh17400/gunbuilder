// CareerScreen — mission list + XP header. Pure DOM over a plain dark
// scene (tiny scene/camera so the manager clears the canvas each frame).
//
// Layout: header (back / CAREER / level badge + XP bar) above a scrolling
// mission list. Tapping an unlocked mission expands an inline detail panel
// (story, objective in plain words, forced-loadout note, START).
// NOTE: the list scroller is nested inside an overflow:hidden wrapper —
// a composited overflow scroller layered directly over the WebGL canvas
// paints a white block on Chromium (see builder stat drawer note in
// style.css).

import * as THREE from "three";
import { Screen } from "../core/screens.js";
import { disposeScene } from "../core/utils.js";
import { PARTS, DEFAULT_BUILD } from "../data/parts.js";
import { sanitizeBuild } from "../data/compat.js";
import { MISSIONS, MAX_LEVEL, getLevel } from "../data/progression.js";

function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

function fmtNum(n) {
  return Math.round(n).toLocaleString("en-US");
}

// progress.missions[id] may be a bare star count or {stars} — accept both.
function starsOf(progress, missionId) {
  const rec = progress && progress.missions ? progress.missions[missionId] : null;
  if (typeof rec === "number") return rec;
  if (rec && typeof rec.stars === "number") return rec.stars;
  return 0;
}

function starString(n) {
  return "★".repeat(n) + "☆".repeat(3 - n);
}

// Objective → plain words + star hint.
function describeObjective(m) {
  const o = m.objective || {};
  const s = m.stars || [0, 0, 0];
  if (o.type === "hits") {
    return {
      text: `Hit ${o.count} targets within ${o.timeLimit} seconds.`,
      starHint: `★ finish · ★★ ${s[1]}s to spare · ★★★ ${s[2]}s to spare`,
    };
  }
  if (o.type === "damage") {
    return {
      text: `Deal ${fmtNum(o.amount)} total damage within ${o.timeLimit} seconds.`,
      starHint: `★ finish · ★★ ${s[1]}s to spare · ★★★ ${s[2]}s to spare`,
    };
  }
  // "time" (course)
  return {
    text: "Clear the course and cross the finish pad as fast as you can.",
    starHint: `★ under ${s[0]}s · ★★ under ${s[1]}s · ★★★ under ${s[2]}s`,
  };
}

export class CareerScreen extends Screen {
  async enter(ctx) {
    this.ctx = ctx;
    ctx.input.setGameplayMode(false);

    // Minimal scene so the manager clears the previous screen's frame.
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1116);
    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 10
    );

    let progress = { xp: 0, missions: {} };
    try {
      progress = ctx.save.loadProgress() || progress;
    } catch (err) {
      console.error("CareerScreen: loadProgress failed", err);
    }
    this.progress = progress;
    this.selectedId = null;
    this.cards = new Map(); // mission.id -> { card, detailHost, locked }

    // ---- DOM ----
    const ui = document.getElementById("ui");
    this.root = document.createElement("div");
    this.root.className = "gb-career";
    ui.appendChild(this.root);

    this.root.appendChild(this._buildHeader(progress.xp));

    const wrap = document.createElement("div");
    wrap.className = "gb-career-scrollwrap";
    this.root.appendChild(wrap);

    const list = document.createElement("div");
    list.className = "gb-career-list";
    wrap.appendChild(list);

    let prevStars = 1; // m01 always unlocked
    let firstPlayableId = null;
    MISSIONS.forEach((m, i) => {
      const locked = i > 0 && prevStars < 1;
      const stars = starsOf(progress, m.id);
      if (!locked && firstPlayableId === null && stars === 0) firstPlayableId = m.id;
      list.appendChild(this._buildCard(m, i, stars, locked));
      prevStars = stars;
    });

    // Auto-expand the mission the player is "on" (first unlocked with 0 stars).
    if (firstPlayableId) this._select(firstPlayableId, { scroll: true });
  }

  _buildHeader(xp) {
    const ctx = this.ctx;
    const header = document.createElement("div");
    header.className = "gb-panel gb-career-header";

    const topRow = document.createElement("div");
    topRow.className = "gb-career-header-row";
    header.appendChild(topRow);

    const back = document.createElement("button");
    back.className = "gb-btn gb-career-back";
    back.textContent = "‹";
    back.setAttribute("aria-label", "Back to menu");
    back.addEventListener("click", () => {
      ctx.audio.play("uiClick");
      ctx.manager.goTo("menu");
    });
    topRow.appendChild(back);

    const title = document.createElement("h2");
    title.className = "gb-career-title";
    title.textContent = "CAREER";
    topRow.appendChild(title);

    const lv = getLevel(xp);
    const atMax = lv.level >= MAX_LEVEL;

    const badge = document.createElement("div");
    badge.className = "gb-career-lv-badge";
    badge.textContent = `Lv ${lv.level}`;
    topRow.appendChild(badge);

    const xpRow = document.createElement("div");
    xpRow.className = "gb-career-xp-row";
    header.appendChild(xpRow);

    // toNext = XP still needed for the next level, so the full span of the
    // current level is into + toNext.
    const span = lv.into + lv.toNext;

    const bar = document.createElement("div");
    bar.className = "gb-career-xp-bar";
    const fill = document.createElement("div");
    fill.className = "gb-career-xp-fill";
    const pct = atMax || !(span > 0) ? 1 : Math.min(1, lv.into / span);
    fill.style.width = `${(pct * 100).toFixed(1)}%`;
    bar.appendChild(fill);
    xpRow.appendChild(bar);

    const label = document.createElement("div");
    label.className = "gb-career-xp-label";
    label.textContent = atMax
      ? `Lv ${lv.level} · MAX`
      : `Lv ${lv.level} · ${fmtNum(lv.into)} / ${fmtNum(span)} XP`;
    xpRow.appendChild(label);

    return header;
  }

  _buildCard(m, index, stars, locked) {
    const ctx = this.ctx;
    const card = document.createElement("div");
    card.className = "gb-card gb-career-card" + (locked ? " gb-locked" : "");

    const row = document.createElement("div");
    row.className = "gb-career-row";
    card.appendChild(row);

    const num = document.createElement("div");
    num.className = "gb-career-num";
    num.textContent = String(index + 1).padStart(2, "0");
    row.appendChild(num);

    const main = document.createElement("div");
    main.className = "gb-career-main";
    row.appendChild(main);

    const title = document.createElement("div");
    title.className = "gb-career-card-title";
    title.textContent = m.title;
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "gb-career-meta";
    main.appendChild(meta);

    const chip = document.createElement("span");
    chip.className = `gb-career-chip gb-career-chip-${m.mode === "course" ? "course" : "lanes"}`;
    chip.textContent = m.mode === "course" ? "COURSE" : "LANES";
    meta.appendChild(chip);

    const xp = document.createElement("span");
    xp.className = "gb-career-reward";
    xp.textContent = `+${fmtNum(m.rewardXp)} XP`;
    meta.appendChild(xp);

    const right = document.createElement("div");
    right.className = "gb-career-right";
    if (locked) {
      right.textContent = "🔒";
      right.classList.add("gb-career-lock");
    } else {
      right.textContent = starString(stars);
      right.classList.add("gb-career-stars");
      if (stars > 0) right.classList.add("gb-career-stars-earned");
    }
    row.appendChild(right);

    const detailHost = document.createElement("div");
    detailHost.className = "gb-career-detail-host";
    card.appendChild(detailHost);

    if (!locked) {
      card.addEventListener("click", (e) => {
        // Don't collapse when tapping inside the expanded detail (START btn).
        if (detailHost.contains(e.target)) return;
        ctx.audio.play("uiClick");
        this._select(this.selectedId === m.id ? null : m.id, { scroll: false });
      });
    }

    this.cards.set(m.id, { card, detailHost, mission: m, stars, locked });
    return card;
  }

  _select(id, { scroll } = {}) {
    for (const [mid, entry] of this.cards) {
      const on = mid === id;
      entry.card.classList.toggle("gb-selected", on);
      entry.detailHost.textContent = "";
      if (on) entry.detailHost.appendChild(this._buildDetail(entry.mission, entry.stars));
    }
    this.selectedId = id;
    if (id && scroll) {
      const entry = this.cards.get(id);
      if (entry) entry.card.scrollIntoView({ block: "nearest" });
    }
  }

  _buildDetail(m, stars) {
    const ctx = this.ctx;
    const detail = document.createElement("div");
    detail.className = "gb-career-detail";

    const story = document.createElement("p");
    story.className = "gb-career-story";
    story.textContent = m.story || "";
    detail.appendChild(story);

    const { text, starHint } = describeObjective(m);
    const obj = document.createElement("div");
    obj.className = "gb-career-objective";
    obj.textContent = text;
    detail.appendChild(obj);

    const hint = document.createElement("div");
    hint.className = "gb-career-starhint";
    hint.textContent = starHint;
    detail.appendChild(hint);

    if (m.forcedBuild) {
      const forced = document.createElement("div");
      forced.className = "gb-career-forced";
      const rcv = PARTS[m.forcedBuild.receiver];
      forced.textContent =
        `Mission loadout: ${m.forcedBuild.name || (rcv ? rcv.name : "issued weapon")} (your build is not used)`;
      detail.appendChild(forced);
    }

    if (stars > 0) {
      const replay = document.createElement("div");
      replay.className = "gb-career-replay";
      replay.textContent = "Completed — replays award 25% XP";
      detail.appendChild(replay);
    }

    const start = document.createElement("button");
    start.className = "gb-btn gb-btn-primary gb-career-start";
    start.textContent = "START";
    start.addEventListener("click", () => {
      ctx.audio.play("uiClick");
      this._start(m);
    });
    detail.appendChild(start);

    return detail;
  }

  _start(m) {
    const ctx = this.ctx;
    let build;
    if (m.forcedBuild) {
      build = copyBuild(m.forcedBuild);
    } else {
      const base = ctx.save.loadLastBuild() || DEFAULT_BUILD;
      build = sanitizeBuild(copyBuild(base)).build;
    }
    ctx.manager.goTo(m.mode === "course" ? "course" : "staticRange", {
      build,
      mission: m,
    });
  }

  exit() {
    if (this.root) { this.root.remove(); this.root = null; }
    this.cards = null;
    if (this.scene) disposeScene(this.scene);
    this.scene = null;
    this.camera = null;
  }
}
