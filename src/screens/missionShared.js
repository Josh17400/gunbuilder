// Shared mission/progression plumbing for the gameplay + builder screens.
//
// src/data/progression.js and the save.loadProgress/saveProgress additions are
// owned by a parallel workstream (Addendum v3), so every access here is
// defensive: loadProgression() dynamic-imports the module (null when absent —
// screens then behave exactly like pre-progression builds), and progress
// storage falls back to raw localStorage under the contract key.

import { DEFAULT_BUILD } from "../data/parts.js";
import { sanitizeBuild } from "../data/compat.js";

const PROGRESS_KEY = "gunbuilder.v1.progress";

export function copyBuild(b) {
  return JSON.parse(JSON.stringify(b));
}

// Resolves to the progression module, or null if it hasn't landed / fails to
// load. Callers must treat null as "progression features disabled".
export async function loadProgression() {
  try {
    return await import("../data/progression.js");
  } catch (err) {
    console.warn("missionShared: progression module unavailable", err);
    return null;
  }
}

export function loadProgress(save) {
  if (save && typeof save.loadProgress === "function") {
    const p = save.loadProgress();
    if (p && typeof p === "object") return p;
  } else {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const p = raw ? JSON.parse(raw) : null;
      if (p && typeof p === "object") {
        return {
          xp: typeof p.xp === "number" ? p.xp : 0,
          missions: p.missions && typeof p.missions === "object" ? p.missions : {},
        };
      }
    } catch (err) {
      console.error("missionShared: failed to read progress", err);
    }
  }
  return { xp: 0, missions: {} };
}

export function saveProgress(save, progress) {
  if (save && typeof save.saveProgress === "function") {
    save.saveProgress(progress);
    return;
  }
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.error("missionShared: failed to write progress", err);
  }
}

// Adds XP (and optionally records mission stars), persists, and reports any
// level-up with the names of parts unlocked by the new level(s).
// Returns { level, unlockedNames|null, progress }.
export function grantXp(save, progression, award, missionId = null, stars = 0) {
  const progress = loadProgress(save);
  let before = 1;
  try { before = progression.getLevel(progress.xp).level; } catch (err) {
    console.error("missionShared: getLevel failed", err);
  }
  progress.xp += Math.max(0, Math.round(award) || 0);
  if (missionId) {
    progress.missions = progress.missions || {};
    progress.missions[missionId] = Math.max(progress.missions[missionId] || 0, stars);
  }
  saveProgress(save, progress);

  let after = before;
  try { after = progression.getLevel(progress.xp).level; } catch (err) {
    console.error("missionShared: getLevel failed", err);
  }
  let unlockedNames = null;
  if (after > before) {
    unlockedNames = [];
    for (let l = before + 1; l <= after; l++) {
      let parts = [];
      try { parts = progression.unlocksAt(l) || []; } catch (err) {
        console.error("missionShared: unlocksAt failed", err);
      }
      for (const part of parts) {
        unlockedNames.push((part && (part.name || part.id)) || String(part));
      }
    }
  }
  return { level: after, unlockedNames, progress };
}

// Applies a successful mission result: first completion pays full rewardXp,
// repeats pay 25%. Records max stars. Returns
// { award, first, leveledTo|null, unlockedNames, progress }.
export function completeMission(save, progression, mission, stars) {
  const prior = loadProgress(save);
  const priorStars = (prior.missions && prior.missions[mission.id]) || 0;
  const first = priorStars === 0;
  const award = first ? mission.rewardXp : Math.round(mission.rewardXp * 0.25);
  const res = grantXp(save, progression, award, mission.id, stars);
  return {
    award,
    first,
    leveledTo: res.unlockedNames ? res.level : null,
    unlockedNames: res.unlockedNames || [],
    progress: res.progress,
  };
}

// Free-play course XP per Addendum v3: max(50, round(500 - 5*seconds)).
export function freePlayCourseAward(seconds) {
  return Math.max(50, Math.round(500 - 5 * seconds));
}

// The mission after `mission`, or null if none / not yet unlocked
// (mission n+1 unlocks once mission n has ≥1 star in `progress`).
export function nextMission(progression, mission, progress) {
  let list = [];
  try { list = progression.MISSIONS || []; } catch (_) { /* ignore */ }
  const i = list.findIndex((m) => m && m.id === mission.id);
  if (i < 0 || i + 1 >= list.length) return null;
  const stars = (progress && progress.missions && progress.missions[mission.id]) || 0;
  return stars >= 1 ? list[i + 1] : null;
}

// Launch a mission: forcedBuild wins (and bypasses unlock gating by design),
// otherwise the last build, sanitized. Mirrors the career screen's routing.
export function goToMission(ctx, mission) {
  let build = null;
  if (mission.forcedBuild) {
    build = copyBuild(mission.forcedBuild);
  } else {
    build = copyBuild(ctx.save.loadLastBuild() || DEFAULT_BUILD);
    try {
      const res = sanitizeBuild(build);
      // sanitizeBuild's contract is ambiguous ({build,dropped} vs build) —
      // handle both shapes, same as builderScreen.
      build = (res && res.build) ? res.build : (res || build);
    } catch (err) {
      console.error("missionShared: sanitizeBuild failed", err);
    }
  }
  ctx.manager.goTo(mission.mode === "course" ? "course" : "staticRange", {
    build,
    mission,
  });
}
